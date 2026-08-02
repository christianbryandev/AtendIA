-- ============================================================
-- 006_assinaturas_creditos.sql
-- Ciclo 2: cadastro e cobrança.
--
-- 1. Tabela assinaturas: espelho local do estado do Stripe.
-- 2. Split do saldo: cota mensal (reseta) x avulsos (não expiram).
-- 3. Idempotência dos webhooks do Stripe.
-- 4. Colunas de cadastro (CNPJ e endereço) em restaurantes.
--
-- ⚠️ As RPCs abaixo usam CREATE OR REPLACE mantendo EXATAMENTE a
-- mesma assinatura da 005. Mudar a assinatura criaria uma função
-- nova, e os REVOKE/GRANT da 005 não se aplicariam a ela — o buraco
-- de segurança fechado lá reabriria em silêncio.
--
-- ⚠️ src/database/schema.sql (linha ~155) já define uma tabela
-- `assinaturas` órfã, com formato incompatível com a desta migration
-- (sem stripe_customer_id, stripe_subscription_id, periodo_fim, sem
-- UNIQUE em restaurante_id, sem CHECK de status). Nenhum código
-- TypeScript a referencia, mas se schema.sql já foi aplicado direto
-- no Supabase em algum momento, a tabela existe nesse formato antigo
-- e o `CREATE TABLE IF NOT EXISTS` abaixo seria um no-op silencioso.
-- Por isso a seção 4 abre com um bloco DO $$ que detecta e trata esse
-- cenário antes de criar a tabela.
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUNAS DE CADASTRO
-- ------------------------------------------------------------
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS cnpj VARCHAR(14);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS cep VARCHAR(8);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS numero VARCHAR(20);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS complemento VARCHAR(100);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS bairro VARCHAR(100);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS cidade VARCHAR(100);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS uf CHAR(2);

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurantes_cnpj
  ON restaurantes(cnpj) WHERE cnpj IS NOT NULL;

COMMENT ON COLUMN restaurantes.cnpj IS 'Somente dígitos, sem pontuação. Validado pelos dígitos verificadores na aplicação.';

-- ------------------------------------------------------------
-- 2. SPLIT DO SALDO DE CRÉDITOS
-- ------------------------------------------------------------
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS creditos_cota INT NOT NULL DEFAULT 0;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS creditos_avulsos INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN restaurantes.creditos_cota IS 'Cota mensal do plano. Reseta para 10000 a cada invoice.paid. Sobra não acumula.';
COMMENT ON COLUMN restaurantes.creditos_avulsos IS 'Pacotes comprados à parte. Nunca expiram. Consumidos só depois que a cota zera.';

-- Migra o saldo existente para a cota, para ninguém perder crédito.
UPDATE restaurantes
SET creditos_cota = COALESCE(creditos_disponiveis, 0)
WHERE creditos_cota = 0 AND COALESCE(creditos_disponiveis, 0) > 0;

-- creditos_disponiveis fica na tabela por ora, sem uso, para o caso de
-- ser preciso auditar a migração. Removida numa migration futura.

-- ------------------------------------------------------------
-- 3. RASTRO DE ORIGEM NO LOG DE CONSUMO
-- ------------------------------------------------------------
-- Sem isso o reembolso não sabe de qual balde debitou, e devolver um
-- crédito avulso para a cota faria o lojista perder na virada do mês
-- algo que ele pagou.
ALTER TABLE creditos_ia ADD COLUMN IF NOT EXISTS origem VARCHAR(10);
ALTER TABLE creditos_ia ADD COLUMN IF NOT EXISTS estornado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN creditos_ia.origem IS 'cota | avulso | misto — de qual saldo o consumo saiu.';

CREATE INDEX IF NOT EXISTS idx_creditos_ia_pendente_estorno
  ON creditos_ia(restaurante_id, created_at DESC)
  WHERE estornado = FALSE AND creditos_consumidos > 0;

-- ------------------------------------------------------------
-- 4. TABELA DE ASSINATURAS
-- ------------------------------------------------------------
-- ⚠️ Trava de compatibilidade com a tabela órfã do schema.sql.
--
-- src/database/schema.sql (linha ~155) define uma `assinaturas` bem
-- mais simples (sem stripe_customer_id/stripe_subscription_id, sem
-- periodo_fim, sem UNIQUE em restaurante_id, sem CHECK de status).
-- Nada em src/ referencia essa tabela — provavelmente nunca foi
-- usada —, mas se schema.sql já foi rodado manualmente no Supabase em
-- algum momento, a tabela existe com esse formato antigo. Nesse caso
-- o `CREATE TABLE IF NOT EXISTS` logo abaixo seria um no-op: a tabela
-- ficaria pra sempre sem as colunas do Stripe, e tudo que o ciclo 2
-- constrói em cima dela quebraria em produção sem erro nenhum na
-- aplicação desta migration.
--
-- Este bloco decide o que fazer olhando o formato real da tabela:
--   - formato antigo (sem stripe_customer_id) e vazia  -> dropa, e o
--     CREATE TABLE IF NOT EXISTS abaixo recria no formato novo.
--   - formato antigo e com linhas -> RAISE EXCEPTION. Preferimos
--     falhar ruidosamente aqui a apagar dado de cobrança em silêncio;
--     quem aplicar a migration decide manualmente como migrar.
--   - formato novo (já tem stripe_customer_id) -> não faz nada, a
--     migration segue idempotente.
--   - tabela não existe -> não faz nada, o CREATE TABLE abaixo cria.
DO $$
DECLARE
  v_tabela_existe BOOLEAN;
  v_formato_novo BOOLEAN;
  v_qtd_linhas BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'assinaturas'
  ) INTO v_tabela_existe;

  IF v_tabela_existe THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'assinaturas'
        AND column_name = 'stripe_customer_id'
    ) INTO v_formato_novo;

    IF NOT v_formato_novo THEN
      EXECUTE 'SELECT count(*) FROM public.assinaturas' INTO v_qtd_linhas;

      IF v_qtd_linhas = 0 THEN
        EXECUTE 'DROP TABLE public.assinaturas';
      ELSE
        RAISE EXCEPTION
          'A tabela public.assinaturas existe no formato ANTIGO (do schema.sql, sem stripe_customer_id) e contém % linha(s) de dados. '
          'A migration 006 não vai apagar dados de cobrança automaticamente. '
          'Decida manualmente como migrar essas linhas para o formato novo (com stripe_customer_id, stripe_subscription_id, periodo_fim, cancelada_em) '
          'e então rode esta migration novamente.',
          v_qtd_linhas;
      END IF;
    END IF;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS assinaturas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID NOT NULL UNIQUE REFERENCES restaurantes(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pendente'
      CHECK (status IN ('pendente', 'ativa', 'inadimplente', 'cancelada', 'reembolsada')),
    periodo_fim TIMESTAMP WITH TIME ZONE,
    cancelada_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_customer ON assinaturas(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_subscription ON assinaturas(stripe_subscription_id);

ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assinaturas_isolation_policy ON assinaturas;
CREATE POLICY assinaturas_isolation_policy ON assinaturas
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- ------------------------------------------------------------
-- 5. IDEMPOTÊNCIA DOS WEBHOOKS DO STRIPE
-- ------------------------------------------------------------
-- O Stripe reenvia o evento quando não recebe 200. Sem esta tabela,
-- um reenvio de checkout.session.completed credita 10.000 duas vezes.
CREATE TABLE IF NOT EXISTS stripe_eventos_processados (
    event_id VARCHAR(255) PRIMARY KEY,
    tipo VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE stripe_eventos_processados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_eventos_policy ON stripe_eventos_processados;
CREATE POLICY stripe_eventos_policy ON stripe_eventos_processados
    FOR ALL
    USING (current_setting('role') = 'service_role');

-- ------------------------------------------------------------
-- 6. CONSUMO: COTA PRIMEIRO, AVULSO DEPOIS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION consumir_creditos_ia(
  p_restaurante_id UUID,
  p_qtd INT,
  p_tipo VARCHAR
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cota INT;
  v_avulso INT;
  v_da_cota INT;
  v_do_avulso INT;
  v_origem VARCHAR(10);
BEGIN
  IF current_setting('role') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  -- Preserva a validação da 005: p_qtd negativo faria o UPDATE abaixo
  -- CREDITAR em vez de debitar, reabrindo a vulnerabilidade que a 005
  -- fechou.
  IF p_qtd IS NULL OR p_qtd <= 0 THEN
    RAISE EXCEPTION 'Quantidade de créditos deve ser positiva (recebido: %)', p_qtd;
  END IF;

  SELECT creditos_cota, creditos_avulsos
    INTO v_cota, v_avulso
  FROM restaurantes
  WHERE id = p_restaurante_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF (v_cota + v_avulso) < p_qtd THEN
    RETURN FALSE;
  END IF;

  v_da_cota := LEAST(v_cota, p_qtd);
  v_do_avulso := p_qtd - v_da_cota;

  IF v_do_avulso = 0 THEN
    v_origem := 'cota';
  ELSIF v_da_cota = 0 THEN
    v_origem := 'avulso';
  ELSE
    v_origem := 'misto';
  END IF;

  UPDATE restaurantes
  SET creditos_cota = creditos_cota - v_da_cota,
      creditos_avulsos = creditos_avulsos - v_do_avulso
  WHERE id = p_restaurante_id;

  INSERT INTO creditos_ia (restaurante_id, tipo_evento, creditos_consumidos, origem)
  VALUES (p_restaurante_id, p_tipo, p_qtd, v_origem);

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------
-- 7. REEMBOLSO: VOLTA PARA O BALDE DE ONDE SAIU
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reembolsar_creditos_ia(
  p_restaurante_id UUID,
  p_qtd INT,
  p_tipo VARCHAR,
  p_motivo TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_log_id UUID;
  v_origem VARCHAR(10);
BEGIN
  IF current_setting('role') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  -- Mesma validação da 005: sem isso um p_qtd negativo debitaria saldo
  -- sob o disfarce de um reembolso.
  IF p_qtd IS NULL OR p_qtd <= 0 THEN
    RAISE EXCEPTION 'Quantidade de reembolso deve ser positiva (recebido: %)', p_qtd;
  END IF;

  PERFORM id FROM restaurantes WHERE id = p_restaurante_id FOR UPDATE;

  -- Reembolso sempre segue um consumo que acabou de acontecer na mesma
  -- requisição, então o débito mais recente ainda não estornado é o
  -- alvo certo.
  SELECT id, origem
    INTO v_log_id, v_origem
  FROM creditos_ia
  WHERE restaurante_id = p_restaurante_id
    AND estornado = FALSE
    AND creditos_consumidos > 0
  ORDER BY created_at DESC
  LIMIT 1;

  -- Sem débito correspondente (caso não esperado), devolve para a cota:
  -- é o balde conservador, porque expira.
  IF v_origem IS NULL THEN
    v_origem := 'cota';
  END IF;

  IF v_origem = 'avulso' THEN
    UPDATE restaurantes
    SET creditos_avulsos = creditos_avulsos + p_qtd
    WHERE id = p_restaurante_id;
  ELSE
    -- 'cota' e 'misto' voltam para a cota. Devolver misto inteiro para a
    -- cota erra por no máximo alguns créditos e sempre a favor do
    -- lojista no curto prazo; rastrear a divisão exata não paga o custo.
    UPDATE restaurantes
    SET creditos_cota = creditos_cota + p_qtd
    WHERE id = p_restaurante_id;
  END IF;

  IF v_log_id IS NOT NULL THEN
    UPDATE creditos_ia SET estornado = TRUE WHERE id = v_log_id;
  END IF;

  INSERT INTO creditos_ia (restaurante_id, tipo_evento, creditos_consumidos, motivo_reembolso, origem, estornado)
  VALUES (p_restaurante_id, p_tipo, -p_qtd, p_motivo, v_origem, TRUE);
END;
$$;

-- ------------------------------------------------------------
-- 8. CRÉDITO DE COTA E DE PACOTE (chamadas pelo webhook do Stripe)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resetar_cota_mensal(
  p_restaurante_id UUID,
  p_qtd INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('role') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  -- Reseta, não soma: a cota é mensal e sobra não acumula.
  UPDATE restaurantes
  SET creditos_cota = p_qtd
  WHERE id = p_restaurante_id;
END;
$$;

CREATE OR REPLACE FUNCTION creditar_pacote_avulso(
  p_restaurante_id UUID,
  p_qtd INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('role') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE restaurantes
  SET creditos_avulsos = creditos_avulsos + p_qtd
  WHERE id = p_restaurante_id;
END;
$$;

-- ------------------------------------------------------------
-- 9. PERMISSÕES (repete o padrão da 005 para as funções novas)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION resetar_cota_mensal(UUID, INT)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION creditar_pacote_avulso(UUID, INT)  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION resetar_cota_mensal(UUID, INT)      TO service_role;
GRANT EXECUTE ON FUNCTION creditar_pacote_avulso(UUID, INT)   TO service_role;

-- ============================================================
-- 009_mensagens_conversas.sql
-- Ciclo 3: fundação do atendimento.
--
-- Hoje o webhook recebe a mensagem, manda para a IA, responde e
-- descarta. Nada é guardado. Isso impede três coisas ao mesmo tempo:
-- a caixa de entrada, a memória da IA (que responde cada mensagem
-- isoladamente) e o controle da janela de 24 horas da Meta.
--
-- Duas tabelas em vez de uma: a caixa de entrada precisa listar 50
-- conversas sem varrer 10 mil mensagens, e o webhook precisa saber se
-- a IA está pausada sem ler histórico nenhum.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    telefone_cliente VARCHAR(30) NOT NULL,

    -- Marco da janela de 24h da Meta. Só mensagem DO CLIENTE reabre a
    -- janela; resposta nossa não conta.
    ultima_mensagem_cliente_em TIMESTAMP WITH TIME ZONE,

    -- Ordena a lista da caixa de entrada.
    ultima_mensagem_em TIMESTAMP WITH TIME ZONE,

    sob_controle_humano BOOLEAN NOT NULL DEFAULT FALSE,
    controle_assumido_em TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE (restaurante_id, telefone_cliente)
);

CREATE INDEX IF NOT EXISTS idx_conversas_lista
  ON conversas(restaurante_id, ultima_mensagem_em DESC);

CREATE TABLE IF NOT EXISTS mensagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    telefone_cliente VARCHAR(30) NOT NULL,

    direcao VARCHAR(10) NOT NULL CHECK (direcao IN ('recebida', 'enviada')),
    autor VARCHAR(10) NOT NULL CHECK (autor IN ('cliente', 'ia', 'lojista')),

    tipo VARCHAR(10) NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'audio')),
    texto TEXT,
    transcricao TEXT,
    audio_url TEXT,

    whatsapp_message_id VARCHAR(255),

    -- 'enviando' cobre o instante entre gravar e a Meta confirmar: a
    -- mensagem aparece na tela do lojista antes de sair de fato.
    status VARCHAR(15) NOT NULL DEFAULT 'ok'
      CHECK (status IN ('ok', 'enviando', 'falha')),
    erro_envio TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa
  ON mensagens(restaurante_id, telefone_cliente, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mensagens_whatsapp_id
  ON mensagens(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- Estas duas tabelas são as PRIMEIRAS que o navegador vai ler direto,
-- via Supabase Realtime, sem passar pela nossa API. A policy é a única
-- coisa impedindo um restaurante de ver a conversa de outro.
ALTER TABLE conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversas_isolation_policy ON conversas;
CREATE POLICY conversas_isolation_policy ON conversas
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

DROP POLICY IF EXISTS mensagens_isolation_policy ON mensagens;
CREATE POLICY mensagens_isolation_policy ON mensagens
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- Trigger de updated_at, idempotente. A função é criada
-- defensivamente porque um banco montado só pelas migrations não a tem.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversas_modtime ON conversas;
CREATE TRIGGER update_conversas_modtime
  BEFORE UPDATE ON conversas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- Publicação do Realtime
-- ------------------------------------------------------------
-- Sem isto o navegador assina o canal e nunca recebe nada.
--
-- O Postgres não aceita IF NOT EXISTS em ALTER PUBLICATION, e reaplicar
-- a migration daria erro. O bloco DO consulta pg_publication_tables
-- antes, mantendo a migration idempotente como as anteriores.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversas;
  END IF;
END
$$;

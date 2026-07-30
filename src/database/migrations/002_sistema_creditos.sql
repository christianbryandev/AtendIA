-- 1. Adicionar campo de saldo na tabela de restaurantes
ALTER TABLE restaurantes 
ADD COLUMN IF NOT EXISTS creditos_disponiveis INT DEFAULT 0;

-- 2. Tabela de histórico de consumo de IA
CREATE TABLE IF NOT EXISTS creditos_ia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
    tipo_evento VARCHAR(20) NOT NULL, -- 'texto', 'audio', 'reembolso'
    creditos_consumidos INT NOT NULL, -- Valores negativos indicam reembolso
    motivo_reembolso TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creditos_ia_restaurante ON creditos_ia(restaurante_id);

-- 3. Tabela de controle de idempotência de Webhooks (WhatsApp)
CREATE TABLE IF NOT EXISTS webhook_eventos_processados (
    message_id VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS na tabela creditos_ia e idempotência
ALTER TABLE creditos_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_eventos_processados ENABLE ROW LEVEL SECURITY;

-- Política RLS para creditos_ia (tenant isolation)
CREATE POLICY creditos_ia_isolation_policy ON creditos_ia
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- Política RLS para webhook (só acessada pela service role)
CREATE POLICY webhook_eventos_policy ON webhook_eventos_processados
    FOR ALL
    USING (current_setting('role') = 'service_role');


-- 4. Função RPC para Consumir Créditos (Transação Segura)
CREATE OR REPLACE FUNCTION consumir_creditos_ia(
  p_restaurante_id UUID,
  p_qtd INT,
  p_tipo VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_saldo_atual INT;
BEGIN
  -- Trava a linha do restaurante (FOR UPDATE)
  SELECT creditos_disponiveis INTO v_saldo_atual 
  FROM restaurantes 
  WHERE id = p_restaurante_id FOR UPDATE;

  -- Checa saldo
  IF v_saldo_atual < p_qtd THEN
    RETURN FALSE;
  END IF;

  -- Decrementa saldo
  UPDATE restaurantes 
  SET creditos_disponiveis = creditos_disponiveis - p_qtd 
  WHERE id = p_restaurante_id;

  -- Grava log do consumo
  INSERT INTO creditos_ia (restaurante_id, tipo_evento, creditos_consumidos)
  VALUES (p_restaurante_id, p_tipo, p_qtd);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


-- 5. Função RPC para Reembolso de Créditos
CREATE OR REPLACE FUNCTION reembolsar_creditos_ia(
  p_restaurante_id UUID,
  p_qtd INT,
  p_tipo VARCHAR,
  p_motivo TEXT
) RETURNS VOID AS $$
BEGIN
  -- Trava a linha do restaurante (FOR UPDATE)
  PERFORM id 
  FROM restaurantes 
  WHERE id = p_restaurante_id FOR UPDATE;

  -- Devolve o saldo
  UPDATE restaurantes 
  SET creditos_disponiveis = creditos_disponiveis + p_qtd 
  WHERE id = p_restaurante_id;

  -- Grava log de estorno (créditos negativos = devolução)
  INSERT INTO creditos_ia (restaurante_id, tipo_evento, creditos_consumidos, motivo_reembolso)
  VALUES (p_restaurante_id, p_tipo, -p_qtd, p_motivo);
END;
$$ LANGUAGE plpgsql;

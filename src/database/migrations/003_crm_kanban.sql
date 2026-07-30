-- 1. Criação do Enum para os Estágios do Pipeline
CREATE TYPE estagio_pipeline_enum AS ENUM (
    'novo_contato',
    'pedido_em_andamento',
    'cliente_ativo',
    'vip_recorrente',
    'em_risco'
);

-- 2. Alteração na tabela clientes_crm
ALTER TABLE clientes_crm 
ADD COLUMN IF NOT EXISTS estagio_pipeline estagio_pipeline_enum DEFAULT 'novo_contato',
ADD COLUMN IF NOT EXISTS problema_ativo BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bloqueio_cron_manual BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ultima_mensagem_em TIMESTAMP WITH TIME ZONE;

-- 3. Tabela historico_crm para rastreabilidade do funil
CREATE TABLE IF NOT EXISTS historico_crm (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes_crm(id) ON DELETE CASCADE,
    estagio_anterior estagio_pipeline_enum,
    estagio_novo estagio_pipeline_enum NOT NULL,
    motivo VARCHAR(50) NOT NULL CHECK (motivo IN ('evento_pedido', 'cron_inatividade', 'manual_lojista')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_crm_cliente ON historico_crm(cliente_id);

-- Habilitar RLS e criar política de isolamento de tenant
ALTER TABLE historico_crm ENABLE ROW LEVEL SECURITY;

CREATE POLICY historico_crm_isolation_policy ON historico_crm
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM clientes_crm c
            WHERE c.id = historico_crm.cliente_id
            AND c.restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        )
        OR current_setting('role') = 'service_role'
    );

-- 4. Função RPC do Cron para Rebaixar em Massa e Gerar Histórico Atômico
CREATE OR REPLACE FUNCTION processar_cron_inatividade()
RETURNS INT AS $$
DECLARE
    v_total_movidos INT := 0;
    r RECORD;
BEGIN
    FOR r IN 
        SELECT id, estagio_pipeline FROM clientes_crm 
        WHERE ultimo_pedido_at < NOW() - INTERVAL '30 days'
        AND estagio_pipeline NOT IN ('pedido_em_andamento', 'em_risco')
        AND bloqueio_cron_manual = false
        FOR UPDATE
    LOOP
        -- Atualiza o estágio
        UPDATE clientes_crm 
        SET estagio_pipeline = 'em_risco'
        WHERE id = r.id;

        -- Log da transição
        INSERT INTO historico_crm (cliente_id, estagio_anterior, estagio_novo, motivo)
        VALUES (r.id, r.estagio_pipeline, 'em_risco', 'cron_inatividade');
        
        v_total_movidos := v_total_movidos + 1;
    END LOOP;

    RETURN v_total_movidos;
END;
$$ LANGUAGE plpgsql;

-- 5. Função RPC para o Gatilho 3 (Pedido Concluído) ser 100% atômico
CREATE OR REPLACE FUNCTION atualizar_pedido_concluido(p_cliente_id UUID, p_valor_total NUMERIC)
RETURNS VOID AS $$
DECLARE
    v_estagio_atual estagio_pipeline_enum;
    v_novo_estagio estagio_pipeline_enum;
    v_total_pedidos INT;
BEGIN
    -- Seleciona e trava a linha
    SELECT estagio_pipeline, total_pedidos INTO v_estagio_atual, v_total_pedidos
    FROM clientes_crm
    WHERE id = p_cliente_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Lógica de promoção
    IF (v_total_pedidos + 1) >= 10 THEN
        v_novo_estagio := 'vip_recorrente'::estagio_pipeline_enum;
    ELSE
        v_novo_estagio := 'cliente_ativo'::estagio_pipeline_enum;
    END IF;

    -- Atualiza tudo numa tacada
    UPDATE clientes_crm 
    SET total_pedidos = total_pedidos + 1,
        valor_total_gasto = valor_total_gasto + p_valor_total,
        estagio_pipeline = v_novo_estagio,
        bloqueio_cron_manual = false,
        ultimo_pedido_at = NOW()
    WHERE id = p_cliente_id;

    -- Registra no histórico se houve mudança de estágio
    IF v_estagio_atual IS DISTINCT FROM v_novo_estagio THEN
        INSERT INTO historico_crm (cliente_id, estagio_anterior, estagio_novo, motivo)
        VALUES (p_cliente_id, v_estagio_atual, v_novo_estagio, 'evento_pedido');
    END IF;
END;
$$ LANGUAGE plpgsql;

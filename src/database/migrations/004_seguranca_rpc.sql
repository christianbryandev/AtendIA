-- 1. Função RPC do Cron para Rebaixar em Massa e Gerar Histórico Atômico (com hardening)
CREATE OR REPLACE FUNCTION processar_cron_inatividade()
RETURNS INT AS $$
DECLARE
    v_total_movidos INT := 0;
    r RECORD;
BEGIN
    IF current_setting('role', true) <> 'service_role' THEN
        RAISE EXCEPTION 'Acesso negado: função administrativa';
    END IF;

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

-- 2. Função RPC para o Gatilho 3 (Pedido Concluído) ser 100% atômico (com hardening)
CREATE OR REPLACE FUNCTION atualizar_pedido_concluido(p_cliente_id UUID, p_valor_total NUMERIC)
RETURNS VOID AS $$
DECLARE
    v_estagio_atual estagio_pipeline_enum;
    v_novo_estagio estagio_pipeline_enum;
    v_total_pedidos INT;
BEGIN
    IF current_setting('role', true) <> 'service_role' THEN
        RAISE EXCEPTION 'Acesso negado: função administrativa';
    END IF;

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

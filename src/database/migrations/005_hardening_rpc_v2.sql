-- ============================================================
-- 005_hardening_rpc_v2.sql
-- Fecha o bypass de faturamento nas RPCs de crédito e adiciona
-- isolamento de tenant explícito na RPC de conclusão de pedido.
-- ============================================================
--
-- CONTEXTO DA VULNERABILIDADE CORRIGIDA AQUI:
-- O Postgres concede EXECUTE a PUBLIC por padrão, e o Supabase expõe
-- toda função do schema public como POST /rest/v1/rpc/<nome>. Como o
-- login emite um JWT Supabase legítimo (role: authenticated) que fica
-- no navegador, qualquer assinante logado podia chamar
-- reembolsar_creditos_ia direto no PostgREST e se dar créditos
-- ilimitados. O guard de role dentro do corpo da função (migration 004)
-- nunca chegou a ser aplicado nas funções de crédito.
--
-- A defesa real é o REVOKE de EXECUTE; o guard no corpo é redundância.
--
-- ⚠️ NÃO usar "REVOKE ... ON ALL FUNCTIONS IN SCHEMA public": isso
-- atingiria uuid_generate_v4(), que é DEFAULT de PRIMARY KEY em 12
-- tabelas. DEFAULTs de coluna são avaliados com a permissão de quem
-- faz o INSERT, então a revogação em massa derrubaria todo INSERT de
-- usuário autenticado. A revogação abaixo é função por função.
-- ============================================================


-- ------------------------------------------------------------
-- 1. consumir_creditos_ia — guard de role + rejeição de qtd <= 0
-- ------------------------------------------------------------
-- p_qtd negativo faria "creditos_disponiveis - (-100)" CREDITAR a conta,
-- transformando a função de débito numa função de recarga.
CREATE OR REPLACE FUNCTION consumir_creditos_ia(
  p_restaurante_id UUID,
  p_qtd INT,
  p_tipo VARCHAR
) RETURNS BOOLEAN
SET search_path = public, pg_temp
AS $$
DECLARE
  v_saldo_atual INT;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: função administrativa';
  END IF;

  IF p_qtd IS NULL OR p_qtd <= 0 THEN
    RAISE EXCEPTION 'Quantidade de créditos deve ser positiva (recebido: %)', p_qtd;
  END IF;

  -- Trava a linha do restaurante (FOR UPDATE)
  SELECT creditos_disponiveis INTO v_saldo_atual
  FROM restaurantes
  WHERE id = p_restaurante_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

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


-- ------------------------------------------------------------
-- 2. reembolsar_creditos_ia — guard de role + rejeição de qtd <= 0
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reembolsar_creditos_ia(
  p_restaurante_id UUID,
  p_qtd INT,
  p_tipo VARCHAR,
  p_motivo TEXT
) RETURNS VOID
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: função administrativa';
  END IF;

  IF p_qtd IS NULL OR p_qtd <= 0 THEN
    RAISE EXCEPTION 'Quantidade de reembolso deve ser positiva (recebido: %)', p_qtd;
  END IF;

  -- Trava a linha do restaurante (FOR UPDATE)
  PERFORM id
  FROM restaurantes
  WHERE id = p_restaurante_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Devolve o saldo
  UPDATE restaurantes
  SET creditos_disponiveis = creditos_disponiveis + p_qtd
  WHERE id = p_restaurante_id;

  -- Grava log de estorno (créditos negativos = devolução)
  INSERT INTO creditos_ia (restaurante_id, tipo_evento, creditos_consumidos, motivo_reembolso)
  VALUES (p_restaurante_id, p_tipo, -p_qtd, p_motivo);
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 3. atualizar_pedido_concluido — passa a exigir o tenant
-- ------------------------------------------------------------
-- A função roda sob service_role (BYPASSRLS) e recebia apenas o
-- cliente_id: todo o isolamento dependia do chamador ter validado o
-- pedido antes. Agora o tenant é validado dentro da própria função.
--
-- DROP explícito é obrigatório: acrescentar um parâmetro cria uma
-- SOBRECARGA, deixando a assinatura antiga e vulnerável no banco.
DROP FUNCTION IF EXISTS atualizar_pedido_concluido(UUID, NUMERIC);

-- CREATE OR REPLACE (e não CREATE puro) para a migration ser idempotente:
-- rodada uma segunda vez, o DROP acima vira no-op porque a assinatura
-- antiga já não existe, e um CREATE puro falharia com "function already
-- exists with same argument types" — dando a falsa impressão de que a
-- migration não havia sido aplicada.
CREATE OR REPLACE FUNCTION atualizar_pedido_concluido(
    p_cliente_id UUID,
    p_restaurante_id UUID,
    p_valor_total NUMERIC
)
RETURNS VOID
SET search_path = public, pg_temp
AS $$
DECLARE
    v_estagio_atual estagio_pipeline_enum;
    v_novo_estagio estagio_pipeline_enum;
    v_total_pedidos INT;
BEGIN
    IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Acesso negado: função administrativa';
    END IF;

    -- Seleciona e trava a linha, escopada ao tenant
    SELECT estagio_pipeline, total_pedidos INTO v_estagio_atual, v_total_pedidos
    FROM clientes_crm
    WHERE id = p_cliente_id
      AND restaurante_id = p_restaurante_id
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
    WHERE id = p_cliente_id
      AND restaurante_id = p_restaurante_id;

    -- Registra no histórico se houve mudança de estágio
    IF v_estagio_atual IS DISTINCT FROM v_novo_estagio THEN
        INSERT INTO historico_crm (cliente_id, estagio_anterior, estagio_novo, motivo)
        VALUES (p_cliente_id, v_estagio_atual, v_novo_estagio, 'evento_pedido');
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 4. processar_cron_inatividade — apenas search_path
-- ------------------------------------------------------------
-- O guard de role já veio na migration 004; aqui só fixamos o
-- search_path para impedir sequestro de resolução de nomes.
CREATE OR REPLACE FUNCTION processar_cron_inatividade()
RETURNS INT
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_movidos INT := 0;
    r RECORD;
BEGIN
    IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Acesso negado: função administrativa';
    END IF;

    FOR r IN
        SELECT id, estagio_pipeline FROM clientes_crm
        WHERE ultimo_pedido_at < NOW() - INTERVAL '30 days'
        AND estagio_pipeline NOT IN ('pedido_em_andamento', 'em_risco')
        AND bloqueio_cron_manual = false
        FOR UPDATE
    LOOP
        UPDATE clientes_crm
        SET estagio_pipeline = 'em_risco'
        WHERE id = r.id;

        INSERT INTO historico_crm (cliente_id, estagio_anterior, estagio_novo, motivo)
        VALUES (r.id, r.estagio_pipeline, 'em_risco', 'cron_inatividade');

        v_total_movidos := v_total_movidos + 1;
    END LOOP;

    RETURN v_total_movidos;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 5. A DEFESA PRINCIPAL: revogar EXECUTE dos papéis expostos na web
-- ------------------------------------------------------------
-- Sem isto, as funções continuam alcançáveis via /rest/v1/rpc/ e a
-- única barreira seria o RAISE EXCEPTION dentro do corpo.
REVOKE EXECUTE ON FUNCTION consumir_creditos_ia(UUID, INT, VARCHAR)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION reembolsar_creditos_ia(UUID, INT, VARCHAR, TEXT)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION atualizar_pedido_concluido(UUID, UUID, NUMERIC)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION processar_cron_inatividade()                      FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION consumir_creditos_ia(UUID, INT, VARCHAR)           TO service_role;
GRANT EXECUTE ON FUNCTION reembolsar_creditos_ia(UUID, INT, VARCHAR, TEXT)   TO service_role;
GRANT EXECUTE ON FUNCTION atualizar_pedido_concluido(UUID, UUID, NUMERIC)    TO service_role;
GRANT EXECUTE ON FUNCTION processar_cron_inatividade()                       TO service_role;


-- ============================================================
-- COMO VALIDAR ESTA MIGRATION NO SQL EDITOR DO SUPABASE
-- ============================================================
-- As funções agora EXIGEM role = 'service_role'. Rodando como postgres
-- no SQL Editor, current_setting('role') retorna 'none' e a função
-- levanta exceção — isso é o comportamento correto, não um erro da
-- migration. Para testar de verdade, simule cada papel:
--
-- -- (a) Deve FALHAR com "permission denied for function":
-- SET LOCAL ROLE authenticated;
-- SELECT reembolsar_creditos_ia('<uuid-restaurante>', 999, 'texto', 'teste');
-- RESET ROLE;
--
-- -- (b) Deve FUNCIONAR:
-- SET LOCAL ROLE service_role;
-- SELECT consumir_creditos_ia('<uuid-restaurante>', 1, 'texto');
-- RESET ROLE;
--
-- -- (c) Confirmar que a sobrecarga antiga de 2 args sumiu (espera 1 linha):
-- SELECT p.oid::regprocedure
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'atualizar_pedido_concluido';
-- ============================================================

-- ============================================================
-- 007_debito_pacote_avulso.sql
-- Ciclo 2: cadastro e cobrança.
--
-- Reembolso de pacote avulso (Stripe: charge.refunded com
-- metadata.pacote_id) devolve o dinheiro ao lojista, mas até aqui não
-- retirava os créditos correspondentes de creditos_avulsos. Decisão de
-- negócio: um reembolso de pacote deve debitar do saldo avulso a
-- quantidade de créditos daquele pacote.
--
-- ⚠️ Segue o MESMO padrão de segurança das RPCs da migration 006:
-- SECURITY DEFINER, SET search_path = public, pg_temp, guard de role
-- no corpo, e o par REVOKE ... FROM PUBLIC, anon, authenticated /
-- GRANT ... TO service_role. Esquecer o REVOKE reabriria pelo
-- PostgREST o mesmo caminho de manipulação direta de saldo que a
-- migration 005 fechou.
-- ============================================================

CREATE OR REPLACE FUNCTION debitar_pacote_avulso(
  p_restaurante_id UUID,
  p_qtd INT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_avulso INT;
  v_debitado INT;
BEGIN
  -- Mesma forma da 005/006: current_setting('role', true) devolve NULL
  -- em vez de erro quando o GUC não está definido, e IS DISTINCT FROM
  -- trata esse NULL como diferente. Com `<> 'service_role'` a
  -- comparação viraria NULL e o IF não dispararia — o guard passaria
  -- batido.
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: função administrativa';
  END IF;

  -- Mesma validação das outras RPCs de crédito: p_qtd nulo ou não
  -- positivo não faz sentido para um débito de reembolso.
  IF p_qtd IS NULL OR p_qtd <= 0 THEN
    RAISE EXCEPTION 'Quantidade a debitar deve ser positiva (recebido: %)', p_qtd;
  END IF;

  -- Trava a linha, como as outras funções de crédito fazem, para uma
  -- corrida com consumir_creditos_ia ou creditar_pacote_avulso não
  -- calcular o débito em cima de um saldo já desatualizado.
  SELECT creditos_avulsos
    INTO v_avulso
  FROM restaurantes
  WHERE id = p_restaurante_id
  FOR UPDATE;

  -- Restaurante inexistente é falha ruidosa, não no-op: um
  -- restaurante_id errado aqui significaria um reembolso processado
  -- sem o débito correspondente ser feito em lugar nenhum, em
  -- silêncio.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurante % não encontrado ao debitar pacote avulso.', p_restaurante_id;
  END IF;

  -- Nunca deixa o saldo negativo: debita no máximo o que existe. Se o
  -- lojista já consumiu parte dos créditos do pacote, debita só o que
  -- sobrou e para em zero — o restante fica para o chamador logar
  -- como perda (para decidir se vale cobrar a diferença manualmente).
  v_debitado := LEAST(GREATEST(v_avulso, 0), p_qtd);

  UPDATE restaurantes
  SET creditos_avulsos = creditos_avulsos - v_debitado
  WHERE id = p_restaurante_id;

  -- Devolve quanto foi de fato debitado, para o chamador poder
  -- calcular e logar a diferença (p_qtd - v_debitado) perdida por
  -- saldo insuficiente.
  RETURN v_debitado;
END;
$$;

-- ------------------------------------------------------------
-- PERMISSÕES (mesmo padrão da 005/006)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION debitar_pacote_avulso(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION debitar_pacote_avulso(UUID, INT) TO service_role;

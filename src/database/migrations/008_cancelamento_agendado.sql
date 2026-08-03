-- ============================================================
-- 008_cancelamento_agendado.sql
-- Ciclo 2: cadastro e cobrança.
--
-- Quando o lojista cancela a assinatura pelo Customer Portal do
-- Stripe, o padrão é o cancelamento ser AGENDADO para o fim do
-- período já pago, não imediato: a subscription continua `active`,
-- ganha `cancel_at` (quando vai terminar) e `canceled_at` (quando foi
-- pedido), e o Stripe emite customer.subscription.updated — não
-- customer.subscription.deleted, que só dispara na data marcada.
--
-- Esta coluna guarda essa data para o painel poder avisar o lojista,
-- em vez de continuar dizendo só "Ativa" até o acesso cair de
-- surpresa. Idempotente, como as demais migrations deste projeto.
-- ============================================================

ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS cancelamento_agendado_para TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN assinaturas.cancelamento_agendado_para IS 'Data em que a assinatura vai terminar, quando o lojista cancelou pelo Customer Portal (cancelamento agendado, nao imediato). NULL quando nao ha cancelamento agendado.';

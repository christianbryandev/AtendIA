-- ============================================================
-- 010_tokens_recuperacao.sql
-- Ciclo 3: recuperação de senha e aviso de cota esgotada por e-mail.
--
-- 1. Tabela tokens_recuperacao: guarda o HASH do token de "esqueci
--    minha senha", nunca o token em si — mesmo princípio de
--    senha_hash em usuarios. Quem ler o banco (um dump, um backup
--    vazado) não consegue usar os links pendentes para assumir uma
--    conta.
-- 2. Coluna restaurantes.aviso_cota_esgotada_periodo_fim: trava de
--    "um e-mail de cota esgotada por ciclo de cobrança" (pendência do
--    ciclo 2, ligada nesta task junto com o Resend).
-- ============================================================

-- ------------------------------------------------------------
-- 1. TOKENS DE RECUPERAÇÃO DE SENHA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens_recuperacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

    -- SHA-256 do token em hexadecimal (64 caracteres). O token em si só
    -- existe no e-mail enviado ao lojista e nunca é gravado no banco.
    token_hash TEXT NOT NULL,

    expira_em TIMESTAMP WITH TIME ZONE NOT NULL,

    -- NULL enquanto pendente. Marcado no consumo, para o token virar
    -- uso único — sem isso o link do e-mail funcionaria como senha
    -- permanente, reutilizável a qualquer momento dentro da validade.
    usado_em TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- A validação de um token consultado é sempre por token_hash (nunca por
-- id), então é este o índice que importa para a rota de redefinição não
-- fazer table scan.
CREATE INDEX IF NOT EXISTS idx_tokens_recuperacao_hash
  ON tokens_recuperacao(token_hash);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- Nenhum lojista tem motivo para ler esta tabela — o fluxo de "esqueci
-- minha senha" nem sequer passa por uma sessão autenticada (rotas
-- públicas, sem o middleware `autenticar`). Só a service_role (a nossa
-- API) grava e consulta.
ALTER TABLE tokens_recuperacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tokens_recuperacao_service_role_policy ON tokens_recuperacao;
CREATE POLICY tokens_recuperacao_service_role_policy ON tokens_recuperacao
    FOR ALL
    USING (current_setting('role') = 'service_role');

-- ------------------------------------------------------------
-- 2. TRAVA DO AVISO DE COTA ESGOTADA (pendência do ciclo 2)
-- ------------------------------------------------------------
-- Guarda qual `periodo_fim` (assinaturas.periodo_fim) já recebeu o
-- aviso, e não um booleano zerado em algum outro lugar.
--
-- Um booleano precisaria ser resetado por uma rotina separada (por
-- exemplo, dentro da RPC resetar_cota_mensal, chamada pelo webhook do
-- Stripe em invoice.paid). Se esse reset deixasse de rodar por
-- qualquer motivo — webhook perdido, falha silenciosa —, a trava
-- ficaria travada para sempre e o restaurante nunca mais receberia o
-- aviso, sem nenhum sinal do problema no resto do sistema.
--
-- Guardando o `periodo_fim` já avisado, a trava se autocorrige: quando
-- o Stripe faz o ciclo virar, `assinaturas.periodo_fim` muda sozinho,
-- deixa de bater com o valor gravado aqui, e o próximo esgotamento de
-- cota volta a disparar o aviso — sem depender de nenhuma outra
-- rotina para resetar nada. Ver src/services/billing/aviso-cota.ts.
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS aviso_cota_esgotada_periodo_fim TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN restaurantes.aviso_cota_esgotada_periodo_fim IS
  'periodo_fim (de assinaturas) do ciclo em que o aviso de cota esgotada já foi enviado. NULL = ainda não avisado neste ciclo, ou período desconhecido.';

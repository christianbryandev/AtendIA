-- ============================================================
-- 012_display_phone_number.sql
-- Corrige achado de revisão final do ciclo 3.
--
-- CONTEXTO:
-- restaurantes.meta_phone_number_id é o ID interno que a Meta usa para
-- identificar o número na Graph API (ex.: "123456789012345") — não é o
-- telefone do lojista, é só uma chave técnica. Antes desta migration,
-- era esse ID que a tela de Configurações mostrava em "Conectado ao
-- número {...}", como se fosse um telefone legível.
--
-- A Meta já devolve o telefone de verdade (`display_phone_number`,
-- ex.: "+55 11 91234-5678") na mesma chamada que testa a conexão
-- (ver src/services/whatsapp/conexao.ts, testarConexao). Esta coluna
-- guarda esse valor para a tela exibir sem precisar de uma chamada de
-- rede nova a cada carregamento.
--
-- Conexões salvas antes desta migration (e a própria coluna, até o
-- primeiro save seguinte) ficam com o valor NULL — o backend e a tela
-- tratam isso com um texto de fallback, nunca string vazia.
-- ============================================================

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS meta_display_phone_number VARCHAR(50);

COMMENT ON COLUMN restaurantes.meta_display_phone_number IS
  'Telefone legível do WhatsApp (display_phone_number da Meta), para exibir na tela de Configurações. NULL = ainda não salvo desde esta migration, ou conexão nunca testada com sucesso.';

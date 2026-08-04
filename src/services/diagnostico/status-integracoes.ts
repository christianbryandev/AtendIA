// Tipo próprio (em vez de reaproveitar `typeof env`): a função só precisa
// checar truthiness de cada campo, e vários deles são obrigatórios no
// schema real (config/env.ts) — os testes precisam poder simular a
// ausência mesmo de campos "obrigatórios" para cobrir o caso de um deploy
// mal configurado, sem brigar com o tipo estrito do env de produção.
interface CamposDeConfiguracao {
  OPENAI_API_KEY?: string;
  GROQ_API_KEY?: string;
  META_WHATSAPP_TOKEN?: string;
  META_APP_SECRET?: string;
  RESEND_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/**
 * Monta o diagnóstico de configuração exibido em GET /health.
 *
 * Extraída do handler da rota para ser testável sem subir o servidor —
 * mesmo padrão usado em decidirAtendimento/montarHistoricoParaIA.
 *
 * ATENÇÃO: esta função é consumida por uma rota PÚBLICA. Só pode devolver
 * booleanos. Nunca acrescente aqui o valor de uma chave, um prefixo, os
 * últimos caracteres ou o tamanho — "esta integração não está configurada"
 * é informação inócua para quem acessa /health sem autenticação; qualquer
 * fragmento de segredo não é.
 */
export function statusIntegracoes(env: CamposDeConfiguracao) {
  return {
    openai: !!env.OPENAI_API_KEY,
    groq: !!env.GROQ_API_KEY,
    metaToken: !!env.META_WHATSAPP_TOKEN,
    metaAppSecret: !!env.META_APP_SECRET,
    resend: !!env.RESEND_API_KEY,
    stripe: !!env.STRIPE_SECRET_KEY,
    supabase: !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

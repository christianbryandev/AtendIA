import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Mensagem exibida quando SUPABASE_URL vem com path, query ou fragmento.
// Esse foi um bug real: o .env do dono tinha SUPABASE_URL terminando em
// "/rest/v1/" e o supabase-js usa esse valor como base para montar as URLs
// das chamadas .from(...), gerando "Invalid path specified in request URL"
// em toda query — só descoberto quando um teste falou com o Supabase real.
const MENSAGEM_ERRO_SUPABASE_URL =
  'SUPABASE_URL deve ser apenas a origem do projeto Supabase, sem path, ' +
  'query ou fragmento — o formato correto é algo como ' +
  '"https://abcdefg.supabase.co" (uma barra final sozinha é aceita). ' +
  'Um valor como "https://abcdefg.supabase.co/rest/v1/" faz o supabase-js ' +
  'montar URLs invalidas e toda chamada .from(...) falha com ' +
  '"Invalid path specified in request URL".';

// Exportada para ser testada isoladamente, sem disparar o parse do
// process.env inteiro (que acontece no import deste módulo).
export function ehOrigemSupabaseValida(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  const semPath = url.pathname === '' || url.pathname === '/';
  return semPath && url.search === '' && url.hash === '';
}

// Normaliza APP_URL para a origem pura (esquema://host[:porta], sem barra
// final e sem caminho). Exportada para ser testada isoladamente, sem
// disparar o parse do process.env inteiro (que acontece no import deste
// módulo). Ver o comentário no schema, no campo APP_URL, para o motivo.
export function normalizarAppUrl(valor: string): string {
  return new URL(valor).origin;
}

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url().refine(ehOrigemSupabaseValida, MENSAGEM_ERRO_SUPABASE_URL),
  SUPABASE_ANON_KEY: z.string().min(1),
  // Obrigatória: o cliente admin (webhook/workers) não tem fallback para a anon key.
  // Sem ela, todo query do webhook retornaria zero linhas por RLS, silenciosamente.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY é obrigatória.'),
  SUPABASE_JWT_SECRET: z.string().min(32, 'O segredo JWT deve ter no mínimo 32 caracteres.'),
  CRON_SECRET: z.string().min(20, 'O segredo CRON deve ter no mínimo 20 caracteres.'),
  ENCRYPTION_KEY: z.string()
    .length(64, 'ENCRYPTION_KEY deve ter exatamente 64 caracteres.')
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY deve ser uma string hexadecimal válida.'),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  META_WHATSAPP_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_VERIFY_TOKEN: z.string().min(20, 'O META_VERIFY_TOKEN deve ter no mínimo 20 caracteres.'),
  META_APP_SECRET: z.string().min(20, 'O META_APP_SECRET deve ter no mínimo 20 caracteres.'),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),
  IFOOD_CLIENT_ID: z.string().optional(),
  IFOOD_CLIENT_SECRET: z.string().optional(),
  // Opcionais no schema para o backend subir em máquina sem Stripe
  // configurado. getStripe() falha com mensagem clara na hora de usar —
  // melhor do que impedir todo o resto do sistema de rodar.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ASSINATURA: z.string().optional(),
  STRIPE_PRICE_CREDITOS_2500: z.string().optional(),
  STRIPE_PRICE_CREDITOS_5000: z.string().optional(),
  STRIPE_PRICE_CREDITOS_10000: z.string().optional(),
  // Opcional pelo mesmo motivo das chaves do Stripe acima: o Resend ainda
  // não foi contratado e o domínio ainda não foi verificado (pendência do
  // dono do projeto), e o servidor precisa continuar subindo sem ela.
  // getResend() (src/services/email/resend-client.ts) falha com mensagem
  // clara na hora de enviar — não no boot.
  RESEND_API_KEY: z.string().optional(),
  // Normalizada para a origem pura (esquema://host[:porta], sem barra final
  // e sem caminho) via `new URL(...).origin`. Isso existe por causa de um bug
  // real: se APP_URL for configurada no Render com barra final (por exemplo
  // "https://atendiarp.com.br/"), o CORS (src/config/cors.ts) passa a
  // comparar essa string contra o cabeçalho `Origin` do navegador — que
  // nunca tem barra final — e recusa toda chamada do frontend de produção
  // (login, painel, cobrança). Também evita URLs de retorno do Stripe com
  // barra dupla, como "https://atendiarp.com.br//assinatura/confirmando"
  // (ver src/services/billing/checkout.ts). Não remova esta normalização
  // sem entender que ela é o que garante que todo consumidor de APP_URL
  // recebe sempre a origem limpa.
  APP_URL: z
    .string()
    .url()
    .default('http://localhost:5173')
    .transform(normalizarAppUrl),
});

export const env = envSchema.parse(process.env);

export function getJwtSecret(): string {
  return env.SUPABASE_JWT_SECRET;
}

export function getCronSecret(): string {
  return env.CRON_SECRET;
}

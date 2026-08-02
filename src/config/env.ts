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
  APP_URL: z.string().url().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);

export function getJwtSecret(): string {
  return env.SUPABASE_JWT_SECRET;
}

export function getCronSecret(): string {
  return env.CRON_SECRET;
}

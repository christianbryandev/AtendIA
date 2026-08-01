import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url(),
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
});

export const env = envSchema.parse(process.env);

export function getJwtSecret(): string {
  return env.SUPABASE_JWT_SECRET;
}

export function getCronSecret(): string {
  return env.CRON_SECRET;
}

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string()
    .length(64, 'ENCRYPTION_KEY deve ter exatamente 64 caracteres.')
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY deve ser uma string hexadecimal válida.'),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  META_WHATSAPP_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_VERIFY_TOKEN: z.string().default('minha_senha_secreta_webhook_123'),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),
  IFOOD_CLIENT_ID: z.string().optional(),
  IFOOD_CLIENT_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);

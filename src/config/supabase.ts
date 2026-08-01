import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// 1. Cliente Admin para processamento de Webhooks públicos do WhatsApp & Workers assíncronos
// Sem fallback para a anon key: se a service role key faltasse, este cliente
// viraria anônimo em silêncio e todo query do webhook passaria a retornar zero
// linhas por RLS — falha fantasma. A ausência da chave quebra no boot (env.ts).
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 2. Cliente Anon Padrão
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 3. Cliente Escopado por Tenant (Aplica RLS nativo no PostgreSQL via JWT Token do Usuário Logado)
export function getTenantSupabaseClient(userJwtToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${userJwtToken}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

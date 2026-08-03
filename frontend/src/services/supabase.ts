import { createClient } from '@supabase/supabase-js';

/**
 * Cliente do Supabase usado só para o Realtime da caixa de entrada.
 *
 * A leitura é feita com a chave anon MAIS o JWT do lojista — o mesmo que
 * a nossa API emite, com `sub = restaurante_id`. É esse token que faz as
 * policies de RLS isolarem um restaurante do outro. Usar a service role
 * aqui exporia o banco inteiro no navegador.
 *
 * Só leitura: todo envio continua passando pela nossa API, para nenhuma
 * mensagem escapar das checagens de janela, crédito e token.
 */
export function criarClienteSupabase(token: string) {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

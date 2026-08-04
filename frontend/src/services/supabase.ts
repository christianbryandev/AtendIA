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
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY só entram no bundle em um
  // novo build (variáveis VITE_ são injetadas em build time). Sem esta
  // checagem, esquecer de configurá-las no ambiente de build faria o
  // createClient falhar com uma exceção crua e difícil de rastrear só
  // quando o navegador tentasse usar o cliente, bem longe de onde a causa
  // realmente está.
  if (!url || !anonKey) {
    throw new Error(
      'Configuração ausente: VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY não foram definidas no build do frontend. ' +
        'Verifique as variáveis de ambiente usadas no build (elas precisam existir ANTES de rodar o build, não em runtime).',
    );
  }

  return createClient(
    url,
    anonKey,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

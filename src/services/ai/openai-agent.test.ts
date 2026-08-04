import { describe, it, expect, vi } from 'vitest';

// Sem OPENAI_API_KEY configurada: a função deve lançar, nunca responder ao
// cliente com preco inventado e promessa de pagamento via Pix. Antes desta
// correcao, o retorno era um texto hardcoded prometendo "R$ 45,00" e "chave
// Pix Copia e Cola" sem pedido nenhum existir na cozinha.
vi.mock('../../config/env.js', () => ({
  env: { OPENAI_API_KEY: undefined },
}));

// Evita que o import em cadeia de openai-agent.ts tente criar um cliente
// Supabase real (config/supabase.ts chama createClient com env.SUPABASE_URL,
// que nao existe no mock acima de env.js).
vi.mock('../../config/supabase.js', () => ({
  supabaseAdmin: {},
}));

import { processCustomerMessageWithAI } from './openai-agent.js';

describe('processCustomerMessageWithAI', () => {
  it('lanca erro quando OPENAI_API_KEY nao esta configurada, em vez de responder com preco/pix inventados', async () => {
    await expect(
      processCustomerMessageWithAI({
        restauranteId: 'rest-1',
        telefoneCliente: '5511999999999',
        mensagemTexto: 'quero um x-bacon',
      })
    ).rejects.toThrow(/OPENAI_API_KEY não configurada/);
  });
});

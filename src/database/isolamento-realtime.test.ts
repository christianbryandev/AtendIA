import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { supabaseAdmin, getTenantSupabaseClient } from '../config/supabase.js';
import { getJwtSecret } from '../config/env.js';

// ATENÇÃO: este teste roda contra o Supabase de DESENVOLVIMENTO real (ver
// .env), o mesmo banco onde a migration 009 já foi aplicada com RLS
// habilitada e as tabelas publicadas no supabase_realtime.
//
// Esta é a tarefa de maior risco do ciclo: é a primeira vez que o navegador
// vai ler `mensagens` e `conversas` direto do Postgres, sem passar pela
// nossa API. A única coisa que impede um restaurante de ver a conversa de
// outro é a policy de RLS. Por isso o cliente usado aqui para "ler como o
// restaurante A" tem que ser o mesmo tipo de cliente que o navegador vai
// usar: chave `anon` + JWT do lojista (getTenantSupabaseClient), NUNCA a
// service_role. Se este teste usasse supabaseAdmin para ler como A, ele
// passaria sempre — e não provaria nada, porque a service_role faz bypass
// de RLS (ver a cláusula "OR current_setting('role') = 'service_role'" na
// migration 009).
const NOME_FIXTURE = '__FIXTURE_TASK8_ISOLAMENTO_REALTIME_NAO_APAGAR_MANUALMENTE__';

// Todo id de restaurante-fixture criado nesta suíte, para o afterAll
// conseguir limpar mesmo que algo falhe no meio do beforeAll.
const idsRestaurantesCriados: string[] = [];

let restauranteAId: string;
let restauranteBId: string;
let clienteComoA: ReturnType<typeof getTenantSupabaseClient>;

async function criarRestauranteFixture(sufixo: string) {
  const { data, error } = await supabaseAdmin
    .from('restaurantes')
    .insert([{ nome: `${NOME_FIXTURE}_${sufixo}` }])
    .select('id')
    .single();

  if (error) throw error;
  const id = data.id as string;
  idsRestaurantesCriados.push(id);
  return id;
}

// Assina o JWT com o MESMO formato que a rota /api/auth/login usa (ver
// src/server.ts): sub = restaurante_id, role e aud 'authenticated', mais
// user_metadata. É esse formato que a policy de RLS da migration 009 lê em
// `request.jwt.claims ->> 'sub'`.
function assinarTokenLojista(restauranteId: string): string {
  return jwt.sign(
    {
      sub: restauranteId,
      role: 'authenticated',
      aud: 'authenticated',
      user_metadata: { restaurante_id: restauranteId },
    },
    getJwtSecret(),
    { expiresIn: '12h' },
  );
}

beforeAll(async () => {
  restauranteAId = await criarRestauranteFixture('A');
  restauranteBId = await criarRestauranteFixture('B');

  const { error: erroConversaA } = await supabaseAdmin.from('conversas').insert([
    { restaurante_id: restauranteAId, telefone_cliente: '5511900000001' },
  ]);
  if (erroConversaA) throw erroConversaA;

  const { error: erroConversaB } = await supabaseAdmin.from('conversas').insert([
    { restaurante_id: restauranteBId, telefone_cliente: '5511900000002' },
  ]);
  if (erroConversaB) throw erroConversaB;

  const { error: erroMensagemA } = await supabaseAdmin.from('mensagens').insert([
    {
      restaurante_id: restauranteAId,
      telefone_cliente: '5511900000001',
      direcao: 'recebida',
      autor: 'cliente',
      texto: 'mensagem do restaurante A',
    },
  ]);
  if (erroMensagemA) throw erroMensagemA;

  const { error: erroMensagemB } = await supabaseAdmin.from('mensagens').insert([
    {
      restaurante_id: restauranteBId,
      telefone_cliente: '5511900000002',
      direcao: 'recebida',
      autor: 'cliente',
      texto: 'mensagem do restaurante B',
    },
  ]);
  if (erroMensagemB) throw erroMensagemB;

  // Cliente autenticado como o restaurante A: chave anon + JWT de A, exatamente
  // o que o navegador vai montar em frontend/src/services/supabase.ts.
  clienteComoA = getTenantSupabaseClient(assinarTokenLojista(restauranteAId));
});

// Rede de segurança: apaga as duas fixtures pelo id exato, mesmo que algum
// teste tenha falhado no meio. ON DELETE CASCADE (migration 009) cuida de
// apagar junto as conversas e mensagens de cada restaurante.
afterAll(async () => {
  const ids = [restauranteAId, restauranteBId].filter(Boolean);
  if (ids.length > 0) {
    await supabaseAdmin.from('restaurantes').delete().in('id', ids);
  }
});

describe('isolamento de RLS entre restaurantes (mensagens e conversas)', () => {
  it('A lê as próprias mensagens', async () => {
    const { data, error } = await clienteComoA
      .from('mensagens')
      .select('*')
      .eq('restaurante_id', restauranteAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].texto).toBe('mensagem do restaurante A');
  });

  it('A NÃO lê nenhuma mensagem de B, mesmo pedindo explicitamente', async () => {
    // Pede sem filtro de restaurante_id: se a RLS estivesse ausente ou errada,
    // isto retornaria as mensagens dos dois restaurantes.
    const { data: todas, error: erroTodas } = await clienteComoA.from('mensagens').select('*');
    expect(erroTodas).toBeNull();
    expect(todas?.every((m) => m.restaurante_id === restauranteAId)).toBe(true);

    // Pede filtrando explicitamente por B: a RLS deve zerar o resultado antes
    // mesmo de aplicar o filtro do cliente.
    const { data: deB, error: erroDeB } = await clienteComoA
      .from('mensagens')
      .select('*')
      .eq('restaurante_id', restauranteBId);
    expect(erroDeB).toBeNull();
    expect(deB).toHaveLength(0);
  });

  it('A lê as próprias conversas', async () => {
    const { data, error } = await clienteComoA
      .from('conversas')
      .select('*')
      .eq('restaurante_id', restauranteAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].telefone_cliente).toBe('5511900000001');
  });

  it('A NÃO lê nenhuma conversa de B, mesmo pedindo explicitamente', async () => {
    const { data: todas, error: erroTodas } = await clienteComoA.from('conversas').select('*');
    expect(erroTodas).toBeNull();
    expect(todas?.every((c) => c.restaurante_id === restauranteAId)).toBe(true);

    const { data: deB, error: erroDeB } = await clienteComoA
      .from('conversas')
      .select('*')
      .eq('restaurante_id', restauranteBId);
    expect(erroDeB).toBeNull();
    expect(deB).toHaveLength(0);
  });
});

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
  return data.id as string;
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
    const { error } = await supabaseAdmin.from('restaurantes').delete().in('id', ids);
    // O cliente do Supabase não lança sozinho: se o delete falhar aqui e o
    // erro for descartado, as fixtures (e conversas/mensagens em cascata)
    // ficam para sempre no banco real, e a suíte continua verde do mesmo
    // jeito. Torna a falha visível e barulhenta.
    if (error) {
      console.error(
        'FALHA AO LIMPAR FIXTURES DO TESTE isolamento-realtime — restaurantes de fixture podem ter ficado no banco real:',
        ids,
        error,
      );
      throw error;
    }
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
    // Garante que a lista não está vazia antes do every: uma lista vazia
    // passaria no every trivialmente e a asserção não provaria nada,
    // inclusive ficando frágil a uma reordenação futura dos testes que
    // rodasse esta verificação antes da fixture existir.
    expect(todas?.length).toBeGreaterThan(0);
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
    // Mesma razão do teste equivalente em mensagens: lista vazia não prova
    // isolamento nenhum.
    expect(todas?.length).toBeGreaterThan(0);
    expect(todas?.every((c) => c.restaurante_id === restauranteAId)).toBe(true);

    const { data: deB, error: erroDeB } = await clienteComoA
      .from('conversas')
      .select('*')
      .eq('restaurante_id', restauranteBId);
    expect(erroDeB).toBeNull();
    expect(deB).toHaveLength(0);
  });

  // ------------------------------------------------------------
  // Achado 1/2 da revisão da Task 8: as policies da migration 009 são
  // FOR ALL com só USING, o que em Postgres faz o WITH CHECK herdar a
  // mesma expressão do USING — ou seja, hoje o mesmo JWT que lê também
  // teria permissão de INSERT/UPDATE. Isso quebraria a promessa de
  // "só leitura" documentada em frontend/src/services/supabase.ts: um
  // lojista poderia, pelo console do navegador, adulterar
  // conversas.ultima_mensagem_cliente_em do próprio restaurante e
  // enganar o cálculo da janela de 24h da Meta.
  //
  // ATENÇÃO: os testes abaixo só passam DEPOIS que a migration 011
  // (011_realtime_somente_leitura.sql) for aplicada no Supabase real,
  // trocando as policies FOR ALL por FOR SELECT. Antes disso eles
  // FALHAM de propósito — a falha é a prova de que o achado é real e de
  // que a migration 011 é necessária. Não marcar como skip nem
  // enfraquecer para "ficar verde": um resultado verde aqui hoje
  // significaria que a escrita direta pelo navegador ainda é possível.
  describe('escrita direta pelo navegador deve ser bloqueada (vale após a migration 011)', () => {
    it('A NÃO consegue inserir mensagem, nem com o próprio restaurante_id', async () => {
      const { error } = await clienteComoA.from('mensagens').insert([
        {
          restaurante_id: restauranteAId,
          telefone_cliente: '5511900000001',
          direcao: 'enviada',
          autor: 'lojista',
          texto: 'tentativa de escrita direta pelo navegador',
        },
      ]);

      expect(error).not.toBeNull();
    });

    it('A NÃO consegue atualizar a própria conversa (caso concreto: adulterar ultima_mensagem_cliente_em para forçar a janela de 24h como aberta)', async () => {
      const { error, data } = await clienteComoA
        .from('conversas')
        .update({ ultima_mensagem_cliente_em: new Date().toISOString() })
        .eq('restaurante_id', restauranteAId)
        .select();

      // Dependendo da policy, o Postgres pode tanto recusar com erro quanto
      // silenciosamente não afetar nenhuma linha (RLS filtra as linhas
      // visíveis para UPDATE antes de aplicar o WITH CHECK). Qualquer um
      // dos dois é aceitável como prova de bloqueio; o que NÃO pode
      // acontecer é a linha ser efetivamente alterada.
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });

    it('A NÃO consegue inserir mensagem em nome de B', async () => {
      const { error } = await clienteComoA.from('mensagens').insert([
        {
          restaurante_id: restauranteBId,
          telefone_cliente: '5511900000002',
          direcao: 'enviada',
          autor: 'lojista',
          texto: 'tentativa de escrita cross-tenant',
        },
      ]);

      expect(error).not.toBeNull();
    });

    it('A NÃO consegue atualizar conversa de B', async () => {
      const { error, data } = await clienteComoA
        .from('conversas')
        .update({ ultima_mensagem_cliente_em: new Date().toISOString() })
        .eq('restaurante_id', restauranteBId)
        .select();

      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });
  });
});

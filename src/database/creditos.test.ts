import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { supabaseAdmin } from '../config/supabase.js';

// ATENÇÃO: estes testes rodam contra o Supabase de DESENVOLVIMENTO real (ver
// .env), que tem dados de verdade. A lógica de split de crédito vive inteira
// em plpgsql nas RPCs da migration 006 — testar com mock só provaria que o
// mock funciona. Por isso aqui não se mocka nada: chama-se a RPC de verdade
// e confere-se o saldo de verdade.
//
// Nome inconfundível para nunca colidir com um restaurante real, e todo
// delete abaixo filtra por id de fixture (nunca por algo genérico que
// pudesse alcançar dado real).
const NOME_FIXTURE = '__FIXTURE_TASK3_CREDITOS_NAO_APAGAR_MANUALMENTE__';

// Todo id de restaurante-fixture criado nesta suíte, para a rede de segurança
// do afterAll conseguir limpar mesmo que o afterEach de um teste não rode
// (ex.: erro fora do corpo do it, ou processo interrompido no meio).
const idsCriados: string[] = [];

let restauranteId: string;

async function criarRestauranteFixture(cota: number, avulsos: number) {
  const { data, error } = await supabaseAdmin
    .from('restaurantes')
    .insert([{ nome: NOME_FIXTURE, creditos_cota: cota, creditos_avulsos: avulsos }])
    .select('id')
    .single();

  if (error) throw error;
  const id = data.id as string;
  idsCriados.push(id);
  return id;
}

async function saldo(id: string) {
  const { data } = await supabaseAdmin
    .from('restaurantes')
    .select('creditos_cota, creditos_avulsos')
    .eq('id', id)
    .single();
  return data as { creditos_cota: number; creditos_avulsos: number };
}

// Restaurante descartável, recriado a cada teste para nenhum teste depender
// do saldo que outro deixou (independência entre testes e entre execuções
// repetidas da suíte).
beforeEach(async () => {
  restauranteId = await criarRestauranteFixture(10, 5);
});

// Apaga a fixture do teste que acabou de rodar, filtrando pelo id exato —
// roda mesmo que o teste tenha falhado (o hook do vitest executa de
// qualquer forma, só não roda se o processo inteiro travar).
afterEach(async () => {
  if (restauranteId) {
    await supabaseAdmin.from('restaurantes').delete().eq('id', restauranteId);
  }
});

// Rede de segurança final: apaga qualquer fixture criada nesta suíte que
// por algum motivo tenha sobrevivido ao afterEach de seu próprio teste.
// Filtra pelos ids exatos que este arquivo criou, nunca por um filtro
// genérico que pudesse alcançar dado real.
afterAll(async () => {
  if (idsCriados.length > 0) {
    await supabaseAdmin.from('restaurantes').delete().in('id', idsCriados);
  }
});

describe('consumir_creditos_ia', () => {
  it('debita da cota enquanto ela cobre o consumo', async () => {
    const { data } = await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 8, p_tipo: 'audio',
    });

    expect(data).toBe(true);
    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 2, creditos_avulsos: 5 });
  });

  it('completa com avulso quando a cota não cobre sozinha', async () => {
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 12, p_tipo: 'audio',
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 0, creditos_avulsos: 3 });
  });

  it('recusa quando os dois saldos somados não cobrem', async () => {
    const { data } = await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 16, p_tipo: 'audio',
    });

    expect(data).toBe(false);
    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 5 });
  });

  it('registra a origem no log de consumo', async () => {
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 12, p_tipo: 'audio',
    });

    const { data } = await supabaseAdmin
      .from('creditos_ia')
      .select('origem')
      .eq('restaurante_id', restauranteId)
      .single();

    expect(data?.origem).toBe('misto');
  });

  // A migration 006 troca "devolver falso" por exceção quando p_qtd é nulo
  // ou não positivo (ver comentário em consumir_creditos_ia). Provado aqui
  // porque é justamente o guard que impede um p_qtd negativo de transformar
  // um débito em crédito.
  it('lança exceção em vez de devolver falso quando p_qtd não é positivo', async () => {
    const { error } = await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 0, p_tipo: 'audio',
    });

    expect(error).not.toBeNull();
    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 5 });
  });
});

describe('reembolsar_creditos_ia', () => {
  it('devolve ao avulso o que saiu do avulso', async () => {
    // Zera a cota primeiro, para o consumo sair inteiro do avulso.
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 10, p_tipo: 'texto',
    });
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 3, p_tipo: 'texto',
    });

    await supabaseAdmin.rpc('reembolsar_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 3, p_tipo: 'texto', p_motivo: 'teste',
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 0, creditos_avulsos: 5 });
  });

  it('devolve à cota o que saiu da cota', async () => {
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 4, p_tipo: 'texto',
    });
    await supabaseAdmin.rpc('reembolsar_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 4, p_tipo: 'texto', p_motivo: 'teste',
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 5 });
  });

  // A migration 006 casa o reembolso com o débito por tipo_evento + quantidade
  // exatos, e propositalmente NÃO credita nada quando não encontra o débito
  // correspondente (ver comentário em reembolsar_creditos_ia) — para não
  // emitir crédito sem contrapartida. Sem consumo prévio nenhum débito bate,
  // então o saldo deve permanecer intocado.
  it('não credita nada quando não encontra o débito correspondente', async () => {
    const { error } = await supabaseAdmin.rpc('reembolsar_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 4, p_tipo: 'texto', p_motivo: 'sem debito',
    });

    expect(error).toBeNull();
    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 5 });
  });
});

describe('resetar_cota_mensal', () => {
  it('reseta a cota sem somar e sem tocar no avulso', async () => {
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 6, p_tipo: 'texto',
    });

    await supabaseAdmin.rpc('resetar_cota_mensal', {
      p_restaurante_id: restauranteId, p_qtd: 10,
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 5 });
  });

  // A migration 006 dispara exceção quando o restaurante não existe, em vez
  // de terminar em silêncio — para o webhook do Stripe não achar que creditou
  // quando na verdade não creditou nada (ver comentário na RPC).
  it('lança exceção quando o restaurante não existe', async () => {
    const idInexistente = '00000000-0000-0000-0000-000000000000';

    const { error } = await supabaseAdmin.rpc('resetar_cota_mensal', {
      p_restaurante_id: idInexistente, p_qtd: 10,
    });

    expect(error).not.toBeNull();
  });
});

describe('creditar_pacote_avulso', () => {
  it('soma ao avulso sem tocar na cota', async () => {
    await supabaseAdmin.rpc('creditar_pacote_avulso', {
      p_restaurante_id: restauranteId, p_qtd: 2500,
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 2505 });
  });

  // Mesma razão de resetar_cota_mensal: restaurante inexistente precisa
  // falhar ruidosamente, não terminar como se tivesse creditado.
  it('lança exceção quando o restaurante não existe', async () => {
    const idInexistente = '00000000-0000-0000-0000-000000000000';

    const { error } = await supabaseAdmin.rpc('creditar_pacote_avulso', {
      p_restaurante_id: idInexistente, p_qtd: 2500,
    });

    expect(error).not.toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const atualizarStatusMock = vi.fn();
const buscarPorCustomerIdMock = vi.fn();

vi.mock('./assinatura-repo.js', () => ({
  atualizarStatus: (...a: unknown[]) => atualizarStatusMock(...a),
  buscarPorCustomerId: (...a: unknown[]) => buscarPorCustomerIdMock(...a),
}));

const rpcMock = vi.fn();
const insertMock = vi.fn();
const eqAposDeleteMock = vi.fn();
const deleteMock = vi.fn(() => ({ eq: eqAposDeleteMock }));

vi.mock('../../config/supabase.js', () => ({
  supabaseAdmin: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({ insert: (...a: unknown[]) => insertMock(...a), delete: () => deleteMock() }),
  },
}));

const { processarEvento, registrarEventoSeNovo, removerRegistroEvento, CREDITOS_DA_COTA } =
  await import('./webhook-handler.js');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_CREDITOS_5000 = 'price_5000';
  rpcMock.mockResolvedValue({ data: null, error: null });
  insertMock.mockResolvedValue({ error: null });
  eqAposDeleteMock.mockResolvedValue({ error: null });
  buscarPorCustomerIdMock.mockResolvedValue({ restauranteId: 'rest-1' });
});

describe('registrarEventoSeNovo', () => {
  it('devolve true quando o insert funciona (evento novo)', async () => {
    insertMock.mockResolvedValue({ error: null });

    await expect(registrarEventoSeNovo('evt_novo', 'checkout.session.completed')).resolves.toBe(true);
  });

  it('devolve false quando o insert falha por chave duplicada (evento repetido)', async () => {
    insertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    await expect(registrarEventoSeNovo('evt_repetido', 'checkout.session.completed')).resolves.toBe(false);
  });
});

describe('removerRegistroEvento', () => {
  // Correção 2: se o processamento em segundo plano falhar depois do
  // registro de idempotência, o registro precisa ser removido, senão o
  // reenvio do Stripe é descartado como duplicata para sempre.
  it('remove o registro pelo event_id, para o reenvio do Stripe ser tratado como novo', async () => {
    await removerRegistroEvento('evt_1');

    expect(deleteMock).toHaveBeenCalled();
    expect(eqAposDeleteMock).toHaveBeenCalledWith('event_id', 'evt_1');
  });

  it('não lança quando a remoção falha (best-effort, só loga)', async () => {
    eqAposDeleteMock.mockResolvedValue({ error: { message: 'falha de rede' } });

    await expect(removerRegistroEvento('evt_1')).resolves.toBeUndefined();
  });
});

describe('checkout.session.completed em modo subscription', () => {
  const evento = {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        mode: 'subscription',
        client_reference_id: 'rest-1',
        customer: 'cus_1',
        subscription: 'sub_1',
        metadata: { restaurante_id: 'rest-1' },
      },
    },
  } as any;

  it('ativa a assinatura e guarda o id da subscription', async () => {
    await processarEvento(evento);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      status: 'ativa',
      stripeSubscriptionId: 'sub_1',
    }));
  });

  it('credita a cota cheia', async () => {
    await processarEvento(evento);

    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', {
      p_restaurante_id: 'rest-1',
      p_qtd: CREDITOS_DA_COTA,
    });
  });
});

describe('checkout.session.completed em modo payment', () => {
  it('soma o pacote ao saldo avulso, sem tocar na cota', async () => {
    await processarEvento({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          client_reference_id: 'rest-1',
          customer: 'cus_1',
          metadata: { restaurante_id: 'rest-1', pacote_id: 'creditos_5000' },
        },
      },
    } as any);

    expect(rpcMock).toHaveBeenCalledWith('creditar_pacote_avulso', {
      p_restaurante_id: 'rest-1',
      p_qtd: 5000,
    });
    expect(atualizarStatusMock).not.toHaveBeenCalled();
  });
});

describe('invoice.paid', () => {
  // Sem olhar o billing_reason, a primeira fatura credita a cota duas
  // vezes: uma no checkout.session.completed e outra aqui.
  it('ignora a primeira fatura, que o checkout já creditou', async () => {
    await processarEvento({
      id: 'evt_3',
      type: 'invoice.paid',
      data: { object: { billing_reason: 'subscription_create', customer: 'cus_1' } },
    } as any);

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('reseta a cota na renovação', async () => {
    await processarEvento({
      id: 'evt_4',
      type: 'invoice.paid',
      data: {
        object: {
          billing_reason: 'subscription_cycle',
          customer: 'cus_1',
          period_end: 1793491200,
        },
      },
    } as any);

    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', {
      p_restaurante_id: 'rest-1',
      p_qtd: CREDITOS_DA_COTA,
    });
    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'ativa' }));
  });
});

describe('invoice.payment_failed', () => {
  it('marca inadimplente sem zerar créditos', async () => {
    await processarEvento({
      id: 'evt_5',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1' } },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', { status: 'inadimplente' });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('customer.subscription.deleted', () => {
  it('cancela e zera a cota, preservando o avulso', async () => {
    await processarEvento({
      id: 'evt_6',
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_1' } },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'cancelada' }));
    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', { p_restaurante_id: 'rest-1', p_qtd: 0 });
  });
});

describe('charge.refunded', () => {
  it('marca reembolsada e zera a cota', async () => {
    await processarEvento({
      id: 'evt_7',
      type: 'charge.refunded',
      data: { object: { customer: 'cus_1' } },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'reembolsada' }));
    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', { p_restaurante_id: 'rest-1', p_qtd: 0 });
  });
});

describe('evento de tipo não tratado', () => {
  it('não faz nada e não quebra', async () => {
    await processarEvento({ id: 'evt_8', type: 'customer.updated', data: { object: {} } } as any);

    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('restaurante não encontrado', () => {
  it('não escreve nada quando o customer é desconhecido', async () => {
    buscarPorCustomerIdMock.mockResolvedValue(null);

    await processarEvento({
      id: 'evt_9',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_fantasma' } },
    } as any);

    expect(atualizarStatusMock).not.toHaveBeenCalled();
  });
});

describe('erro na RPC (Correção 1)', () => {
  // supabase-js não lança em erro de RPC, devolve { data, error }. As
  // RPCs de crédito fazem RAISE EXCEPTION quando o restaurante não
  // existe — se o handler ignorar `error`, esse erro do banco é
  // engolido, o evento é marcado como processado e o Stripe nunca
  // retenta: dinheiro entra sem crédito, em silêncio.
  it('propaga o erro da RPC como exceção, para o chamador poder retentar', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Restaurante não encontrado' } });

    await expect(processarEvento({
      id: 'evt_10',
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_1' } },
    } as any)).rejects.toThrow();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const atualizarStatusMock = vi.fn();
const buscarPorCustomerIdMock = vi.fn();
const buscarAssinaturaMock = vi.fn();

vi.mock('./assinatura-repo.js', () => ({
  atualizarStatus: (...a: unknown[]) => atualizarStatusMock(...a),
  buscarPorCustomerId: (...a: unknown[]) => buscarPorCustomerIdMock(...a),
  buscarAssinatura: (...a: unknown[]) => buscarAssinaturaMock(...a),
}));

const subscriptionsCancelMock = vi.fn();
const subscriptionsRetrieveMock = vi.fn();

vi.mock('./stripe-client.js', () => ({
  getStripe: () => ({
    subscriptions: {
      cancel: (...a: unknown[]) => subscriptionsCancelMock(...a),
      retrieve: (...a: unknown[]) => subscriptionsRetrieveMock(...a),
    },
  }),
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
  buscarAssinaturaMock.mockResolvedValue({ restauranteId: 'rest-1', stripeSubscriptionId: 'sub_1' });
  subscriptionsCancelMock.mockResolvedValue({});
  // current_period_end vive em items.data[], não na raiz da Subscription,
  // na versão de API deste SDK. O mock reproduz o formato real.
  subscriptionsRetrieveMock.mockResolvedValue({
    id: 'sub_1',
    items: { data: [{ current_period_end: 1793491200 }] },
  });
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

  // Tratar qualquer erro como duplicata faria a rota responder 200, e o
  // Stripe nunca retenta um 200: pagamento entra, crédito não.
  it('lança quando o erro do insert não é violação de chave única', async () => {
    insertMock.mockResolvedValue({ error: { code: '08006', message: 'connection failure' } });

    await expect(registrarEventoSeNovo('evt_1', 'checkout.session.completed')).rejects.toThrow();
  });

  // Enquanto a migration 006 não for aplicada, a tabela não existe e o
  // Postgres devolve 42P01. Esse caso precisa falhar ruidosamente.
  it('lança quando a tabela de idempotência ainda não existe', async () => {
    insertMock.mockResolvedValue({
      error: { code: '42P01', message: 'relation "stripe_eventos_processados" does not exist' },
    });

    await expect(registrarEventoSeNovo('evt_1', 'checkout.session.completed')).rejects.toThrow();
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

  // Sem isso a linha "Próxima cobrança" da tela de assinatura fica
  // invisível no primeiro mês inteiro: a Checkout Session não traz a
  // data, só o invoice.paid da segunda fatura traria.
  it('grava o fim do periodo lido da subscription', async () => {
    await processarEvento(evento);

    expect(subscriptionsRetrieveMock).toHaveBeenCalledWith('sub_1');
    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      periodoFim: new Date(1793491200 * 1000).toISOString(),
    }));
  });

  // O lojista pode ter agendado o cancelamento, mudado de ideia e feito
  // um checkout novo em vez de reativar pelo Portal. Sem isso, a
  // assinatura nova nasceria exibindo o aviso de cancelamento da antiga.
  it('limpa um cancelamento agendado deixado por uma assinatura anterior', async () => {
    await processarEvento(evento);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      cancelamentoAgendadoPara: null,
    }));
  });

  // Ativar a conta e creditar a cota valem mais do que uma data na tela.
  it('ativa a conta mesmo se o Stripe falhar ao devolver a subscription', async () => {
    subscriptionsRetrieveMock.mockRejectedValue(new Error('Stripe fora do ar'));

    await processarEvento(evento);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      status: 'ativa',
      periodoFim: null,
    }));
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

  // A assinatura já terminou de fato: um aviso de "continua ativa até
  // [data passada]" deixado para trás contradiz o status 'cancelada'
  // que acabou de ser gravado, mentindo para o lojista no painel.
  it('limpa o cancelamento agendado, para o aviso nao sobreviver ao fim da assinatura', async () => {
    await processarEvento({
      id: 'evt_6b',
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_1' } },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      cancelamentoAgendadoPara: null,
    }));
  });
});

describe('customer.subscription.updated', () => {
  // Cancelamento pelo Customer Portal costuma ser AGENDADO: a
  // subscription continua active e ganha cancel_at, sem
  // customer.subscription.deleted disparar na hora.
  it('com cancel_at preenchido, registra a data do cancelamento agendado e NAO muda o status', async () => {
    await processarEvento({
      id: 'evt_upd_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          cancel_at: 1793491200,
          items: { data: [{ current_period_end: 1793491200 }] },
        },
      },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      cancelamentoAgendadoPara: new Date(1793491200 * 1000).toISOString(),
    }));
    const chamada = atualizarStatusMock.mock.calls[0][1];
    expect(chamada.status).toBeUndefined();
  });

  it('com cancel_at vazio, limpa o agendamento (lojista reativou pelo portal)', async () => {
    await processarEvento({
      id: 'evt_upd_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          cancel_at: null,
          items: { data: [{ current_period_end: 1793491200 }] },
        },
      },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      cancelamentoAgendadoPara: null,
    }));
  });

  it('nao mexe em nenhum credito', async () => {
    await processarEvento({
      id: 'evt_upd_3',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          cancel_at: 1793491200,
          items: { data: [{ current_period_end: 1793491200 }] },
        },
      },
    } as any);

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('atualiza o periodo_fim a partir do estado corrente da subscription', async () => {
    await processarEvento({
      id: 'evt_upd_4',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          cancel_at: null,
          items: { data: [{ current_period_end: 1800000000 }] },
        },
      },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      periodoFim: new Date(1800000000 * 1000).toISOString(),
    }));
  });
});

describe('charge.refunded', () => {
  // A compra de pacote gera uma Charge do mesmo Customer da assinatura.
  // Sem a metadata do pacote na Charge, devolver R$ 59,90 de um pacote
  // por cortesia cancelaria a assinatura e zeraria a cota do restaurante.
  it('reembolso TOTAL de pacote avulso debita os creditos do saldo avulso', async () => {
    rpcMock.mockResolvedValue({ data: 2500, error: null });

    await processarEvento({
      id: 'evt_pacote',
      type: 'charge.refunded',
      data: {
        object: {
          customer: 'cus_1',
          amount: 5990,
          amount_refunded: 5990,
          metadata: { restaurante_id: 'rest-1', pacote_id: 'creditos_2500' },
        },
      },
    } as any);

    expect(rpcMock).toHaveBeenCalledWith('debitar_pacote_avulso', {
      p_restaurante_id: 'rest-1',
      p_qtd: 2500,
    });
  });

  it('reembolso TOTAL de pacote avulso nao mexe na assinatura, no status nem na cota', async () => {
    rpcMock.mockResolvedValue({ data: 2500, error: null });

    await processarEvento({
      id: 'evt_pacote',
      type: 'charge.refunded',
      data: {
        object: {
          customer: 'cus_1',
          amount: 5990,
          amount_refunded: 5990,
          metadata: { restaurante_id: 'rest-1', pacote_id: 'creditos_2500' },
        },
      },
    } as any);

    expect(subscriptionsCancelMock).not.toHaveBeenCalled();
    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalledWith('resetar_cota_mensal', expect.anything());
  });

  // Correção do spec: neste modelo de negócio, reembolso é sempre
  // integral. Um estorno parcial de cortesia (ex.: R$ 5 num pacote de
  // R$ 59,90) não pode debitar os créditos inteiros do pacote — mesma
  // regra do reembolso de assinatura, que só age no reembolso total.
  it('reembolso PARCIAL de pacote avulso nao debita credito, nao muda status e nao mexe na cota', async () => {
    await processarEvento({
      id: 'evt_pacote_cortesia',
      type: 'charge.refunded',
      data: {
        object: {
          customer: 'cus_1',
          amount: 5990,
          amount_refunded: 500,
          metadata: { restaurante_id: 'rest-1', pacote_id: 'creditos_2500' },
        },
      },
    } as any);

    expect(rpcMock).not.toHaveBeenCalledWith('debitar_pacote_avulso', expect.anything());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(subscriptionsCancelMock).not.toHaveBeenCalled();
  });

  it('reembolso de pacote avulso com saldo insuficiente debita so o que existe, sem ficar negativo', async () => {
    // A RPC devolve quanto de fato debitou (LEAST(saldo, qtd)); aqui
    // simula o lojista ja tendo consumido parte do pacote.
    rpcMock.mockResolvedValue({ data: 1000, error: null });

    await processarEvento({
      id: 'evt_pacote_parcial',
      type: 'charge.refunded',
      data: {
        object: {
          customer: 'cus_1',
          amount: 5990,
          amount_refunded: 5990,
          metadata: { restaurante_id: 'rest-1', pacote_id: 'creditos_2500' },
        },
      },
    } as any);

    expect(rpcMock).toHaveBeenCalledWith('debitar_pacote_avulso', {
      p_restaurante_id: 'rest-1',
      p_qtd: 2500,
    });
  });

  it('reembolso da assinatura (sem pacote_id na metadata) cancela e zera a cota', async () => {
    await processarEvento({
      id: 'evt_assinatura',
      type: 'charge.refunded',
      data: {
        object: {
          customer: 'cus_1',
          amount: 17999,
          amount_refunded: 17999,
          metadata: { restaurante_id: 'rest-1' },
        },
      },
    } as any);

    expect(subscriptionsCancelMock).toHaveBeenCalledWith('sub_1');
    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'reembolsada' }));
    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', { p_restaurante_id: 'rest-1', p_qtd: 0 });
  });

  // O reembolso total também encerra o serviço: um cancelamento agendado
  // que porventura existisse ficaria órfão e mentiria na tela junto com
  // o status 'reembolsada'.
  it('reembolso total da assinatura limpa um cancelamento agendado que porventura existisse', async () => {
    await processarEvento({
      id: 'evt_assinatura_agendada',
      type: 'charge.refunded',
      data: {
        object: {
          customer: 'cus_1',
          amount: 17999,
          amount_refunded: 17999,
          metadata: { restaurante_id: 'rest-1' },
        },
      },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      cancelamentoAgendadoPara: null,
    }));
  });

  it('reembolso parcial nao altera status nem cota', async () => {
    await processarEvento({
      id: 'evt_7a',
      type: 'charge.refunded',
      data: { object: { customer: 'cus_1', amount: 17999, amount_refunded: 5000 } },
    } as any);

    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(subscriptionsCancelMock).not.toHaveBeenCalled();
  });

  it('reembolso total cancela a assinatura no Stripe, marca reembolsada e zera a cota', async () => {
    await processarEvento({
      id: 'evt_7b',
      type: 'charge.refunded',
      data: { object: { customer: 'cus_1', amount: 17999, amount_refunded: 17999 } },
    } as any);

    expect(subscriptionsCancelMock).toHaveBeenCalledWith('sub_1');
    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'reembolsada' }));
    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', { p_restaurante_id: 'rest-1', p_qtd: 0 });
  });

  it('reembolso total quando a assinatura ja esta cancelada no Stripe nao impede a marcacao do status', async () => {
    subscriptionsCancelMock.mockRejectedValue(new Error('No such subscription'));

    await processarEvento({
      id: 'evt_7c',
      type: 'charge.refunded',
      data: { object: { customer: 'cus_1', amount: 17999, amount_refunded: 17999 } },
    } as any);

    expect(subscriptionsCancelMock).toHaveBeenCalledWith('sub_1');
    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'reembolsada' }));
    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', { p_restaurante_id: 'rest-1', p_qtd: 0 });
  });

  it('reembolso total sem stripe_subscription_id salvo ainda marca reembolsada e zera a cota', async () => {
    buscarAssinaturaMock.mockResolvedValue({ restauranteId: 'rest-1', stripeSubscriptionId: null });

    await processarEvento({
      id: 'evt_7d',
      type: 'charge.refunded',
      data: { object: { customer: 'cus_1', amount: 17999, amount_refunded: 17999 } },
    } as any);

    expect(subscriptionsCancelMock).not.toHaveBeenCalled();
    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'reembolsada' }));
    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', { p_restaurante_id: 'rest-1', p_qtd: 0 });
  });
});

describe('evento de tipo não tratado', () => {
  it('não faz nada e não quebra', async () => {
    await processarEvento({
      id: 'evt_8',
      type: 'customer.updated',
      data: { object: { customer: 'cus_1' } },
    } as any);

    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // Caso real capturado em produção (modo teste): invoice_payment.paid
  // não é um tipo que o handler trata, e o evento não tinha restaurante
  // identificável (customer desconhecido). Antes da correção, a
  // checagem de restaurante rodava ANTES do filtro de tipo tratado e
  // lançava de propósito — fazendo o Stripe retentar para sempre um
  // evento que nunca teria o que fazer. Tipo não tratado precisa sair
  // cedo, sem sequer tentar identificar o restaurante.
  it('evento de tipo nao tratado e sem restaurante identificavel nao lanca e nao escreve nada', async () => {
    buscarPorCustomerIdMock.mockResolvedValue(null);

    await expect(processarEvento({
      id: 'evt_1U06GgCEV8Y7cUalpjHTUnaq',
      type: 'invoice_payment.paid',
      data: { object: { customer: 'cus_fantasma' } },
    } as any)).resolves.toBeUndefined();

    expect(buscarPorCustomerIdMock).not.toHaveBeenCalled();
    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('restaurante não encontrado', () => {
  // Lança em vez de retornar em silêncio: o registro de idempotência já
  // foi gravado antes de chegar aqui, e um `return` o deixaria valendo
  // como sucesso — o reenvio do Stripe (que resolveria uma corrida com o
  // salvamento do customer id) seria descartado como duplicata para
  // sempre. Lançando, o chamador remove o registro e o reenvio funciona.
  it('lança e não escreve nada quando o customer é desconhecido', async () => {
    buscarPorCustomerIdMock.mockResolvedValue(null);

    await expect(processarEvento({
      id: 'evt_9',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_fantasma' } },
    } as any)).rejects.toThrow(/sem restaurante identificavel/i);

    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
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

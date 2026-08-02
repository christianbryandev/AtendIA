import { describe, it, expect, vi, beforeEach } from 'vitest';

const criarSessaoMock = vi.fn();
const criarCustomerMock = vi.fn();
const criarPortalMock = vi.fn();

vi.mock('./stripe-client.js', () => ({
  getStripe: () => ({
    customers: { create: criarCustomerMock },
    checkout: { sessions: { create: criarSessaoMock } },
    billingPortal: { sessions: { create: criarPortalMock } },
  }),
}));

const buscarAssinaturaMock = vi.fn();
const salvarCustomerIdMock = vi.fn();

vi.mock('./assinatura-repo.js', () => ({
  buscarAssinatura: (...args: unknown[]) => buscarAssinaturaMock(...args),
  salvarCustomerId: (...args: unknown[]) => salvarCustomerIdMock(...args),
}));

const { criarSessaoAssinatura, criarSessaoPacote, criarSessaoPortal } = await import('./checkout.js');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_ASSINATURA = 'price_assinatura';
  process.env.STRIPE_PRICE_CREDITOS_5000 = 'price_5000';
  criarSessaoMock.mockResolvedValue({ url: 'https://checkout.stripe.com/sessao' });
  criarCustomerMock.mockResolvedValue({ id: 'cus_novo' });
  criarPortalMock.mockResolvedValue({ url: 'https://billing.stripe.com/sessao' });
});

describe('criarSessaoAssinatura', () => {
  it('cria o Customer na primeira vez e guarda o id', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: null });

    const url = await criarSessaoAssinatura('rest-1', 'marina@pizzaria.com.br');

    expect(criarCustomerMock).toHaveBeenCalledOnce();
    expect(salvarCustomerIdMock).toHaveBeenCalledWith('rest-1', 'cus_novo');
    expect(url).toBe('https://checkout.stripe.com/sessao');
  });

  it('reaproveita o Customer quando já existe', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: 'cus_antigo' });

    await criarSessaoAssinatura('rest-1', 'marina@pizzaria.com.br');

    expect(criarCustomerMock).not.toHaveBeenCalled();
    expect(criarSessaoMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_antigo', mode: 'subscription' }),
    );
  });

  it('manda o restaurante_id na sessão, para o webhook saber de quem é', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: 'cus_1' });

    await criarSessaoAssinatura('rest-42', 'marina@pizzaria.com.br');

    expect(criarSessaoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: 'rest-42',
        metadata: expect.objectContaining({ restaurante_id: 'rest-42' }),
      }),
    );
  });

  // O Stripe NÃO impede duas assinaturas do mesmo preço para o mesmo
  // Customer. Sem esta trava, o lojista é cobrado em dobro.
  it('recusa quando a assinatura já está ativa', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa', stripeCustomerId: 'cus_1' });

    await expect(criarSessaoAssinatura('rest-1', 'marina@pizzaria.com.br'))
      .rejects.toThrow('Esta conta já tem uma assinatura ativa.');

    expect(criarSessaoMock).not.toHaveBeenCalled();
  });

  // 'inadimplente' ainda tem uma assinatura viva no Stripe (dunning).
  // Sem esta trava, o lojista duplicaria a cobrança em vez de resolver
  // o atraso pelo Customer Portal.
  it('recusa quando a assinatura está inadimplente', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'inadimplente', stripeCustomerId: 'cus_1' });

    await expect(criarSessaoAssinatura('rest-1', 'marina@pizzaria.com.br'))
      .rejects.toThrow('Esta conta tem uma assinatura com pagamento pendente. Abra o portal de cobrança para regularizar.');

    expect(criarSessaoMock).not.toHaveBeenCalled();
  });
});

describe('criarSessaoPacote', () => {
  it('abre a sessão em modo payment com o price do pacote', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa', stripeCustomerId: 'cus_1' });

    await criarSessaoPacote('rest-1', 'creditos_5000');

    expect(criarSessaoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        line_items: [{ price: 'price_5000', quantity: 1 }],
      }),
    );
  });

  // A metadata da Checkout Session NÃO desce para a Charge. Sem
  // repeti-la no PaymentIntent, o reembolso de um pacote chega ao
  // webhook indistinguível do reembolso da mensalidade — e o handler
  // cancelaria a assinatura e zeraria a cota do restaurante.
  it('repassa a metadata do pacote para o PaymentIntent, para a Charge herdar', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa', stripeCustomerId: 'cus_1' });

    await criarSessaoPacote('rest-1', 'creditos_5000');

    expect(criarSessaoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: {
          metadata: { restaurante_id: 'rest-1', pacote_id: 'creditos_5000' },
        },
      }),
    );
  });

  it('recusa pacote que não existe no catálogo', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa', stripeCustomerId: 'cus_1' });

    await expect(criarSessaoPacote('rest-1', 'creditos_999'))
      .rejects.toThrow('Pacote inválido.');
  });

  // Comprar crédito sem assinatura deixaria o lojista com saldo e sem
  // painel para usá-lo.
  it('recusa quem não tem assinatura ativa', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: 'cus_1' });

    await expect(criarSessaoPacote('rest-1', 'creditos_5000'))
      .rejects.toThrow('É preciso ter uma assinatura ativa para comprar créditos.');
  });
});

describe('criarSessaoPortal', () => {
  it('abre o portal para o Customer da conta', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa', stripeCustomerId: 'cus_1' });

    const url = await criarSessaoPortal('rest-1');

    expect(criarPortalMock).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }));
    expect(url).toBe('https://billing.stripe.com/sessao');
  });

  it('recusa quando a conta nunca chegou a ter Customer', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: null });

    await expect(criarSessaoPortal('rest-1')).rejects.toThrow('Nenhuma assinatura para gerenciar.');
  });
});

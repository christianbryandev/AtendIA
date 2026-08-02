import { describe, it, expect, vi, beforeEach } from 'vitest';

const listarSubscriptionsMock = vi.fn();
const atualizarStatusMock = vi.fn();
const buscarAssinaturaMock = vi.fn();

vi.mock('./stripe-client.js', () => ({
  getStripe: () => ({ subscriptions: { list: listarSubscriptionsMock } }),
}));

vi.mock('./assinatura-repo.js', () => ({
  atualizarStatus: (...a: unknown[]) => atualizarStatusMock(...a),
  buscarAssinatura: (...a: unknown[]) => buscarAssinaturaMock(...a),
}));

const { reconciliarSePreciso } = await import('./status.js');

const agora = () => new Date().toISOString();
const minutosAtras = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  listarSubscriptionsMock.mockResolvedValue({ data: [] });
});

describe('reconciliarSePreciso', () => {
  it('não consulta o Stripe quando a assinatura já está ativa', async () => {
    const status = await reconciliarSePreciso('rest-1', minutosAtras(60), 'ativa');

    expect(listarSubscriptionsMock).not.toHaveBeenCalled();
    expect(status).toBe('ativa');
  });

  // Nos primeiros minutos o webhook ainda está a caminho. Consultar aí
  // só gastaria chamada de API.
  it('não consulta o Stripe quando está pendente há pouco tempo', async () => {
    const status = await reconciliarSePreciso('rest-1', minutosAtras(2), 'pendente');

    expect(listarSubscriptionsMock).not.toHaveBeenCalled();
    expect(status).toBe('pendente');
  });

  it('consulta o Stripe quando está pendente há mais de 5 minutos', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });

    await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(listarSubscriptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', status: 'active' }),
    );
  });

  it('ativa a conta quando o Stripe diz que a assinatura existe', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    listarSubscriptionsMock.mockResolvedValue({
      data: [{ id: 'sub_1', current_period_end: 1793491200 }],
    });

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      status: 'ativa',
      stripeSubscriptionId: 'sub_1',
    }));
    expect(status).toBe('ativa');
  });

  it('mantém pendente quando o Stripe também não conhece assinatura', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(status).toBe('pendente');
  });

  it('não quebra quando a conta ainda não tem Customer', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: null });

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(listarSubscriptionsMock).not.toHaveBeenCalled();
    expect(status).toBe('pendente');
  });

  // Uma indisponibilidade do Stripe não pode transformar a tela de
  // status em erro: o lojista continua vendo 'pendente' e tenta de novo.
  it('devolve o status atual quando o Stripe falha', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    listarSubscriptionsMock.mockRejectedValue(new Error('Stripe fora do ar'));

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(status).toBe('pendente');
  });
});

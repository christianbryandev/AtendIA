import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const rpcMock = vi.fn();

vi.mock('../../config/supabase.js', () => ({
  supabaseAdmin: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

const { reconciliarSePreciso, _resetLimiteDeConsultaStripeParaTeste } = await import('./status.js');
const { CREDITOS_DA_COTA } = await import('./cota.js');

const agora = () => new Date().toISOString();
const minutosAtras = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  listarSubscriptionsMock.mockResolvedValue({ data: [] });
  rpcMock.mockResolvedValue({ data: null, error: null });
  // O limite de consultas ao Stripe vive num mapa a nível de módulo; sem
  // limpá-lo, um teste vaza estado pro próximo (ambos usam 'rest-1').
  _resetLimiteDeConsultaStripeParaTeste();
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

  // current_period_end vive em items.data[], não na raiz da Subscription,
  // na versão de API do SDK instalado. O mock reproduz o formato real.
  const subscriptionAtiva = {
    id: 'sub_1',
    items: { data: [{ current_period_end: 1793491200 }] },
  };

  it('ativa a conta quando o Stripe diz que a assinatura existe', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    listarSubscriptionsMock.mockResolvedValue({ data: [subscriptionAtiva] });

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      status: 'ativa',
      stripeSubscriptionId: 'sub_1',
    }));
    expect(status).toBe('ativa');
  });

  // Sem isto o lojista paga, o painel abre e a IA fica muda: quem credita
  // a cota é o webhook, que nesta situação é justamente o que não chegou.
  it('credita a cota mensal ao reconciliar com sucesso', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    listarSubscriptionsMock.mockResolvedValue({ data: [subscriptionAtiva] });

    await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', {
      p_restaurante_id: 'rest-1',
      p_qtd: CREDITOS_DA_COTA,
    });
  });

  it('grava o fim do periodo lido de items.data[0].current_period_end', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    listarSubscriptionsMock.mockResolvedValue({ data: [subscriptionAtiva] });

    await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      periodoFim: new Date(1793491200 * 1000).toISOString(),
    }));
  });

  // A cota é creditada ANTES do status virar 'ativa'. Se a ordem fosse a
  // inversa e a RPC falhasse, a reconciliação nunca mais rodaria (ela só
  // age sobre 'pendente') e a cota ficaria perdida até a renovação.
  it('mantém pendente quando a RPC de cota falha, para a próxima consulta tentar de novo', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    listarSubscriptionsMock.mockResolvedValue({ data: [subscriptionAtiva] });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'banco fora do ar' } });

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(status).toBe('pendente');
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

  // A tela de confirmação de pagamento faz polling desta rota a cada
  // poucos segundos. Sem um teto por restaurante, isso vira uma rajada
  // de chamadas ao Stripe sem limite.
  describe('limite de uma consulta ao Stripe por minuto', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
      buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // Id exclusivo destes testes: o mapa de limite é do módulo (compartilhado
    // entre testes) e os demais casos deste arquivo rodam com o relógio real,
    // então usar 'rest-1' aqui poderia herdar uma entrada com timestamp real.
    const restauranteId = 'rest-limite-stripe';

    it('consulta o Stripe na primeira chamada', async () => {
      await reconciliarSePreciso(restauranteId, minutosAtras(10), 'pendente');

      expect(listarSubscriptionsMock).toHaveBeenCalledTimes(1);
    });

    it('não consulta o Stripe de novo dentro da janela de 60s, e devolve o status do banco', async () => {
      await reconciliarSePreciso(restauranteId, minutosAtras(10), 'pendente');
      listarSubscriptionsMock.mockClear();

      vi.advanceTimersByTime(30_000);
      const status = await reconciliarSePreciso(restauranteId, minutosAtras(10), 'pendente');

      expect(listarSubscriptionsMock).not.toHaveBeenCalled();
      expect(status).toBe('pendente');
    });

    it('volta a consultar o Stripe depois que a janela de 60s passa', async () => {
      await reconciliarSePreciso(restauranteId, minutosAtras(10), 'pendente');
      listarSubscriptionsMock.mockClear();

      vi.advanceTimersByTime(60_001);
      await reconciliarSePreciso(restauranteId, minutosAtras(10), 'pendente');

      expect(listarSubscriptionsMock).toHaveBeenCalledTimes(1);
    });
  });
});

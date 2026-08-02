import { describe, it, expect } from 'vitest';
import { PACOTES, pacotePorId, pacotePorPriceId } from './pacotes.js';

describe('PACOTES', () => {
  it('tem os três pacotes acordados', () => {
    expect(PACOTES.map((p) => [p.creditos, p.precoCentavos])).toEqual([
      [2500, 5990],
      [5000, 10990],
      [10000, 19990],
    ]);
  });

  // Se o avulso ficar mais barato por crédito que o plano, vale mais a
  // pena comprar avulso do que assinar — e o negócio se canibaliza.
  it('mantém todo pacote mais caro por crédito que o plano', () => {
    const precoPorCreditoDoPlano = 17999 / 10000;

    for (const pacote of PACOTES) {
      expect(pacote.precoCentavos / pacote.creditos).toBeGreaterThan(precoPorCreditoDoPlano);
    }
  });
});

describe('pacotePorId', () => {
  it('encontra pelo id', () => {
    expect(pacotePorId('creditos_2500')?.creditos).toBe(2500);
  });

  it('devolve undefined para id desconhecido', () => {
    expect(pacotePorId('creditos_999')).toBeUndefined();
  });
});

describe('pacotePorPriceId', () => {
  it('encontra o pacote pelo price id configurado', () => {
    process.env.STRIPE_PRICE_CREDITOS_5000 = 'price_teste_5000';
    expect(pacotePorPriceId('price_teste_5000')?.creditos).toBe(5000);
  });

  it('devolve undefined para price id desconhecido', () => {
    expect(pacotePorPriceId('price_que_nao_existe')).toBeUndefined();
  });

  // Sem esta guarda, um evento do Stripe sem price id casaria com
  // qualquer pacote cujo env var não estivesse configurado.
  it('devolve undefined para price id vazio', () => {
    expect(pacotePorPriceId('')).toBeUndefined();
  });
});

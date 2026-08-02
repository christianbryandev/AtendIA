export interface Pacote {
  id: string;
  creditos: number;
  precoCentavos: number;
  rotulo: string;
  priceId: string;
}

const DEFINICOES = [
  { id: 'creditos_2500', creditos: 2500, precoCentavos: 5990, rotulo: '2.500 créditos', envVar: 'STRIPE_PRICE_CREDITOS_2500' },
  { id: 'creditos_5000', creditos: 5000, precoCentavos: 10990, rotulo: '5.000 créditos', envVar: 'STRIPE_PRICE_CREDITOS_5000' },
  { id: 'creditos_10000', creditos: 10000, precoCentavos: 19990, rotulo: '10.000 créditos', envVar: 'STRIPE_PRICE_CREDITOS_10000' },
] as const;

// O price id é lido do ambiente a cada acesso, não congelado no import:
// trocar de conta Stripe (teste para produção) não exige recompilar.
export const PACOTES: Pacote[] = DEFINICOES.map((d) => ({
  id: d.id,
  creditos: d.creditos,
  precoCentavos: d.precoCentavos,
  rotulo: d.rotulo,
  get priceId() {
    return process.env[d.envVar] || '';
  },
})) as Pacote[];

export function pacotePorId(id: string): Pacote | undefined {
  return PACOTES.find((p) => p.id === id);
}

export function pacotePorPriceId(priceId: string): Pacote | undefined {
  if (!priceId) return undefined;
  return PACOTES.find((p) => p.priceId === priceId);
}

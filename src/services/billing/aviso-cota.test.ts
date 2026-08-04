import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
const enviarEmailMock = vi.fn();

vi.mock('../../config/supabase.js', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...a) },
}));

vi.mock('../email/resend-client.js', () => ({
  enviarEmail: (...a: unknown[]) => enviarEmailMock(...a),
}));

const { avisarCotaEsgotadaSeNecessario } = await import('./aviso-cota.js');

const RESTAURANTE_ID = 'rest-1';

interface CenarioMock {
  periodoFim: string | null;
  avisoCotaEsgotadaPeriodoFim: string | null;
  usuarios?: { email: string }[];
}

let restauranteAtualizado: Record<string, unknown> | undefined;

function montarMocks({ periodoFim, avisoCotaEsgotadaPeriodoFim, usuarios }: CenarioMock) {
  restauranteAtualizado = undefined;

  fromMock.mockImplementation((tabela: string) => {
    if (tabela === 'assinaturas') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { periodo_fim: periodoFim }, error: null }),
          }),
        }),
      };
    }
    if (tabela === 'restaurantes') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  nome: 'Pizzaria do Bairro',
                  aviso_cota_esgotada_periodo_fim: avisoCotaEsgotadaPeriodoFim,
                },
                error: null,
              }),
          }),
        }),
        update: (valores: Record<string, unknown>) => ({
          eq: () => {
            restauranteAtualizado = valores;
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (tabela === 'usuarios') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: usuarios ?? [{ email: 'dono@pizzaria.com.br' }], error: null }),
        }),
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });
}

beforeEach(() => {
  fromMock.mockReset();
  enviarEmailMock.mockReset();
  enviarEmailMock.mockResolvedValue(undefined);
});

describe('avisarCotaEsgotadaSeNecessario', () => {
  it('envia o aviso no primeiro esgotamento do ciclo', async () => {
    montarMocks({ periodoFim: '2026-09-01T00:00:00.000Z', avisoCotaEsgotadaPeriodoFim: null });

    await avisarCotaEsgotadaSeNecessario(RESTAURANTE_ID);

    expect(enviarEmailMock).toHaveBeenCalledTimes(1);
    expect(enviarEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'dono@pizzaria.com.br' }),
    );
    expect(restauranteAtualizado).toEqual({
      aviso_cota_esgotada_periodo_fim: '2026-09-01T00:00:00.000Z',
    });
  });

  it('nao envia de novo para um segundo esgotamento no mesmo ciclo', async () => {
    montarMocks({
      periodoFim: '2026-09-01T00:00:00.000Z',
      avisoCotaEsgotadaPeriodoFim: '2026-09-01T00:00:00.000Z',
    });

    await avisarCotaEsgotadaSeNecessario(RESTAURANTE_ID);

    expect(enviarEmailMock).not.toHaveBeenCalled();
    expect(restauranteAtualizado).toBeUndefined();
  });

  it('envia de novo depois que o periodo_fim muda (ciclo novo)', async () => {
    montarMocks({
      periodoFim: '2026-10-01T00:00:00.000Z',
      avisoCotaEsgotadaPeriodoFim: '2026-09-01T00:00:00.000Z',
    });

    await avisarCotaEsgotadaSeNecessario(RESTAURANTE_ID);

    expect(enviarEmailMock).toHaveBeenCalledTimes(1);
    expect(restauranteAtualizado).toEqual({
      aviso_cota_esgotada_periodo_fim: '2026-10-01T00:00:00.000Z',
    });
  });

  it('nao envia quando o periodo_fim e desconhecido (assinatura sem periodo)', async () => {
    montarMocks({ periodoFim: null, avisoCotaEsgotadaPeriodoFim: null });

    await avisarCotaEsgotadaSeNecessario(RESTAURANTE_ID);

    expect(enviarEmailMock).not.toHaveBeenCalled();
    expect(restauranteAtualizado).toBeUndefined();
  });
});

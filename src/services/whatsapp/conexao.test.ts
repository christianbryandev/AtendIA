import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decrypt } from '../../utils/crypto.js';

const updateMock = vi.fn();
const eqUpdateMock = vi.fn();
const singleMock = vi.fn();
const eqSelectMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();

// Encadeamento igual ao usado em cardapio-repo.ts: .from().update().eq()
// resolve para { error }; .from().select().eq().single() resolve para
// { data, error }.
vi.mock('../../config/supabase.js', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...a) },
}));

const { testarConexao, salvarConexao, estadoDaConexao } = await import('./conexao.js');

beforeEach(() => {
  vi.clearAllMocks();
  fromMock.mockReturnValue({ update: updateMock, select: selectMock });
  updateMock.mockReturnValue({ eq: eqUpdateMock });
  eqUpdateMock.mockResolvedValue({ error: null });
  selectMock.mockReturnValue({ eq: eqSelectMock });
  eqSelectMock.mockReturnValue({ single: singleMock });
  singleMock.mockResolvedValue({ data: { meta_phone_number_id: null, meta_display_phone_number: null }, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('testarConexao', () => {
  it('devolve ok e o numero quando o token e valido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ display_phone_number: '+55 11 91234-5678', verified_name: 'Pizzaria da Marina' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await testarConexao('1234567890', 'token-valido');

    expect(resultado).toEqual({ ok: true, numero: '+55 11 91234-5678' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/1234567890',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-valido' }) }),
    );
  });

  it('devolve mensagem em portugues quando o token e invalido ou expirado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190 },
        }),
      }),
    );

    const resultado = await testarConexao('1234567890', 'token-expirado');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro).not.toMatch(/Session has expired/i);
      expect(resultado.erro.toLowerCase()).toContain('token');
    }
  });

  it('devolve mensagem em portugues quando o numero nao e encontrado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: { message: "Unsupported get request. Object with ID '999' does not exist", type: 'GraphMethodException', code: 100 },
        }),
      }),
    );

    const resultado = await testarConexao('999', 'algum-token');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro).not.toMatch(/Unsupported get request/i);
      expect(resultado.erro.toLowerCase()).toContain('número');
    }
  });

  it('devolve mensagem em portugues quando falta permissao', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: { message: '(#10) Application does not have permission for this action', type: 'OAuthException', code: 10 },
        }),
      }),
    );

    const resultado = await testarConexao('1234567890', 'token-sem-permissao');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro).not.toMatch(/Application does not have permission/i);
      expect(resultado.erro.toLowerCase()).toContain('permiss');
    }
  });

  it('devolve ok:false sem lancar quando ha falha de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const resultado = await testarConexao('1234567890', 'qualquer-token');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro).not.toMatch(/ECONNRESET/i);
      expect(resultado.erro.length).toBeGreaterThan(0);
    }
  });
});

describe('salvarConexao', () => {
  it('grava o token cifrado, nunca em texto puro, e decrypt o recupera', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ display_phone_number: '+55 11 91234-5678' }),
      }),
    );
    const tokenOriginal = 'EAAG-token-secreto-da-meta';

    await salvarConexao('rest-1', '1234567890', tokenOriginal);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const dadosGravados = updateMock.mock.calls[0][0] as {
      meta_phone_number_id: string;
      meta_access_token: string;
      meta_display_phone_number: string | null;
    };

    expect(dadosGravados.meta_phone_number_id).toBe('1234567890');
    expect(dadosGravados.meta_access_token).not.toBe(tokenOriginal);
    expect(decrypt(dadosGravados.meta_access_token)).toBe(tokenOriginal);

    expect(eqUpdateMock).toHaveBeenCalledWith('id', 'rest-1');
  });

  it('persiste o telefone legivel devolvido pela Meta ao testar a conexao', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ display_phone_number: '+55 11 91234-5678' }),
      }),
    );

    await salvarConexao('rest-1', '1234567890', 'token-valido');

    const dadosGravados = updateMock.mock.calls[0][0] as { meta_display_phone_number: string | null };
    expect(dadosGravados.meta_display_phone_number).toBe('+55 11 91234-5678');
  });

  it('salva mesmo quando a Meta nao responde, mas sem telefone legivel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    await salvarConexao('rest-1', '1234567890', 'token-qualquer');

    const dadosGravados = updateMock.mock.calls[0][0] as { meta_display_phone_number: string | null };
    expect(dadosGravados.meta_display_phone_number).toBeNull();
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('lanca quando o supabase devolve erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem rede')));
    eqUpdateMock.mockResolvedValue({ error: { message: 'falhou' } });

    await expect(salvarConexao('rest-1', '1234567890', 'token')).rejects.toBeTruthy();
  });
});

describe('estadoDaConexao', () => {
  it('devolve conectado:false quando nao ha numero salvo', async () => {
    singleMock.mockResolvedValue({ data: { meta_phone_number_id: null, meta_display_phone_number: null }, error: null });

    const estado = await estadoDaConexao('rest-1');

    expect(estado).toEqual({ conectado: false, numero: null });
  });

  it('devolve conectado:true e o telefone legivel quando ja ha conexao salva com a migration aplicada', async () => {
    singleMock.mockResolvedValue({
      data: { meta_phone_number_id: '1234567890', meta_display_phone_number: '+55 11 91234-5678' },
      error: null,
    });

    const estado = await estadoDaConexao('rest-1');

    expect(estado).toEqual({ conectado: true, numero: '+55 11 91234-5678' });
    expect(eqSelectMock).toHaveBeenCalledWith('id', 'rest-1');
  });

  // Conexões salvas antes da migration 012 (ou cujo último save falhou ao
  // consultar a Meta) não têm meta_display_phone_number: o estado continua
  // conectado, mas sem telefone para exibir — nunca cai de volta no ID.
  it('devolve conectado:true e numero:null quando falta o telefone legivel (conexao anterior a migration)', async () => {
    singleMock.mockResolvedValue({
      data: { meta_phone_number_id: '1234567890', meta_display_phone_number: null },
      error: null,
    });

    const estado = await estadoDaConexao('rest-1');

    expect(estado).toEqual({ conectado: true, numero: null });
  });

  // Nunca deve devolver o token, nem cifrado: a query so pede as colunas do
  // numero de telefone.
  it('nunca seleciona a coluna do token', async () => {
    await estadoDaConexao('rest-1');

    expect(selectMock).toHaveBeenCalledWith(expect.not.stringContaining('meta_access_token'));
  });
});

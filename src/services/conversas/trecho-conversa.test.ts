import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();

vi.mock('../../config/supabase.js', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...a) },
}));

import { buscarTrechosUltimaMensagem } from './trecho-conversa.js';

function mockMensagens(rows: unknown[] | null, error: unknown = null) {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        in: () => ({
          order: () => Promise.resolve({ data: rows, error }),
        }),
      }),
    }),
  });
}

describe('buscarTrechosUltimaMensagem', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('pega o trecho da mensagem mais recente de cada conversa, sem misturar telefones', async () => {
    mockMensagens([
      {
        telefone_cliente: '5511111111111',
        tipo: 'texto',
        texto: 'Mensagem mais recente do cliente 1',
        transcricao: null,
        created_at: '2026-08-03T12:00:00.000Z',
      },
      {
        telefone_cliente: '5522222222222',
        tipo: 'texto',
        texto: 'Mensagem mais recente do cliente 2',
        transcricao: null,
        created_at: '2026-08-03T11:00:00.000Z',
      },
      {
        telefone_cliente: '5511111111111',
        tipo: 'texto',
        texto: 'Mensagem antiga do cliente 1',
        transcricao: null,
        created_at: '2026-08-03T10:00:00.000Z',
      },
    ]);

    const trechos = await buscarTrechosUltimaMensagem('rest-1', ['5511111111111', '5522222222222']);

    expect(trechos.get('5511111111111')).toBe('Mensagem mais recente do cliente 1');
    expect(trechos.get('5522222222222')).toBe('Mensagem mais recente do cliente 2');
  });

  it('áudio sem transcrição vira o marcador "Áudio", nunca string vazia', async () => {
    mockMensagens([
      {
        telefone_cliente: '5511111111111',
        tipo: 'audio',
        texto: null,
        transcricao: null,
        created_at: '2026-08-03T12:00:00.000Z',
      },
    ]);

    const trechos = await buscarTrechosUltimaMensagem('rest-1', ['5511111111111']);

    expect(trechos.get('5511111111111')).toBe('Áudio');
  });

  it('áudio com transcrição usa a transcrição', async () => {
    mockMensagens([
      {
        telefone_cliente: '5511111111111',
        tipo: 'audio',
        texto: null,
        transcricao: 'Quero uma pizza grande',
        created_at: '2026-08-03T12:00:00.000Z',
      },
    ]);

    const trechos = await buscarTrechosUltimaMensagem('rest-1', ['5511111111111']);

    expect(trechos.get('5511111111111')).toBe('Quero uma pizza grande');
  });

  it('trunca mensagens longas em torno de 80 caracteres com reticências', async () => {
    const textoLongo = 'a'.repeat(120);
    mockMensagens([
      {
        telefone_cliente: '5511111111111',
        tipo: 'texto',
        texto: textoLongo,
        transcricao: null,
        created_at: '2026-08-03T12:00:00.000Z',
      },
    ]);

    const trechos = await buscarTrechosUltimaMensagem('rest-1', ['5511111111111']);
    const trecho = trechos.get('5511111111111');

    expect(trecho).toBeDefined();
    expect(trecho!.length).toBeLessThanOrEqual(81);
    expect(trecho).toMatch(/…$/);
  });

  it('lista de telefones vazia não consulta o banco', async () => {
    const trechos = await buscarTrechosUltimaMensagem('rest-1', []);

    expect(trechos.size).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('propaga o erro do Supabase em vez de engolir silenciosamente', async () => {
    mockMensagens(null, { message: 'Erro de conexão' });

    await expect(buscarTrechosUltimaMensagem('rest-1', ['5511111111111'])).rejects.toBeTruthy();
  });
});

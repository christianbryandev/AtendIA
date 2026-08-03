import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const buscarConversaMock = vi.fn();
const registrarMensagemNossaMock = vi.fn();
const gravarMensagemMock = vi.fn();
const marcarStatusMock = vi.fn();
const sendWhatsAppTextMessageMock = vi.fn();
const fromMock = vi.fn();
const decryptMock = vi.fn();

vi.mock('./conversa-repo.js', () => ({
  buscarConversa: (...a: unknown[]) => buscarConversaMock(...a),
  registrarMensagemNossa: (...a: unknown[]) => registrarMensagemNossaMock(...a),
}));

vi.mock('./mensagem-repo.js', () => ({
  gravarMensagem: (...a: unknown[]) => gravarMensagemMock(...a),
  marcarStatus: (...a: unknown[]) => marcarStatusMock(...a),
}));

vi.mock('../whatsapp/meta-cloud-api.js', () => ({
  sendWhatsAppTextMessage: (...a: unknown[]) => sendWhatsAppTextMessageMock(...a),
}));

vi.mock('../../config/supabase.js', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...a) },
}));

vi.mock('../../config/env.js', () => ({
  env: { META_WHATSAPP_TOKEN: 'token-de-ambiente' },
}));

vi.mock('../../utils/crypto.js', () => ({
  decrypt: (...a: unknown[]) => decryptMock(...a),
}));

import { enviarMensagemDoLojista } from './envio.js';

const RESTAURANTE_ID = 'rest-1';
const TELEFONE = '5511999999999';
const AGORA = new Date('2026-08-03T12:00:00.000Z');

function mockRestaurante(row: { meta_phone_number_id: string | null; meta_access_token: string | null } | null) {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: row, error: null }),
      }),
    }),
  });
}

describe('enviarMensagemDoLojista', () => {
  beforeEach(() => {
    vi.setSystemTime(AGORA);
    buscarConversaMock.mockReset();
    registrarMensagemNossaMock.mockReset();
    gravarMensagemMock.mockReset();
    marcarStatusMock.mockReset();
    sendWhatsAppTextMessageMock.mockReset();
    fromMock.mockReset();
    decryptMock.mockReset();
    mockRestaurante({ meta_phone_number_id: 'PHONE-123', meta_access_token: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('com a janela aberta, grava a mensagem como enviando, chama a Meta e marca ok', async () => {
    buscarConversaMock.mockResolvedValue({
      id: 'conv-1',
      restauranteId: RESTAURANTE_ID,
      telefoneCliente: TELEFONE,
      ultimaMensagemClienteEm: '2026-08-03T11:00:00.000Z',
      ultimaMensagemEm: '2026-08-03T11:00:00.000Z',
      sobControleHumano: true,
      controleAssumidoEm: '2026-08-03T11:00:00.000Z',
    });
    gravarMensagemMock.mockResolvedValue('msg-1');
    sendWhatsAppTextMessageMock.mockResolvedValue({ success: true });

    const resultado = await enviarMensagemDoLojista(RESTAURANTE_ID, TELEFONE, 'Oi, tudo bem?');

    expect(resultado).toEqual({ ok: true, id: 'msg-1' });
    expect(gravarMensagemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        restauranteId: RESTAURANTE_ID,
        telefoneCliente: TELEFONE,
        direcao: 'enviada',
        autor: 'lojista',
        texto: 'Oi, tudo bem?',
        status: 'enviando',
      }),
    );
    expect(sendWhatsAppTextMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toPhoneNumber: TELEFONE,
        text: 'Oi, tudo bem?',
        phoneNumberId: 'PHONE-123',
        token: 'token-de-ambiente',
      }),
    );
    expect(marcarStatusMock).toHaveBeenCalledWith(RESTAURANTE_ID, 'msg-1', 'ok');
    expect(registrarMensagemNossaMock).toHaveBeenCalledWith(RESTAURANTE_ID, TELEFONE, expect.any(String));
  });

  // O teste central da tarefa: janela fechada recusa SEM chamar a Meta.
  // Sem ele, o bloqueio existiria só no front e uma requisição direta
  // ao endpoint contornaria a checagem.
  it('com a janela fechada, recusa sem chamar a Meta', async () => {
    buscarConversaMock.mockResolvedValue({
      id: 'conv-1',
      restauranteId: RESTAURANTE_ID,
      telefoneCliente: TELEFONE,
      // mais de 24h antes de AGORA: janela fechada.
      ultimaMensagemClienteEm: '2026-08-02T10:00:00.000Z',
      ultimaMensagemEm: '2026-08-02T10:00:00.000Z',
      sobControleHumano: true,
      controleAssumidoEm: '2026-08-02T10:00:00.000Z',
    });

    const resultado = await enviarMensagemDoLojista(RESTAURANTE_ID, TELEFONE, 'Oi, tudo bem?');

    expect(resultado.ok).toBe(false);
    expect((resultado as { ok: false; erro: string }).erro).toMatch(/24 horas/);
    expect(sendWhatsAppTextMessageMock).not.toHaveBeenCalled();
    expect(gravarMensagemMock).not.toHaveBeenCalled();
    expect(marcarStatusMock).not.toHaveBeenCalled();
  });

  it('quando a Meta falha, marca a mensagem como falha e devolve o motivo sem lancar', async () => {
    buscarConversaMock.mockResolvedValue({
      id: 'conv-1',
      restauranteId: RESTAURANTE_ID,
      telefoneCliente: TELEFONE,
      ultimaMensagemClienteEm: '2026-08-03T11:00:00.000Z',
      ultimaMensagemEm: '2026-08-03T11:00:00.000Z',
      sobControleHumano: true,
      controleAssumidoEm: '2026-08-03T11:00:00.000Z',
    });
    gravarMensagemMock.mockResolvedValue('msg-2');
    sendWhatsAppTextMessageMock.mockRejectedValue(new Error('Erro tecnico da Meta'));

    const resultado = await expect(
      enviarMensagemDoLojista(RESTAURANTE_ID, TELEFONE, 'Oi'),
    ).resolves.toEqual({
      ok: false,
      erro: 'Não foi possível entregar a mensagem. Tente novamente.',
    });

    expect(marcarStatusMock).toHaveBeenCalledWith(RESTAURANTE_ID, 'msg-2', 'falha', 'Erro tecnico da Meta');
  });

  it('quando o Supabase falha na busca do restaurante, devolve erro de infraestrutura e nao chama a Meta', async () => {
    buscarConversaMock.mockResolvedValue({
      id: 'conv-1',
      restauranteId: RESTAURANTE_ID,
      telefoneCliente: TELEFONE,
      ultimaMensagemClienteEm: '2026-08-03T11:00:00.000Z',
      ultimaMensagemEm: '2026-08-03T11:00:00.000Z',
      sobControleHumano: true,
      controleAssumidoEm: '2026-08-03T11:00:00.000Z',
    });

    // Mock de erro do Supabase
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'Erro de conexao com banco de dados' } }),
        }),
      }),
    });

    const resultado = await enviarMensagemDoLojista(RESTAURANTE_ID, TELEFONE, 'Oi');

    expect(resultado.ok).toBe(false);
    // Mensagem deve indicar erro de infraestrutura, nao de "nao conectou WhatsApp"
    const erro = (resultado as { ok: false; erro: string }).erro;
    expect(erro).toMatch(/infraestrutura|dados do restaurante|tente novamente/i);
    expect(sendWhatsAppTextMessageMock).not.toHaveBeenCalled();
    expect(gravarMensagemMock).not.toHaveBeenCalled();
  });

  it('quando decrypt lancca (token corrompido), devolve erro sem propagar a excecao', async () => {
    buscarConversaMock.mockResolvedValue({
      id: 'conv-1',
      restauranteId: RESTAURANTE_ID,
      telefoneCliente: TELEFONE,
      ultimaMensagemClienteEm: '2026-08-03T11:00:00.000Z',
      ultimaMensagemEm: '2026-08-03T11:00:00.000Z',
      sobControleHumano: true,
      controleAssumidoEm: '2026-08-03T11:00:00.000Z',
    });
    mockRestaurante({ meta_phone_number_id: 'PHONE-123', meta_access_token: 'token-criptografado' });
    decryptMock.mockImplementation(() => {
      throw new Error('Token corrompido no banco de dados');
    });

    const resultado = await enviarMensagemDoLojista(RESTAURANTE_ID, TELEFONE, 'Oi');

    expect(resultado.ok).toBe(false);
    expect((resultado as { ok: false; erro: string }).erro).toBeTruthy();
    expect(sendWhatsAppTextMessageMock).not.toHaveBeenCalled();
  });

  it('com a conversa inexistente, recusa com mensagem clara', async () => {
    buscarConversaMock.mockResolvedValue(null);

    const resultado = await enviarMensagemDoLojista(RESTAURANTE_ID, TELEFONE, 'Oi');

    expect(resultado).toEqual({ ok: false, erro: 'Conversa não encontrada.' });
    expect(sendWhatsAppTextMessageMock).not.toHaveBeenCalled();
    expect(gravarMensagemMock).not.toHaveBeenCalled();
  });
});

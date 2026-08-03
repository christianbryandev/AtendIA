import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const channelMock = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
const removeChannelMock = vi.fn();
const clienteSupabaseMock = {
  channel: vi.fn(() => channelMock),
  removeChannel: removeChannelMock,
};
const criarClienteSupabaseMock = vi.fn((_token: string) => clienteSupabaseMock);

vi.mock('../../services/supabase', () => ({
  criarClienteSupabase: (token: string) => criarClienteSupabaseMock(token),
}));

import Atendimento from './Atendimento';

const CONVERSAS = {
  conversas: [
    {
      id: 'conv-1',
      telefoneCliente: '5511999999999',
      nomeCliente: 'Maria Silva',
      trechoUltimaMensagem: 'Quero uma pizza grande',
      ultimaMensagemEm: '2026-08-03T11:30:00.000Z',
      sobControleHumano: false,
      janela: { aberta: true, expiraEm: '2026-08-04T10:00:00.000Z', minutosRestantes: 600 },
    },
    {
      id: 'conv-2',
      telefoneCliente: '5511888888888',
      nomeCliente: null,
      trechoUltimaMensagem: 'Áudio',
      ultimaMensagemEm: '2026-08-03T10:00:00.000Z',
      sobControleHumano: true,
      janela: { aberta: false, expiraEm: '2026-08-02T10:00:00.000Z', minutosRestantes: 0 },
    },
  ],
};

const MENSAGENS_CONV_1 = {
  mensagens: [
    {
      id: 'msg-1',
      autor: 'cliente',
      tipo: 'texto',
      texto: 'Quero uma pizza grande',
      transcricao: null,
      status: 'ok',
      erro_envio: null,
      created_at: '2026-08-03T11:29:00.000Z',
      audioUrlAssinada: null,
    },
    {
      id: 'msg-2',
      autor: 'ia',
      tipo: 'texto',
      texto: 'Claro! Qual sabor você prefere?',
      transcricao: null,
      status: 'ok',
      erro_envio: null,
      created_at: '2026-08-03T11:30:00.000Z',
      audioUrlAssinada: null,
    },
  ],
};

function stubFetch(handler: (url: string, options?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(handler));
}

function respostaJson(corpo: unknown, ok = true) {
  return { ok, json: async () => corpo } as Response;
}

function montar() {
  return render(
    <MemoryRouter>
      <Atendimento />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('auth_token', 'token-de-teste');
  channelMock.on.mockReturnThis();
  channelMock.subscribe.mockReturnThis();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Atendimento', () => {
  it('lista as conversas com nome (ou telefone) e o trecho da última mensagem', async () => {
    stubFetch(async (url: string) => {
      if (String(url).endsWith('/atendimento/conversas')) return respostaJson(CONVERSAS);
      return respostaJson({ mensagens: [] });
    });
    montar();

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Quero uma pizza grande')).toBeInTheDocument();
    // Segunda conversa não tem nome no CRM: mostra o telefone.
    expect(screen.getByText('5511888888888')).toBeInTheDocument();
  });

  it('ao selecionar uma conversa, carrega o histórico e distingue cliente, IA e lojista', async () => {
    const user = userEvent.setup();
    stubFetch(async (url: string) => {
      if (String(url).endsWith('/atendimento/conversas')) return respostaJson(CONVERSAS);
      if (String(url).includes('/atendimento/conversas/5511999999999/mensagens')) {
        return respostaJson(MENSAGENS_CONV_1);
      }
      return respostaJson({ mensagens: [] });
    });
    montar();

    await user.click(await screen.findByText('Maria Silva'));

    // "Quero uma pizza grande" aparece duas vezes: no trecho da lista à
    // esquerda e no balão da mensagem do cliente à direita.
    expect(await screen.findByText('Claro! Qual sabor você prefere?')).toBeInTheDocument();
    expect(screen.getAllByText('Quero uma pizza grande').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('IA')).toBeInTheDocument();
  });

  it('assina o Realtime ao montar e cancela a assinatura ao desmontar', async () => {
    stubFetch(async () => respostaJson(CONVERSAS));
    const { unmount } = montar();

    await screen.findByText('Maria Silva');

    expect(criarClienteSupabaseMock).toHaveBeenCalledWith('token-de-teste');
    expect(channelMock.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', table: 'mensagens' }),
      expect.any(Function),
    );
    expect(removeChannelMock).not.toHaveBeenCalled();

    unmount();

    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });

  it('insere mensagem nova recebida pelo Realtime na conversa aberta', async () => {
    const user = userEvent.setup();
    stubFetch(async (url: string) => {
      if (String(url).endsWith('/atendimento/conversas')) return respostaJson(CONVERSAS);
      if (String(url).includes('/atendimento/conversas/5511999999999/mensagens')) {
        return respostaJson(MENSAGENS_CONV_1);
      }
      return respostaJson({ mensagens: [] });
    });
    montar();

    await user.click(await screen.findByText('Maria Silva'));
    await screen.findByText('Claro! Qual sabor você prefere?');

    const registrarCallback = channelMock.on.mock.calls.find(
      (chamada: unknown[]) => chamada[0] === 'postgres_changes',
    )?.[2];
    expect(registrarCallback).toBeTruthy();

    registrarCallback({
      new: {
        id: 'msg-3',
        autor: 'lojista',
        tipo: 'texto',
        texto: 'Marguerita, por favor',
        transcricao: null,
        status: 'ok',
        erro_envio: null,
        created_at: '2026-08-03T11:31:00.000Z',
        audioUrlAssinada: null,
        telefone_cliente: '5511999999999',
      },
    });

    expect(await screen.findByText('Marguerita, por favor')).toBeInTheDocument();
  });

  it('mostra a mensagem de erro da API quando as conversas não carregam', async () => {
    stubFetch(async () => respostaJson({ error: 'Erro ao buscar as conversas.' }, false));
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao buscar as conversas.');
  });
});

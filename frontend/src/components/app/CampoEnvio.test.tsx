import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CampoEnvio from './CampoEnvio';

const TELEFONE = '5511999999999';

function stubFetch(handler: (url: string, options?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(handler));
}

function respostaJson(corpo: unknown, ok = true) {
  return { ok, json: async () => corpo } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const JANELA_ABERTA = { aberta: true, expiraEm: '2026-08-04T12:00:00.000Z', minutosRestantes: 300 };
const JANELA_QUASE_FECHANDO = { aberta: true, expiraEm: '2026-08-03T12:40:00.000Z', minutosRestantes: 40 };
const JANELA_FECHADA = { aberta: false, expiraEm: '2026-08-02T12:00:00.000Z', minutosRestantes: 0 };

describe('CampoEnvio', () => {
  it('com a janela aberta, o campo fica habilitado e mostra o tempo restante', () => {
    stubFetch(async () => respostaJson({}));
    render(
      <CampoEnvio
        telefone={TELEFONE}
        janela={JANELA_ABERTA}
        sobControleHumano={false}
        onControleAlterado={() => {}}
      />,
    );

    expect(screen.getByLabelText(/mensagem/i)).toBeEnabled();
    expect(screen.getByRole('button', { name: /enviar/i })).toBeEnabled();
    expect(screen.getByText(/pode responder livremente/i)).toBeInTheDocument();
  });

  it('com a janela fechada, o campo fica desabilitado e a explicação aparece em português', () => {
    stubFetch(async () => respostaJson({}));
    render(
      <CampoEnvio
        telefone={TELEFONE}
        janela={JANELA_FECHADA}
        sobControleHumano={false}
        onControleAlterado={() => {}}
      />,
    );

    expect(screen.getByLabelText(/mensagem/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();
    expect(
      screen.getByText(/24 horas.*(fechou|expirou|template|modelo de mensagem)/i),
    ).toBeInTheDocument();
  });

  it('faltando menos de uma hora, o aviso fica destacado', () => {
    stubFetch(async () => respostaJson({}));
    render(
      <CampoEnvio
        telefone={TELEFONE}
        janela={JANELA_QUASE_FECHANDO}
        sobControleHumano={false}
        onControleAlterado={() => {}}
      />,
    );

    const aviso = screen.getByText(/menos de 1 hora/i);
    expect(aviso).toBeInTheDocument();
    expect(aviso.closest('[role="alert"]')).toBeInTheDocument();
    // O campo continua liberado: a janela ainda está aberta.
    expect(screen.getByLabelText(/mensagem/i)).toBeEnabled();
  });

  it('enviar chama a API e limpa o campo', async () => {
    const user = userEvent.setup();
    stubFetch(async (url: string, opts?: RequestInit) => {
      if (String(url).includes(`/atendimento/conversas/${TELEFONE}/mensagens`) && opts?.method === 'POST') {
        return respostaJson({ success: true, id: 'msg-1' });
      }
      return respostaJson({});
    });
    render(
      <CampoEnvio
        telefone={TELEFONE}
        janela={JANELA_ABERTA}
        sobControleHumano={false}
        onControleAlterado={() => {}}
      />,
    );

    const campo = screen.getByLabelText(/mensagem/i);
    await user.type(campo, 'Já estamos preparando seu pedido!');
    await user.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      const chamada = (globalThis.fetch as any).mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          String(url).includes(`/atendimento/conversas/${TELEFONE}/mensagens`) && opts?.method === 'POST',
      );
      expect(chamada).toBeTruthy();
      const corpo = JSON.parse(chamada[1].body);
      expect(corpo.texto).toBe('Já estamos preparando seu pedido!');
    });

    await waitFor(() => expect(campo).toHaveValue(''));
  });

  it('mostra o erro devolvido pela API quando o envio é recusado', async () => {
    const user = userEvent.setup();
    stubFetch(async (url: string, opts?: RequestInit) => {
      if (String(url).includes(`/atendimento/conversas/${TELEFONE}/mensagens`) && opts?.method === 'POST') {
        return respostaJson(
          { error: 'A Meta só permite responder até 24 horas após a última mensagem do cliente.' },
          false,
        );
      }
      return respostaJson({});
    });
    render(
      <CampoEnvio
        telefone={TELEFONE}
        janela={JANELA_ABERTA}
        sobControleHumano={false}
        onControleAlterado={() => {}}
      />,
    );

    await user.type(screen.getByLabelText(/mensagem/i), 'Oi');
    await user.click(screen.getByRole('button', { name: /enviar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A Meta só permite responder até 24 horas após a última mensagem do cliente.',
    );
  });

  it('assumir a conversa chama POST /controle com humano true', async () => {
    const user = userEvent.setup();
    const onControleAlterado = vi.fn();
    stubFetch(async (url: string, opts?: RequestInit) => {
      if (String(url).includes(`/atendimento/conversas/${TELEFONE}/controle`) && opts?.method === 'POST') {
        return respostaJson({ success: true });
      }
      return respostaJson({});
    });
    render(
      <CampoEnvio
        telefone={TELEFONE}
        janela={JANELA_ABERTA}
        sobControleHumano={false}
        onControleAlterado={onControleAlterado}
      />,
    );

    await user.click(screen.getByRole('button', { name: /assumir/i }));

    await waitFor(() => {
      const chamada = (globalThis.fetch as any).mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          String(url).includes(`/atendimento/conversas/${TELEFONE}/controle`) && opts?.method === 'POST',
      );
      expect(chamada).toBeTruthy();
      expect(JSON.parse(chamada[1].body)).toEqual({ humano: true });
      expect(onControleAlterado).toHaveBeenCalledWith(true);
    });
  });
});

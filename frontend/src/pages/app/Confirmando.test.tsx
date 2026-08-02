import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Confirmando from './Confirmando';

const navegar = vi.fn();

vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useNavigate: () => navegar };
});

const recarregar = vi.fn();
let statusAtual: string | null = 'pendente';

vi.mock('../../contexts/AssinaturaContext', () => ({
  useAssinatura: () => ({ status: statusAtual, recarregar, carregando: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  statusAtual = 'pendente';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Confirmando', () => {
  it('mostra que está confirmando o pagamento', () => {
    render(<MemoryRouter><Confirmando /></MemoryRouter>);
    expect(screen.getByText(/confirmando seu pagamento/i)).toBeInTheDocument();
  });

  it('entra no painel assim que a assinatura fica ativa', () => {
    statusAtual = 'ativa';
    render(<MemoryRouter><Confirmando /></MemoryRouter>);

    // A navegacao dispara de forma sincrona num useEffect de mount, sem
    // depender de nenhum timer: render() do Testing Library ja roda os
    // efeitos dentro de act(), entao a chamada pode ser verificada direto,
    // sem waitFor (que sob fake timers precisa do shim global do jest).
    expect(navegar).toHaveBeenCalledWith('/app/dashboard', { replace: true });
  });

  // O webhook é assíncrono. Sem esta mensagem, quem esperou 30s acha
  // que o pagamento falhou — e paga de novo.
  it('mostra mensagem tranquilizadora quando o tempo estoura', async () => {
    render(<MemoryRouter><Confirmando /></MemoryRouter>);

    // act garante que o setState disparado dentro do setTimeout seja
    // aplicado e refletido no DOM antes da asserção seguinte.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    // getByText (sincrono) em vez de findByText: este ultimo usa waitFor
    // por baixo, que sob fake timers depende do shim global do jest.
    expect(screen.getByText(/pagamento recebido/i)).toBeInTheDocument();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('consulta o status repetidamente enquanto espera', async () => {
    render(<MemoryRouter><Confirmando /></MemoryRouter>);

    await vi.advanceTimersByTimeAsync(6_000);

    expect(recarregar.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

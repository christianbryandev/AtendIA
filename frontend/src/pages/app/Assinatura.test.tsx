import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Assinatura from './Assinatura';

let estadoAssinatura: any;

vi.mock('../../contexts/AssinaturaContext', () => ({
  useAssinatura: () => estadoAssinatura,
}));

vi.mock('../../services/api', () => ({
  apiFetch: vi.fn(),
}));

// Meio-dia UTC de proposito, nao meia-noite. A tela formata a data no
// fuso de quem esta olhando, que e o certo: o lojista precisa saber em
// que dia DELE o servico acaba. Com meia-noite UTC, qualquer fuso a
// oeste de Greenwich renderiza o dia anterior e o teste quebraria por
// causa do relogio da maquina, nao por causa do codigo.
const FIM_DO_PERIODO = '2026-09-02T15:00:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  estadoAssinatura = {
    status: 'ativa',
    periodoFim: FIM_DO_PERIODO,
    creditosCota: 8000,
    creditosAvulsos: 500,
    cotaTotal: 10000,
    cancelamentoAgendadoPara: null,
    carregando: false,
    recarregar: vi.fn(),
  };
});

describe('Assinatura', () => {
  it('nao mostra aviso de cancelamento agendado quando nao ha nenhum', () => {
    render(<MemoryRouter><Assinatura /></MemoryRouter>);

    expect(screen.queryByText(/não será renovada/i)).not.toBeInTheDocument();
    // Sem cancelamento agendado, a linha normal de proxima cobranca aparece.
    expect(screen.getByText('Próxima cobrança')).toBeInTheDocument();
  });

  it('mostra o aviso de cancelamento agendado com a data formatada em pt-BR', () => {
    estadoAssinatura.cancelamentoAgendadoPara = FIM_DO_PERIODO;
    render(<MemoryRouter><Assinatura /></MemoryRouter>);

    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent(/continua ativa até/i);
    expect(aviso).toHaveTextContent('02/09/2026');
    expect(aviso).toHaveTextContent(/não será renovada/i);
  });

  // O lojista pagou o mes e nao ha proxima cobranca nenhuma agendada:
  // mostrar "Próxima cobrança" junto do aviso de cancelamento mentiria.
  it('troca "Próxima cobrança" por "Assinatura termina em" quando ha cancelamento agendado', () => {
    estadoAssinatura.cancelamentoAgendadoPara = FIM_DO_PERIODO;
    render(<MemoryRouter><Assinatura /></MemoryRouter>);

    expect(screen.queryByText('Próxima cobrança')).not.toBeInTheDocument();
    expect(screen.getByText('Assinatura termina em')).toBeInTheDocument();
  });
});

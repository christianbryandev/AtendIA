import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FaixaCota from './FaixaCota';

let estado = { creditosCota: 10000, creditosAvulsos: 0, cotaTotal: 10000, carregando: false };

vi.mock('../../contexts/AssinaturaContext', () => ({
  useAssinatura: () => estado,
}));

function montar() {
  return render(<MemoryRouter><FaixaCota /></MemoryRouter>);
}

describe('FaixaCota', () => {
  it('não aparece enquanto o consumo está abaixo de 80%', () => {
    estado = { creditosCota: 5000, creditosAvulsos: 0, cotaTotal: 10000, carregando: false };
    const { container } = montar();
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa quando passa de 80% da cota', () => {
    estado = { creditosCota: 1500, creditosAvulsos: 0, cotaTotal: 10000, carregando: false };
    montar();
    expect(screen.getByRole('status')).toHaveTextContent(/85% da sua cota/i);
  });

  it('avisa que a IA parou quando os dois saldos zeram', () => {
    estado = { creditosCota: 0, creditosAvulsos: 0, cotaTotal: 10000, carregando: false };
    montar();
    expect(screen.getByRole('alert')).toHaveTextContent(/deixou de responder/i);
  });

  // Quem comprou pacote continua sendo atendido mesmo com a cota zerada.
  // Dizer que a IA parou aí seria mentira e geraria compra desnecessária.
  it('não diz que a IA parou quando ainda há crédito avulso', () => {
    estado = { creditosCota: 0, creditosAvulsos: 2500, cotaTotal: 10000, carregando: false };
    montar();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/crédito avulso/i);
  });
});

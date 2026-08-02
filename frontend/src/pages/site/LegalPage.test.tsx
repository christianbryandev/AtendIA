import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LegalPage from './LegalPage';

const wrap = (doc: 'termos' | 'privacidade' | 'exclusao-de-dados') =>
  render(<MemoryRouter><LegalPage documento={doc} /></MemoryRouter>);

describe('LegalPage', () => {
  it('renderiza os Termos de Uso', () => {
    wrap('termos');
    expect(screen.getByRole('heading', { level: 1, name: /Termos de Uso/i }))
      .toBeInTheDocument();
  });

  it('renderiza a Politica de Privacidade com o CNPJ', () => {
    const { container } = wrap('privacidade');
    expect(container.textContent).toContain('67.146.802/0001-85');
  });

  it('renderiza as Instrucoes de Exclusao de Dados', () => {
    wrap('exclusao-de-dados');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('NAO vaza o aviso interno de minuta para o publico', () => {
    for (const doc of ['termos', 'privacidade', 'exclusao-de-dados'] as const) {
      const { container, unmount } = wrap(doc);
      expect(container.textContent).not.toContain('MINUTA');
      expect(container.textContent).not.toContain('não validada juridicamente');
      unmount();
    }
  });

  it('nao instrui a usar o botao de exclusao que ainda nao existe', () => {
    const { container } = wrap('exclusao-de-dados');
    expect(container.textContent).not.toContain('Configurações → Conta');
  });
});

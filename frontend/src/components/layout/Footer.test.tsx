import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from './Footer';

const wrap = () => render(<MemoryRouter><Footer /></MemoryRouter>);

describe('Footer', () => {
  it('exibe a razao social e o CNPJ exatos', () => {
    wrap();
    expect(
      screen.getByText(/67\.146\.802 CHRISTIAN BRYAN PEREIRA/)
    ).toBeInTheDocument();
    expect(screen.getByText(/CNPJ 67\.146\.802\/0001-85/)).toBeInTheDocument();
  });

  it('tem as tres paginas legais exigidas pela verificacao da Meta', () => {
    wrap();
    expect(screen.getByRole('link', { name: 'Termos de Uso' }))
      .toHaveAttribute('href', '/termos');
    expect(screen.getByRole('link', { name: 'Política de Privacidade' }))
      .toHaveAttribute('href', '/privacidade');
    expect(screen.getByRole('link', { name: 'Exclusão de Dados' }))
      .toHaveAttribute('href', '/exclusao-de-dados');
  });

  it('nao contem prova social inventada', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(/\d+\s*\+?\s*restaurantes/i);
    expect(texto).not.toMatch(/mais de \d/i);
  });
});

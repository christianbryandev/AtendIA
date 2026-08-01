import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Button from './Button';

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Button', () => {
  it('renderiza o texto', () => {
    wrap(<Button>Começar agora</Button>);
    expect(screen.getByRole('button', { name: 'Começar agora' })).toBeInTheDocument();
  });

  it('usa brand-700 no variant primary, nunca brand-500', () => {
    wrap(<Button variant="primary">Começar agora</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-brand-700');
    expect(btn.className).not.toContain('bg-brand-500');
  });

  it('vira link quando recebe "to"', () => {
    wrap(<Button to="/cadastro">Começar agora</Button>);
    const link = screen.getByRole('link', { name: 'Começar agora' });
    expect(link).toHaveAttribute('href', '/cadastro');
  });

  it('aceita classes adicionais', () => {
    wrap(<Button className="w-full">Ok</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });
});

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

  it('usa dimensoes grandes por padrao (size md)', () => {
    wrap(<Button>Ok</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('px-6');
    expect(btn.className).toContain('py-3');
  });

  it('size="sm" aplica as dimensoes compactas, sem herdar as de md', () => {
    wrap(<Button size="sm">Ok</Button>);
    const classes = screen.getByRole('button').className.split(/\s+/);
    expect(classes).toContain('px-5');
    expect(classes).toContain('py-2.5');
    expect(classes).not.toContain('px-6');
    expect(classes).not.toContain('py-3');
  });
});

// Os casos abaixo não são executados em runtime: existem apenas para que o
// `tsc` confirme que a união discriminada rejeita combinações inválidas de
// props. Se alguma combinação passar a compilar, o `@ts-expect-error`
// correspondente vira erro de compilação.
function _invalidPropCombinations() {
  // @ts-expect-error 'to' e 'href' juntos não são permitidos
  <Button to="/cadastro" href="https://example.com">Inválido</Button>;

  // @ts-expect-error 'onClick' junto com 'to' não é permitido
  <Button to="/cadastro" onClick={() => {}}>Inválido</Button>;

  // @ts-expect-error 'type' junto com 'to' não é permitido
  <Button to="/cadastro" type="submit">Inválido</Button>;

  // @ts-expect-error 'onClick' junto com 'href' não é permitido
  <Button href="https://example.com" onClick={() => {}}>Inválido</Button>;

  // @ts-expect-error 'type' junto com 'href' não é permitido
  <Button href="https://example.com" type="submit">Inválido</Button>;
}
void _invalidPropCombinations;

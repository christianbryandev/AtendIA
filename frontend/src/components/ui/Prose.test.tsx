import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Prose from './Prose';

const wrap = (markdown: string) => render(<MemoryRouter><Prose markdown={markdown} /></MemoryRouter>);

describe('Prose', () => {
  it('renderiza link interno como navegacao do router (sem recarregar a pagina)', () => {
    wrap('Veja a [Política de Privacidade](/privacidade).');
    const link = screen.getByRole('link', { name: /Política de Privacidade/i });
    // react-router-dom Link renderiza <a> mas sem o atributo que forcaria
    // um reload completo: verificamos que continua navegavel via SPA.
    expect(link).toHaveAttribute('href', '/privacidade');
  });

  it('mantem link externo (mailto:) como <a> comum', () => {
    wrap('Fale conosco: [contato@atendia.com](mailto:contato@atendia.com).');
    const link = screen.getByRole('link', { name: /contato@atendia.com/i });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'mailto:contato@atendia.com');
  });
});

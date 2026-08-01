import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Prose from './Prose';

function AppDeTeste() {
  return (
    <Routes>
      <Route
        path="/termos"
        element={<Prose markdown="Veja a [Política de Privacidade](/privacidade)." />}
      />
      <Route path="/privacidade" element={<div>Marcador da pagina de privacidade</div>} />
    </Routes>
  );
}

describe('Prose', () => {
  it('renderiza link interno como navegacao do router, nao como <a> comum (nao recarrega a pagina)', async () => {
    // Um <a href="/privacidade"> comum tambem satisfaria um assert de
    // href, mas nao dispara navegacao via history do react-router em
    // jsdom (nao ha reload de pagina no ambiente de teste). Renderizando
    // dentro de Routes reais e clicando, so passa se o link for de fato
    // um <Link> que aciona a navegacao client-side.
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/termos']}>
        <AppDeTeste />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: /Política de Privacidade/i });
    await user.click(link);

    expect(
      await screen.findByText('Marcador da pagina de privacidade')
    ).toBeInTheDocument();
  });

  it('mantem link externo (mailto:) como <a> comum', () => {
    render(
      <MemoryRouter>
        <Prose markdown="Fale conosco: [contato@atendia.com](mailto:contato@atendia.com)." />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /contato@atendia.com/i });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'mailto:contato@atendia.com');
  });
});

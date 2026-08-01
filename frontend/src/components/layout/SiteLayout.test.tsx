import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import SiteLayout from './SiteLayout';

function PaginaComAncora() {
  return (
    <div>
      <Link to="/outra">Ir para outra pagina</Link>
      <Link to="/#secao">Ir para a secao (mesma pagina)</Link>
      <section id="secao">Secao</section>
    </div>
  );
}

function OutraPagina() {
  return (
    <div>
      <Link to="/#secao">Voltar para a secao</Link>
    </div>
  );
}

const wrap = (initialEntries: string[]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<PaginaComAncora />} />
          <Route path="/outra" element={<OutraPagina />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('SiteLayout — rolagem entre rotas', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('vai para o topo ao navegar para uma rota nova sem ancora', async () => {
    const user = userEvent.setup();
    wrap(['/']);

    await user.click(screen.getByRole('link', { name: 'Ir para outra pagina' }));

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('rola ate a secao quando a navegacao tem ancora', async () => {
    const user = userEvent.setup();
    wrap(['/outra']);

    await user.click(screen.getByRole('link', { name: 'Voltar para a secao' }));

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('clicar na mesma ancora duas vezes re-rola (usa a key da navegacao)', async () => {
    const user = userEvent.setup();
    wrap(['/']);

    const link = screen.getByRole('link', { name: 'Ir para a secao (mesma pagina)' });

    await user.click(link);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });
    const chamadasAposPrimeiroClique = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock
      .calls.length;
    expect(chamadasAposPrimeiroClique).toBeGreaterThan(0);

    await user.click(link);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });
    const chamadasAposSegundoClique = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock
      .calls.length;

    expect(chamadasAposSegundoClique).toBeGreaterThan(chamadasAposPrimeiroClique);
  });

  it('tem um skip link apontando para o conteudo principal', () => {
    wrap(['/']);

    const link = screen.getByRole('link', { name: 'Pular para o conteúdo' });
    expect(link).toHaveAttribute('href', '#conteudo-principal');
    expect(document.getElementById('conteudo-principal')?.tagName).toBe('MAIN');
  });
});

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';

/**
 * Nenhum teste ligava os href de ancora usados pelo menu do Header e pelo
 * grupo "Produto" do Footer aos ids realmente renderizados na Landing.
 * Renomear um id quebra a navegacao sem quebrar teste nenhum. Este arquivo
 * extrai os hrefs de ancora (formato "/#id") diretamente dos componentes de
 * navegacao e confere que cada um tem um elemento correspondente com esse
 * id na Landing renderizada.
 */

function extrairIdsDeAncora(container: HTMLElement): string[] {
  const links = Array.from(container.querySelectorAll('a[href^="/#"]'));
  const ids = links.map((link) => link.getAttribute('href')!.slice(2));
  return Array.from(new Set(ids));
}

describe('Landing — ancoras do menu e do rodape apontam para secoes existentes', () => {
  it('todo href de ancora do Header tem um id correspondente na Landing', () => {
    const { container: headerContainer } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    const idsDoMenu = extrairIdsDeAncora(headerContainer);
    expect(idsDoMenu.length).toBeGreaterThan(0);

    const { container: landingContainer } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    for (const id of idsDoMenu) {
      expect(
        landingContainer.querySelector(`#${CSS.escape(id)}`),
        `id "${id}" referenciado pelo Header nao existe na Landing`
      ).not.toBeNull();
    }
  });

  it('todo href de ancora do grupo "Produto" do Footer tem um id correspondente na Landing', () => {
    const { container: footerContainer } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    const idsDoRodape = extrairIdsDeAncora(footerContainer);
    expect(idsDoRodape.length).toBeGreaterThan(0);

    const { container: landingContainer } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    for (const id of idsDoRodape) {
      expect(
        landingContainer.querySelector(`#${CSS.escape(id)}`),
        `id "${id}" referenciado pelo Footer nao existe na Landing`
      ).not.toBeNull();
    }
  });
});

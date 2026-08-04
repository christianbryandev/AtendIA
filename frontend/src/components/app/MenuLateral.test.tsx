import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MenuLateral from './MenuLateral';

const ITENS_ESPERADOS: Array<[string, string]> = [
  ['Atendimento', '/app/atendimento'],
  ['Visão Geral', '/app/dashboard'],
  ['CRM', '/app/crm'],
  ['Cardápio', '/app/cardapio'],
  ['Configurações', '/app/configuracoes'],
  ['Assinatura', '/app/assinatura'],
  ['Créditos', '/app/creditos'],
];

const LARGURA_DESKTOP = 1280;
const LARGURA_CELULAR = 375;

function definirLargura(largura: number) {
  Object.defineProperty(window, 'innerWidth', { value: largura, writable: true, configurable: true });
}

function montar(rota = '/app/cardapio') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/login" element={<p>Tela de login</p>} />
        <Route path="/app/*" element={<MenuLateral />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  definirLargura(LARGURA_DESKTOP);
});

afterEach(() => {
  definirLargura(LARGURA_DESKTOP);
});

describe('MenuLateral', () => {
  it('mostra os sete itens do painel com os destinos certos', () => {
    montar();

    for (const [rotulo, destino] of ITENS_ESPERADOS) {
      expect(screen.getByRole('link', { name: rotulo })).toHaveAttribute('href', destino);
    }
  });

  it('marca o item da rota atual com aria-current="page"', () => {
    montar('/app/cardapio');

    expect(screen.getByRole('link', { name: 'Cardápio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'CRM' })).not.toHaveAttribute('aria-current');
  });

  it('o botão de sair limpa o token e leva ao login', async () => {
    localStorage.setItem('auth_token', 'token-de-teste');
    montar();

    await userEvent.click(screen.getByRole('button', { name: /sair/i }));

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(await screen.findByText('Tela de login')).toBeInTheDocument();
  });

  it('comeca recolhido em viewport pequeno', () => {
    definirLargura(LARGURA_CELULAR);
    montar();

    expect(screen.queryByRole('link', { name: 'Atendimento' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir menu/i })).toBeInTheDocument();
  });

  it('comeca aberto em viewport de desktop', () => {
    definirLargura(LARGURA_DESKTOP);
    montar();

    expect(screen.getByRole('link', { name: 'Atendimento' })).toBeInTheDocument();
  });
});

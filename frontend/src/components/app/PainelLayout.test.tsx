import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PainelLayout from './PainelLayout';

// Cota zerada: e o cenario em que a faixa vermelha aparece.
const estado = {
  status: 'ativa',
  creditosCota: 0,
  creditosAvulsos: 0,
  cotaTotal: 10000,
  carregando: false,
};

vi.mock('../../contexts/AssinaturaContext', () => ({
  useAssinatura: () => estado,
}));

// Rotas do painel montadas como no App: cada pagina e filha do layout.
function montar(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route element={<PainelLayout />}>
          <Route path="/app/dashboard" element={<p>Conteudo do dashboard</p>} />
          <Route path="/app/crm" element={<p>Conteudo do CRM</p>} />
          <Route path="/app/ifood" element={<p>Conteudo do iFood</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.setItem('auth_token', 'token-de-teste');
});

describe('PainelLayout', () => {
  // O spec pede a faixa "no topo de qualquer tela do painel". Ela estava
  // so em Assinatura e Creditos — justo as telas onde o lojista ja veria
  // o saldo. Nas telas onde ele passa o dia nao havia aviso nenhum de
  // que a cota acabou e a IA parou de responder no WhatsApp.
  it.each([
    ['/app/dashboard', 'Conteudo do dashboard'],
    ['/app/crm', 'Conteudo do CRM'],
    ['/app/ifood', 'Conteudo do iFood'],
  ])('mostra a faixa de cota junto com o conteudo em %s', (rota, conteudo) => {
    montar(rota);

    expect(screen.getByRole('alert')).toHaveTextContent(/deixou de responder/i);
    expect(screen.getByText(conteudo)).toBeInTheDocument();
  });
});

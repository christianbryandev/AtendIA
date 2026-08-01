import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

const renderEm = (rota: string) =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <App />
    </MemoryRouter>
  );

describe('Roteamento', () => {
  it('a raiz mostra a landing', async () => {
    renderEm('/');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('/cadastro mostra o placeholder, sem prometer o que nao existe', async () => {
    renderEm('/cadastro');
    expect(await screen.findByText(/finalizando os últimos ajustes/i)).toBeInTheDocument();
  });

  it('/sobre existe', async () => {
    renderEm('/sobre');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('rota inexistente mostra pagina 404', async () => {
    renderEm('/rota-que-nao-existe');
    expect(await screen.findByText(/página não encontrada/i)).toBeInTheDocument();
  });
});

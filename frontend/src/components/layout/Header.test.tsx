import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';

const wrap = () => render(<MemoryRouter><Header /></MemoryRouter>);

describe('Header', () => {
  it('o botao do menu mobile alterna o rotulo acessivel entre abrir e fechar', async () => {
    const user = userEvent.setup();
    wrap();

    const botao = screen.getByRole('button', { name: 'Abrir menu' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');

    await user.click(botao);

    expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.queryByRole('button', { name: 'Abrir menu' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fechar menu' }));

    expect(screen.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});

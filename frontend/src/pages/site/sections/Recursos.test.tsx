import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Recursos from './Recursos';

describe('Recursos', () => {
  it('destaca o atendimento por audio, que e o diferencial', () => {
    const { container } = render(<Recursos />);
    const destaques = screen.getAllByRole('heading', { level: 3 });
    const textoDosDestaques = destaques.map((h) => h.textContent).join(' ');
    expect(textoDosDestaques.toLowerCase()).toContain('áudio');
    expect(container.textContent).toContain('responde em áudio');
  });

  it('tem a ancora usada pelo menu', () => {
    const { container } = render(<Recursos />);
    expect(container.querySelector('#recursos')).toBeInTheDocument();
  });

  it('nao promete recurso ainda inexistente sem ressalva', () => {
    const { container } = render(<Recursos />);
    // O envio de cardapio em PDF so existira no ciclo 3/4.
    expect(container.textContent).not.toContain('PDF');
  });
});

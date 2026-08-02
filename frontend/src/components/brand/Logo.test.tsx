import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Logo from './Logo';

// A variante "full" (icone + wordmark) foi removida: o unico consumidor
// (Brand) sempre usava so o icone, e o wordmark ia morto para o bundle.
// Logo agora so renderiza o icone.

describe('Logo', () => {
  it('renderiza apenas o path do icone, na cor da marca', () => {
    const { container } = render(<Logo />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute('fill')).toBe('#10B981');
  });

  it('tem rotulo acessivel', () => {
    const { container } = render(<Logo />);
    expect(container.querySelector('title')?.textContent).toBe('AtendIA');
  });

  it('nao desenha fundo solido (nenhum retangulo de preenchimento)', () => {
    // O teste anterior procurava rect[fill="#FFFFFF"], mas o componente
    // nunca renderiza <rect> nenhum — so passava porque a asserção nunca
    // podia encontrar nada, nao porque garantisse ausencia de fundo. Aqui
    // a asserção falha se qualquer <rect> (de qualquer cor) for adicionado
    // como fundo do svg.
    const { container } = render(<Logo />);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('propaga className para o elemento svg', () => {
    const { container } = render(<Logo className="custom-logo" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('custom-logo');
  });

  it('marca o icone como decorativo quando aria-hidden e passado', () => {
    const { container } = render(<Logo aria-hidden="true" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('aria-label');
  });
});

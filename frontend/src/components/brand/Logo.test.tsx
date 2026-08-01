import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Logo from './Logo';

describe('Logo', () => {
  it('usa as tres cores da marca na versao completa', () => {
    const { container } = render(<Logo variant="full" />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    expect(paths[0].getAttribute('fill')).toBe('#10B981'); // icone
    expect(paths[1].getAttribute('fill')).toBe('#292524'); // "Atend"
    expect(paths[2].getAttribute('fill')).toBe('#10B981'); // "IA"
  });

  it('renderiza apenas o icone na variante icon', () => {
    const { container } = render(<Logo variant="icon" />);
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('tem rotulo acessivel', () => {
    const { container } = render(<Logo variant="full" />);
    expect(container.querySelector('title')?.textContent).toBe('AtendIA');
  });

  it('nao desenha fundo solido (nenhum retangulo de preenchimento)', () => {
    // O teste anterior procurava rect[fill="#FFFFFF"], mas o componente
    // nunca renderiza <rect> nenhum — so passava porque a asserção nunca
    // podia encontrar nada, nao porque garantisse ausencia de fundo. Aqui
    // a asserção falha se qualquer <rect> (de qualquer cor) for adicionado
    // como fundo do svg.
    const { container } = render(<Logo variant="full" />);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('propaga className para o elemento svg', () => {
    const { container } = render(<Logo variant="full" className="custom-logo" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('custom-logo');
  });
});

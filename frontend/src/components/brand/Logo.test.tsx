import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Logo from './Logo';

describe('Logo', () => {
  it('usa as tres cores da marca na versao completa', () => {
    const { container } = render(<Logo variant="full" />);
    const fills = Array.from(container.querySelectorAll('path')).map((p) =>
      p.getAttribute('fill')
    );
    expect(fills).toContain('#10B981'); // icone
    expect(fills).toContain('#292524'); // "Atend"
    expect(fills.filter((f) => f === '#10B981').length).toBeGreaterThanOrEqual(2); // icone + "IA"
  });

  it('renderiza apenas o icone na variante icon', () => {
    const { container } = render(<Logo variant="icon" />);
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('tem rotulo acessivel', () => {
    const { container } = render(<Logo variant="full" />);
    expect(container.querySelector('title')?.textContent).toBe('AtendIA');
  });

  it('nao tem fundo branco solido', () => {
    const { container } = render(<Logo variant="full" />);
    const rects = container.querySelectorAll('rect[fill="#FFFFFF"], rect[fill="#fff"]');
    expect(rects).toHaveLength(0);
  });
});

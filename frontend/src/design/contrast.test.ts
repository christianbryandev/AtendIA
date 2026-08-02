import { describe, it, expect } from 'vitest';
import { contrastRatio } from './contrast';

describe('contrastRatio', () => {
  it('calcula o contraste de preto sobre branco como 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('brand-700 sobre branco passa no WCAG AA (>= 4.5)', () => {
    expect(contrastRatio('#047857', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('brand-500 sobre branco NAO passa — por isso nunca recebe texto', () => {
    expect(contrastRatio('#10B981', '#FFFFFF')).toBeLessThan(4.5);
  });

  it('ink-600 sobre branco passa no WCAG AA', () => {
    expect(contrastRatio('#57534E', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

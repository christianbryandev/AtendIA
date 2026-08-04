import { describe, it, expect } from 'vitest';
import { precoValido } from './validacao-preco.js';

describe('precoValido', () => {
  describe('casos válidos com até duas casas decimais', () => {
    it('deve aceitar 19.99', () => {
      expect(precoValido(19.99)).toBe(true);
    });

    it('deve aceitar 10.05', () => {
      expect(precoValido(10.05)).toBe(true);
    });

    it('deve aceitar 45 (sem casas decimais)', () => {
      expect(precoValido(45)).toBe(true);
    });

    it('deve aceitar 12.5 (uma casa decimal)', () => {
      expect(precoValido(12.5)).toBe(true);
    });

    it('deve aceitar 0.01 (menor valor positivo com duas casas)', () => {
      expect(precoValido(0.01)).toBe(true);
    });
  });

  describe('casos inválidos', () => {
    it('deve rejeitar 0', () => {
      expect(precoValido(0)).toBe(false);
    });

    it('deve rejeitar valores negativos', () => {
      expect(precoValido(-10.50)).toBe(false);
    });

    it('deve rejeitar 10.555 (três casas decimais)', () => {
      expect(precoValido(10.555)).toBe(false);
    });

    it('deve rejeitar NaN', () => {
      expect(precoValido(NaN)).toBe(false);
    });

    it('deve rejeitar Infinity', () => {
      expect(precoValido(Infinity)).toBe(false);
    });

    it('deve rejeitar -Infinity', () => {
      expect(precoValido(-Infinity)).toBe(false);
    });

    it('deve rejeitar string', () => {
      expect(precoValido('19.99')).toBe(false);
    });

    it('deve rejeitar null', () => {
      expect(precoValido(null)).toBe(false);
    });

    it('deve rejeitar undefined', () => {
      expect(precoValido(undefined)).toBe(false);
    });

    it('deve rejeitar objeto', () => {
      expect(precoValido({})).toBe(false);
    });
  });
});

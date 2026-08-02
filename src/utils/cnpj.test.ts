import { describe, it, expect } from 'vitest';
import { validarCnpj, normalizarCnpj } from './cnpj.js';

describe('normalizarCnpj', () => {
  it('remove pontuação e mantém só dígitos', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });
});

describe('validarCnpj', () => {
  it('aceita um CNPJ com dígitos verificadores corretos', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('aceita CNPJ sem pontuação', () => {
    expect(validarCnpj('11222333000181')).toBe(true);
  });

  it('recusa quando o dígito verificador está errado', () => {
    expect(validarCnpj('11222333000182')).toBe(false);
  });

  it('recusa quando não tem 14 dígitos', () => {
    expect(validarCnpj('1122233300018')).toBe(false);
  });

  // Todos os dígitos iguais passam no cálculo do verificador por
  // coincidência aritmética, mas nenhum é CNPJ real. Precisa de guarda
  // explícita, senão 00000000000000 entra no banco.
  it('recusa CNPJ com todos os dígitos iguais', () => {
    expect(validarCnpj('00000000000000')).toBe(false);
    expect(validarCnpj('11111111111111')).toBe(false);
  });

  it('recusa string vazia', () => {
    expect(validarCnpj('')).toBe(false);
  });
});

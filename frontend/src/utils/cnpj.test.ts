import { describe, it, expect } from 'vitest';
import { validarCnpj, formatarCnpj } from './cnpj';

describe('validarCnpj', () => {
  it('aceita CNPJ válido', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(validarCnpj('11222333000182')).toBe(false);
  });

  it('recusa todos os dígitos iguais', () => {
    expect(validarCnpj('11111111111111')).toBe(false);
  });
});

describe('formatarCnpj', () => {
  it('formata conforme o usuário digita', () => {
    expect(formatarCnpj('11')).toBe('11');
    expect(formatarCnpj('11222')).toBe('11.222');
    expect(formatarCnpj('11222333')).toBe('11.222.333');
    expect(formatarCnpj('112223330001')).toBe('11.222.333/0001');
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('ignora o que passar de 14 dígitos', () => {
    expect(formatarCnpj('112223330001819999')).toBe('11.222.333/0001-81');
  });
});

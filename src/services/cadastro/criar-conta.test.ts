import { describe, it, expect } from 'vitest';
import { validarPayloadCadastro } from './criar-conta.js';

const valido = {
  nome: 'Marina Souza',
  email: 'marina@pizzaria.com.br',
  senha: 'senhaforte123',
  restauranteNome: 'Pizzaria do Bairro',
  cnpj: '11.222.333/0001-81',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  complemento: '',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
};

describe('validarPayloadCadastro', () => {
  it('aceita um payload completo e normaliza CNPJ e CEP', () => {
    const r = validarPayloadCadastro(valido);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.cnpj).toBe('11222333000181');
      expect(r.dados.cep).toBe('01310100');
    }
  });

  it('normaliza o e-mail para minúsculas e sem espaços', () => {
    const r = validarPayloadCadastro({ ...valido, email: '  Marina@Pizzaria.com.BR ' });
    expect(r.ok && r.dados.email).toBe('marina@pizzaria.com.br');
  });

  it('recusa CNPJ com dígito verificador errado', () => {
    const r = validarPayloadCadastro({ ...valido, cnpj: '11222333000182' });
    expect(r).toEqual({ ok: false, erro: 'CNPJ inválido.', status: 400 });
  });

  it('recusa senha curta demais', () => {
    const r = validarPayloadCadastro({ ...valido, senha: '1234567' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe('A senha precisa ter ao menos 8 caracteres.');
  });

  it('recusa e-mail sem formato de e-mail', () => {
    const r = validarPayloadCadastro({ ...valido, email: 'marina-arroba-pizzaria' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe('E-mail inválido.');
  });

  it('recusa UF que não existe', () => {
    const r = validarPayloadCadastro({ ...valido, uf: 'XX' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe('UF inválida.');
  });

  it('recusa campo obrigatório ausente', () => {
    const { numero, ...semNumero } = valido;
    const r = validarPayloadCadastro(semNumero);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('aceita complemento vazio', () => {
    const r = validarPayloadCadastro({ ...valido, complemento: '' });
    expect(r.ok).toBe(true);
  });

  it('recusa campo obrigatório ausente com mensagem em português (nao a padrao do zod)', () => {
    const { numero, ...semNumero } = valido;
    const r = validarPayloadCadastro(semNumero);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.erro).toBe('Campo obrigatório.');
      expect(r.erro.toLowerCase()).not.toContain('required');
    }
  });

  it('recusa campo com tipo errado (numero onde se espera string) com mensagem em portugues', () => {
    const r = validarPayloadCadastro({ ...valido, nome: 12345 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.erro).toBe('Campo obrigatório.');
      expect(r.erro.toLowerCase()).not.toContain('expected');
      expect(r.erro.toLowerCase()).not.toContain('received');
    }
  });

  it('recusa payload que nao e um objeto (null) com mensagem em portugues', () => {
    const r = validarPayloadCadastro(null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.erro).toBe('Campo obrigatório.');
      expect(r.erro.toLowerCase()).not.toContain('expected');
    }
  });

  it('recusa payload que nao e um objeto (string) com mensagem em portugues', () => {
    const r = validarPayloadCadastro('nao sou um objeto');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.erro).toBe('Campo obrigatório.');
      expect(r.erro.toLowerCase()).not.toContain('expected');
    }
  });
});

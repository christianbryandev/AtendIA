import { describe, expect, it } from 'vitest';
import { obterOrigensPermitidas, origemEhPermitida } from './cors.js';

// Lista fixa de origens permitidas para os testes de origemEhPermitida, sem
// depender do APP_URL do ambiente onde os testes rodam.
const origensPermitidas = obterOrigensPermitidas('https://atendiarp.com.br');

describe('origemEhPermitida', () => {
  it('permite a origem de producao', () => {
    expect(origemEhPermitida('https://atendiarp.com.br', origensPermitidas)).toBe(true);
  });

  it('permite a variante com www', () => {
    expect(origemEhPermitida('https://www.atendiarp.com.br', origensPermitidas)).toBe(true);
  });

  it('permite o localhost de desenvolvimento', () => {
    expect(origemEhPermitida('http://localhost:5173', origensPermitidas)).toBe(true);
  });

  it('recusa uma origem qualquer', () => {
    expect(origemEhPermitida('https://outro-site.com', origensPermitidas)).toBe(false);
  });

  it('permite requisicao sem cabecalho Origin (servidor-a-servidor)', () => {
    expect(origemEhPermitida(undefined, origensPermitidas)).toBe(true);
  });

  it('recusa origem que apenas comeca com a permitida mas e outro dominio', () => {
    expect(origemEhPermitida('https://atendiarp.com.br.evil.com', origensPermitidas)).toBe(false);
  });
});

describe('obterOrigensPermitidas', () => {
  it('inclui a propria URL, a variante com www e o localhost de dev', () => {
    expect(obterOrigensPermitidas('https://atendiarp.com.br')).toEqual(
      expect.arrayContaining([
        'https://atendiarp.com.br',
        'https://www.atendiarp.com.br',
        'http://localhost:5173',
      ]),
    );
  });

  it('nao duplica a variante www se a URL ja for www', () => {
    const origens = obterOrigensPermitidas('https://www.atendiarp.com.br');
    expect(origens.filter((o) => o === 'https://www.atendiarp.com.br')).toHaveLength(1);
  });
});

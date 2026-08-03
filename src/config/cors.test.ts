import { describe, expect, it } from 'vitest';
import { normalizarAppUrl } from './env.js';
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

// Regressao do bug: se APP_URL fosse configurada no Render com barra final
// (ex.: "https://atendiarp.com.br/"), a lista de origens permitidas ficava
// com a barra, mas o cabecalho Origin que o navegador envia nunca tem barra
// final — entao toda chamada do frontend de producao era recusada por CORS.
// A normalizacao acontece na origem (normalizarAppUrl, em env.ts) antes de
// obterOrigensPermitidas ser chamada, entao simulamos aqui o mesmo caminho:
// normaliza o valor "sujo" e so entao monta a lista de origens. Sem a
// normalizacao, este teste falha porque a origem do navegador
// ("https://atendiarp.com.br", sem barra) nao bate com
// "https://atendiarp.com.br/" (com barra) na comparacao exata.
describe('APP_URL com barra final normalizada (regressao CORS)', () => {
  it('aceita a origem real do navegador em producao mesmo se APP_URL tiver barra final', () => {
    const appUrlSuja = 'https://atendiarp.com.br/';
    const origensPermitidas = obterOrigensPermitidas(normalizarAppUrl(appUrlSuja));

    expect(origemEhPermitida('https://atendiarp.com.br', origensPermitidas)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Preco from './sections/Preco';
import termos from '../../content/legal/termos.md?raw';

/**
 * O cliente compra pela landing e e regido pelos Termos de Uso. Se os dois
 * divergirem num numero contratual, a pagina de vendas vira promessa que o
 * contrato nao honra — risco de publicidade enganosa (CDC, Art. 37).
 *
 * Este arquivo existe porque a divergencia ja aconteceu: a cota de disparos
 * de campanha foi reduzida de 300 para 100 na landing, e os Termos ficaram
 * com o valor antigo. O teste extrai os numeros do contrato em vez de
 * repeti-los, para que alterar so um dos lados quebre a suite.
 */

const precoRenderizado = () => {
  const { container } = render(
    <MemoryRouter>
      <Preco />
    </MemoryRouter>
  );
  return container.textContent ?? '';
};

/** Le uma linha da tabela de cotas dos Termos e devolve o valor em negrito. */
function cotaDosTermos(rotulo: string): string {
  const linha = new RegExp(`\\|\\s*${rotulo}[^|]*\\|\\s*\\*\\*([\\d.]+)\\*\\*\\s*\\|`);
  const achado = termos.match(linha);
  if (!achado) {
    throw new Error(
      `Nao encontrei a linha "${rotulo}" na tabela de cotas dos Termos. ` +
        `Se a tabela mudou de formato, este teste precisa acompanhar.`
    );
  }
  return achado[1];
}

describe('coerencia entre a landing e os Termos de Uso', () => {
  it('a cota de creditos de IA e a mesma nos dois', () => {
    const doContrato = cotaDosTermos('Créditos de atendimento por IA');
    expect(doContrato).toBe('10.000');
    expect(precoRenderizado()).toContain(`${doContrato} créditos`);
  });

  it('a cota de disparos de campanha e a mesma nos dois', () => {
    const doContrato = cotaDosTermos('Disparos de campanha de reativação');
    expect(doContrato).toBe('100');
    expect(precoRenderizado()).toContain(`${doContrato} disparos`);
  });

  it('o preco mensal e o mesmo nos dois', () => {
    expect(termos).toMatch(/R\$\s*179,99/);
    expect(precoRenderizado()).toMatch(/R\$\s*179,99/);
  });

  it('a regra de consumo de creditos e a mesma nos dois', () => {
    // Texto usa 1 credito, audio usa 8. Se a landing anunciar uma proporcao
    // e o contrato cobrar outra, o cliente esgota a cota antes do esperado.
    expect(termos).toMatch(/\*\*por texto\*\* consome \*\*1 crédito\*\*/);
    expect(termos).toMatch(/\*\*por áudio\*\* consome \*\*8 créditos\*\*/);

    const landing = precoRenderizado();
    expect(landing).toMatch(/texto usa 1 crédito/i);
    expect(landing).toMatch(/em áudio, 8/i);
  });

  it('os Termos nao guardam a cota antiga de 300 disparos', () => {
    expect(termos).not.toMatch(/\*\*300\*\*/);
  });
});

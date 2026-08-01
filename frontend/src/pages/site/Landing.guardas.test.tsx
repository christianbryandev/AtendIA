import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';

/**
 * As guardas de conteudo (sem prova social inventada, sem "gratis", sem
 * urgencia falsa) so existiam nos testes de Hero e Preco. As outras seis
 * secoes da landing (Recursos, Faq, CtaFinal, ComoFunciona, Problema,
 * Demonstracao) podiam receber qualquer um desses textos proibidos sem que
 * nenhum teste percebesse. Este arquivo renderiza a landing inteira e aplica
 * as tres guardas ao texto completo, cobrindo as oito secoes de uma vez.
 */

const renderLanding = () => {
  const { container } = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );
  return container.textContent ?? '';
};

describe('Landing (completa) — guardas de conteudo comercial', () => {
  it('nao contem prova social inventada em nenhuma secao', () => {
    const texto = renderLanding();
    expect(texto).not.toMatch(/\+?\s*\d{3,}\s*(restaurantes|clientes|pedidos processados)/i);
    expect(texto).not.toMatch(/mais de \d/i);
    expect(texto).not.toMatch(/centenas de|milhares de|dezenas de/i);
    expect(texto).not.toMatch(/confiam|confia em n[óo]s/i);
    expect(texto).not.toMatch(/amado por|amada por/i);
    expect(texto).not.toMatch(/lojistas|restaurantes de todo o brasil/i);
  });

  it('nunca chama a oferta de gratis em nenhuma secao', () => {
    const texto = renderLanding();
    expect(texto).not.toMatch(/gr[áa]tis|gratuit[oa]|gratuitamente|de gra[çc]a/i);
  });

  it('nao usa urgencia falsa em nenhuma secao', () => {
    const texto = renderLanding();
    expect(texto).not.toMatch(
      /só hoje|últimas vagas|oferta expira|restam \d|por tempo limitado|vagas limitadas|não perca|aproveite agora|oferta por tempo/i
    );
  });
});

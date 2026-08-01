import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Preco from './Preco';

const wrap = () => render(<MemoryRouter><Preco /></MemoryRouter>);

describe('Preco', () => {
  it('mostra o preco exato', () => {
    const { container } = wrap();
    expect(container.textContent).toContain('R$ 179,99');
  });

  it('mostra a oferta com o texto exato da spec', () => {
    const { container } = wrap();
    expect(container.textContent).toContain(
      'Teste sem risco por 7 dias'
    );
    expect(container.textContent).toContain('devolvemos 100% do valor');
  });

  it('mostra as duas cotas com os numeros contratuais', () => {
    const { container } = wrap();
    expect(container.textContent).toContain('10.000 créditos');
    expect(container.textContent).toContain('100 disparos');
  });

  it('a estimativa de pedidos aparece com "aprox." e com a ressalva obrigatoria', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).toContain('≈300 pedidos');
    // Sem a ressalva, "300 pedidos" vira promessa que o sistema nao controla.
    expect(texto).toMatch(/estimativa/i);
    expect(texto).toMatch(/áudio/i);
  });

  it('deixa explicito que a cobranca acontece na contratacao, evitando a expectativa enganosa de "gratis"', () => {
    const { container } = wrap();
    expect(container.textContent).toContain(
      'A cobrança acontece na contratação; se pedir reembolso em até 7 dias, devolvemos 100% do valor.'
    );
  });

  it('o CTA leva ao cadastro', () => {
    wrap();
    expect(screen.getByRole('link', { name: 'Começar agora' }))
      .toHaveAttribute('href', '/cadastro');
  });

  it('nao usa urgencia falsa', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(
      /só hoje|últimas vagas|oferta expira|restam \d|por tempo limitado|vagas limitadas|não perca|aproveite agora|oferta por tempo/i
    );
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Hero from './Hero';

const wrap = () => render(<MemoryRouter><Hero /></MemoryRouter>);

describe('Hero', () => {
  it('tem exatamente um h1', () => {
    wrap();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('o CTA principal leva ao cadastro', () => {
    wrap();
    expect(screen.getByRole('link', { name: 'Começar agora' }))
      .toHaveAttribute('href', '/cadastro');
  });

  it('usa o texto exato da oferta, sem chamar de gratis', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).toContain('Teste sem risco por 7 dias');
    expect(texto).not.toMatch(/gr[áa]tis|gratuit[oa]|gratuitamente|de gra[çc]a/i);
  });

  it('nao contem prova social inventada', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(/\+?\s*\d{3,}\s*(restaurantes|clientes|pedidos processados)/i);
    expect(texto).not.toMatch(/mais de \d/i);
    expect(texto).not.toMatch(/centenas de|milhares de|dezenas de/i);
    expect(texto).not.toMatch(/confiam|confia em n[óo]s/i);
    expect(texto).not.toMatch(/amado por|amada por/i);
    expect(texto).not.toMatch(/lojistas|restaurantes de todo o brasil/i);
  });

  it('nao usa urgencia falsa', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(
      /só hoje|últimas vagas|oferta expira|restam \d|por tempo limitado|vagas limitadas|não perca|aproveite agora|oferta por tempo/i
    );
  });
});

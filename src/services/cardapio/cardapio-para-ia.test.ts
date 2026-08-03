import { describe, it, expect } from 'vitest';
import { montarTextoDoCardapio } from './cardapio-para-ia.js';

const cardapio = [
  {
    id: 'c1', nome: 'Pizzas', ordem: 0,
    produtos: [
      { id: 'p1', categoriaId: 'c1', nome: 'Calabresa', descricao: 'Molho, mucarela e calabresa', preco: 45, disponivel: true, ordem: 0 },
      { id: 'p2', categoriaId: 'c1', nome: 'Portuguesa', descricao: null, preco: 49.9, disponivel: false, ordem: 1 },
    ],
  },
  { id: 'c2', nome: 'Bebidas', ordem: 1, produtos: [
      { id: 'p3', categoriaId: 'c2', nome: 'Refrigerante 2L', descricao: null, preco: 12, disponivel: true, ordem: 0 },
  ] },
];

describe('montarTextoDoCardapio', () => {
  it('inclui nome e preco dos produtos disponiveis', () => {
    const texto = montarTextoDoCardapio(cardapio as any);
    expect(texto).toContain('Calabresa');
    expect(texto).toContain('45,00');
    expect(texto).toContain('Refrigerante 2L');
  });

  // Produto indisponivel no texto faria a IA vender o que acabou, e o
  // pedido chegaria na cozinha sem poder ser feito.
  it('omite produto indisponivel', () => {
    const texto = montarTextoDoCardapio(cardapio as any);
    expect(texto).not.toContain('Portuguesa');
  });

  it('agrupa por categoria', () => {
    const texto = montarTextoDoCardapio(cardapio as any);
    expect(texto.indexOf('Pizzas')).toBeLessThan(texto.indexOf('Calabresa'));
    expect(texto.indexOf('Bebidas')).toBeLessThan(texto.indexOf('Refrigerante'));
  });

  it('inclui a descricao quando existe', () => {
    expect(montarTextoDoCardapio(cardapio as any)).toContain('calabresa');
  });

  // Cardapio vazio nao pode virar prompt quebrado: a IA precisa saber
  // que nao ha o que vender e dizer isso ao cliente.
  it('deixa claro quando nao ha cardapio', () => {
    const texto = montarTextoDoCardapio([]);
    expect(texto.toLowerCase()).toContain('nenhum item');
  });

  // Categoria sem nenhum produto disponivel nao deve aparecer.
  it('omite categoria que ficou sem produtos', () => {
    const so_indisponivel = [{ id: 'c1', nome: 'Sobremesas', ordem: 0, produtos: [
      { id: 'p9', categoriaId: 'c1', nome: 'Pudim', descricao: null, preco: 10, disponivel: false, ordem: 0 },
    ] }];
    expect(montarTextoDoCardapio(so_indisponivel as any)).not.toContain('Sobremesas');
  });

  // A ferramenta finalizar_pedido depende do ID exato do produto para
  // gravar o pedido. Sem o ID no texto, a IA nao teria como referenciar
  // o produto certo ao chamar a ferramenta.
  it('inclui o id do produto disponivel', () => {
    const texto = montarTextoDoCardapio(cardapio as any);
    expect(texto).toContain('p1');
  });
});

import type { Categoria } from './cardapio-repo.js';

/**
 * Monta o cardápio em texto para entrar no prompt da IA.
 *
 * Roda a cada mensagem recebida, então precisa ser barato: um cardápio
 * de 40 itens gera algo em torno de 600 palavras.
 *
 * Produto indisponível é omitido de propósito. Se entrasse, a IA
 * ofereceria o que acabou e o pedido chegaria à cozinha sem poder ser
 * feito.
 *
 * Cada linha traz o ID do produto no formato `[ID: ...]` — a ferramenta
 * finalizar_pedido, no agente de IA, depende desse ID exato para gravar
 * o pedido no banco. Não remova o ID daqui: sem ele a IA não tem como
 * dizer qual produto o cliente escolheu, e o pedido não pode ser
 * finalizado.
 */
export function montarTextoDoCardapio(categorias: Categoria[]): string {
  const linhas: string[] = [];

  for (const categoria of categorias) {
    const disponiveis = categoria.produtos.filter((p) => p.disponivel);
    if (disponiveis.length === 0) continue;

    linhas.push(`## ${categoria.nome}`);

    for (const produto of disponiveis) {
      const preco = produto.preco.toFixed(2).replace('.', ',');
      const descricao = produto.descricao ? ` — ${produto.descricao}` : '';
      linhas.push(`- [ID: ${produto.id}] ${produto.nome}: R$ ${preco}${descricao}`);
    }

    linhas.push('');
  }

  if (linhas.length === 0) {
    return 'Nenhum item disponível no cardápio no momento.';
  }

  return linhas.join('\n').trim();
}

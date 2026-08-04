import { supabaseAdmin } from '../../config/supabase.js';

export interface Produto {
  id: string;
  categoriaId: string | null;
  nome: string;
  descricao: string | null;
  preco: number;
  disponivel: boolean;
  ordem: number;
}

export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
  produtos: Produto[];
}

interface LinhaCategoria {
  id: string;
  nome: string;
  ordem_exibicao: number;
}

interface LinhaProduto {
  id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number;
  disponivel: boolean;
  ordem_exibicao: number;
}

const COLUNAS_CATEGORIA = 'id, nome, ordem_exibicao';
const COLUNAS_PRODUTO = 'id, categoria_id, nome, descricao, preco, disponivel, ordem_exibicao';

function produtoParaDominio(l: LinhaProduto): Produto {
  return {
    id: l.id,
    categoriaId: l.categoria_id,
    nome: l.nome,
    descricao: l.descricao,
    preco: Number(l.preco),
    disponivel: l.disponivel,
    ordem: l.ordem_exibicao,
  };
}

/**
 * Lista as categorias com seus produtos, para exibição no painel e para
 * montar o texto do cardápio na IA.
 *
 * Feito em duas consultas simples (categorias e produtos) e agrupado em
 * memória: mais previsível que um join aninhado do PostgREST, e o volume
 * de linhas é pequeno (dezenas de itens por restaurante).
 */
export async function listarCardapio(restauranteId: string): Promise<Categoria[]> {
  const { data: categoriasData, error: erroCategorias } = await supabaseAdmin
    .from('categorias_cardapio')
    .select(COLUNAS_CATEGORIA)
    .eq('restaurante_id', restauranteId)
    .order('ordem_exibicao', { ascending: true });

  if (erroCategorias) throw erroCategorias;

  const { data: produtosData, error: erroProdutos } = await supabaseAdmin
    .from('produtos_cardapio')
    .select(COLUNAS_PRODUTO)
    .eq('restaurante_id', restauranteId)
    .order('ordem_exibicao', { ascending: true });

  if (erroProdutos) throw erroProdutos;

  const produtosPorCategoria = new Map<string, Produto[]>();
  for (const linha of (produtosData ?? []) as LinhaProduto[]) {
    const produto = produtoParaDominio(linha);
    if (!produto.categoriaId) continue;
    const lista = produtosPorCategoria.get(produto.categoriaId) ?? [];
    lista.push(produto);
    produtosPorCategoria.set(produto.categoriaId, lista);
  }

  return ((categoriasData ?? []) as LinhaCategoria[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    ordem: c.ordem_exibicao,
    produtos: produtosPorCategoria.get(c.id) ?? [],
  }));
}

export async function criarCategoria(
  restauranteId: string,
  nome: string,
  ordem = 0,
): Promise<Categoria> {
  const { data, error } = await supabaseAdmin
    .from('categorias_cardapio')
    .insert({ restaurante_id: restauranteId, nome, ordem_exibicao: ordem })
    .select(COLUNAS_CATEGORIA)
    .single();

  if (error) throw error;
  const linha = data as LinhaCategoria;
  return { id: linha.id, nome: linha.nome, ordem: linha.ordem_exibicao, produtos: [] };
}

export async function atualizarCategoria(
  restauranteId: string,
  categoriaId: string,
  dados: { nome?: string; ordem?: number },
): Promise<void> {
  const atualizacao: Record<string, unknown> = {};
  if (dados.nome !== undefined) atualizacao.nome = dados.nome;
  if (dados.ordem !== undefined) atualizacao.ordem_exibicao = dados.ordem;

  const { error } = await supabaseAdmin
    .from('categorias_cardapio')
    .update(atualizacao)
    .eq('id', categoriaId)
    .eq('restaurante_id', restauranteId);

  if (error) throw error;
}

/**
 * Recusa remover categoria que ainda tem produto associado, para não
 * deixar produtos órfãos (sem categoria) silenciosamente.
 */
export async function removerCategoria(restauranteId: string, categoriaId: string): Promise<void> {
  const { count, error: erroContagem } = await supabaseAdmin
    .from('produtos_cardapio')
    .select('id', { count: 'exact', head: true })
    .eq('restaurante_id', restauranteId)
    .eq('categoria_id', categoriaId);

  if (erroContagem) throw erroContagem;
  if (count && count > 0) {
    throw new Error('Não é possível remover uma categoria que ainda tem produtos cadastrados.');
  }

  const { error } = await supabaseAdmin
    .from('categorias_cardapio')
    .delete()
    .eq('id', categoriaId)
    .eq('restaurante_id', restauranteId);

  if (error) throw error;
}

export async function criarProduto(
  restauranteId: string,
  dados: {
    categoriaId: string | null;
    nome: string;
    descricao?: string | null;
    preco: number;
    ordem?: number;
  },
): Promise<Produto> {
  const { data, error } = await supabaseAdmin
    .from('produtos_cardapio')
    .insert({
      restaurante_id: restauranteId,
      categoria_id: dados.categoriaId,
      nome: dados.nome,
      descricao: dados.descricao ?? null,
      preco: dados.preco,
      ordem_exibicao: dados.ordem ?? 0,
    })
    .select(COLUNAS_PRODUTO)
    .single();

  if (error) throw error;
  return produtoParaDominio(data as LinhaProduto);
}

export async function atualizarProduto(
  restauranteId: string,
  produtoId: string,
  dados: {
    categoriaId?: string | null;
    nome?: string;
    descricao?: string | null;
    preco?: number;
    disponivel?: boolean;
    ordem?: number;
  },
): Promise<void> {
  const atualizacao: Record<string, unknown> = {};
  if (dados.categoriaId !== undefined) atualizacao.categoria_id = dados.categoriaId;
  if (dados.nome !== undefined) atualizacao.nome = dados.nome;
  if (dados.descricao !== undefined) atualizacao.descricao = dados.descricao;
  if (dados.preco !== undefined) atualizacao.preco = dados.preco;
  if (dados.disponivel !== undefined) atualizacao.disponivel = dados.disponivel;
  if (dados.ordem !== undefined) atualizacao.ordem_exibicao = dados.ordem;

  const { error } = await supabaseAdmin
    .from('produtos_cardapio')
    .update(atualizacao)
    .eq('id', produtoId)
    .eq('restaurante_id', restauranteId);

  if (error) throw error;
}

/**
 * Se o produto já apareceu em algum pedido, apagar quebraria o
 * histórico (itens_pedido guarda um snapshot, mas produto_id ficaria
 * pendurado). Por isso só marcamos disponivel = false. Se nunca foi
 * pedido, apagamos de verdade.
 */
export async function removerProduto(restauranteId: string, produtoId: string): Promise<void> {
  const { count, error: erroContagem } = await supabaseAdmin
    .from('itens_pedido')
    .select('id', { count: 'exact', head: true })
    .eq('produto_id', produtoId);

  if (erroContagem) throw erroContagem;

  if (count && count > 0) {
    const { error } = await supabaseAdmin
      .from('produtos_cardapio')
      .update({ disponivel: false })
      .eq('id', produtoId)
      .eq('restaurante_id', restauranteId);

    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin
    .from('produtos_cardapio')
    .delete()
    .eq('id', produtoId)
    .eq('restaurante_id', restauranteId);

  if (error) throw error;
}

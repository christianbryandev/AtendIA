import { useEffect, useState, type FormEvent } from 'react';
import Container from '../../components/ui/Container';
import { apiFetch } from '../../services/api';

interface Produto {
  id: string;
  categoriaId: string | null;
  nome: string;
  descricao: string | null;
  preco: number;
  disponivel: boolean;
  ordem: number;
}

interface Categoria {
  id: string;
  nome: string;
  ordem: number;
  produtos: Produto[];
}

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Valida o preço antes de chamar a API: precisa ser positivo e ter no
 * máximo duas casas decimais. O backend valida de novo, mas recusar aqui
 * evita uma ida ao servidor só para devolver um erro óbvio.
 */
function precoValido(valor: string): number | null {
  const texto = valor.trim();
  // Validado na string (nao em aritmetica de ponto flutuante): numero*100
  // arredondado diverge do valor exato para casos como 19.99 e 1.15,
  // rejeitando precos validos por erro de representacao binaria.
  if (!/^\d+([.,]\d{1,2})?$/.test(texto)) return null;

  const numero = Number(texto.replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return numero;
}

export default function Cardapio() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Categorias comecam expandidas: o lojista precisa ver o que ja cadastrou
  // sem precisar clicar em cada uma. O clique so recolhe para arrumar a tela
  // quando ha muitos itens.
  const [categoriasFechadas, setCategoriasFechadas] = useState<Set<string>>(new Set());

  const [nomeCategoria, setNomeCategoria] = useState('');
  const [criandoCategoria, setCriandoCategoria] = useState(false);

  const [novoProduto, setNovoProduto] = useState<{ nome: string; descricao: string; preco: string }>({
    nome: '',
    descricao: '',
    preco: '',
  });
  const [criandoProduto, setCriandoProduto] = useState(false);

  const carregarCardapio = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await apiFetch('/cardapio');
      const dados = await resposta.json();
      if (resposta.ok) {
        setCategorias(dados.categorias ?? []);
      } else {
        setErro(dados.error || 'Não foi possível carregar o cardápio.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregarCardapio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const criarCategoria = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!nomeCategoria.trim()) return;

    setErro(null);
    setCriandoCategoria(true);
    try {
      const resposta = await apiFetch('/cardapio/categorias', {
        method: 'POST',
        body: JSON.stringify({ nome: nomeCategoria.trim() }),
      });
      const dados = await resposta.json();
      if (resposta.ok) {
        setCategorias((atual) => [...atual, dados.categoria]);
        setNomeCategoria('');
      } else {
        setErro(dados.error || 'Não foi possível criar a categoria.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setCriandoCategoria(false);
    }
  };

  const removerCategoria = async (categoriaId: string) => {
    if (!window.confirm('Remover esta categoria?')) return;

    setErro(null);
    try {
      const resposta = await apiFetch(`/cardapio/categorias/${categoriaId}`, { method: 'DELETE' });
      const dados = await resposta.json();
      if (resposta.ok) {
        setCategorias((atual) => atual.filter((c) => c.id !== categoriaId));
      } else {
        setErro(dados.error || 'Não foi possível remover a categoria.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    }
  };

  const criarProduto = async (evento: FormEvent, categoriaId: string) => {
    evento.preventDefault();
    setErro(null);

    if (!novoProduto.nome.trim()) return;

    const preco = precoValido(novoProduto.preco);
    if (preco === null) {
      setErro('Preço inválido: informe um número positivo com no máximo duas casas decimais.');
      return;
    }

    setCriandoProduto(true);
    try {
      const resposta = await apiFetch('/cardapio/produtos', {
        method: 'POST',
        body: JSON.stringify({
          categoriaId,
          nome: novoProduto.nome.trim(),
          descricao: novoProduto.descricao.trim() || null,
          preco,
        }),
      });
      const dados = await resposta.json();
      if (resposta.ok) {
        setCategorias((atual) =>
          atual.map((c) => (c.id === categoriaId ? { ...c, produtos: [...c.produtos, dados.produto] } : c)),
        );
        setNovoProduto({ nome: '', descricao: '', preco: '' });
      } else {
        setErro(dados.error || 'Não foi possível criar o produto.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setCriandoProduto(false);
    }
  };

  const alternarDisponibilidade = async (produto: Produto) => {
    setErro(null);
    const disponivel = !produto.disponivel;
    try {
      const resposta = await apiFetch(`/cardapio/produtos/${produto.id}`, {
        method: 'PUT',
        body: JSON.stringify({ disponivel }),
      });
      const dados = await resposta.json();
      if (resposta.ok) {
        setCategorias((atual) =>
          atual.map((c) => ({
            ...c,
            produtos: c.produtos.map((p) => (p.id === produto.id ? { ...p, disponivel } : p)),
          })),
        );
      } else {
        setErro(dados.error || 'Não foi possível atualizar o produto.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    }
  };

  const removerProduto = async (produto: Produto) => {
    if (!window.confirm(`Remover "${produto.nome}"?`)) return;

    setErro(null);
    try {
      const resposta = await apiFetch(`/cardapio/produtos/${produto.id}`, { method: 'DELETE' });
      const dados = await resposta.json();
      if (resposta.ok) {
        setCategorias((atual) =>
          atual.map((c) => ({ ...c, produtos: c.produtos.filter((p) => p.id !== produto.id) })),
        );
      } else {
        setErro(dados.error || 'Não foi possível remover o produto.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    }
  };

  const cardapioVazio = !carregando && categorias.length === 0;

  return (
    <Container className="py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink-800">Cardápio</h1>
      <p className="mt-3 text-ink-600">
        Cadastre as categorias e os produtos que a IA vai usar para atender seus clientes no WhatsApp.
      </p>

      {erro && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      {carregando && <p className="mt-8 text-sm text-ink-600">Carregando cardápio…</p>}

      {cardapioVazio && (
        <div role="status" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Seu cardápio está vazio. Cadastre ao menos uma categoria e um produto para a IA conseguir atender seus
          clientes no WhatsApp.
        </div>
      )}

      {!carregando && (
        <form onSubmit={criarCategoria} className="mt-8 flex max-w-md items-end gap-3">
          <div className="flex-1">
            <label htmlFor="nome-categoria" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-400">
              Nome da categoria
            </label>
            <input
              id="nome-categoria"
              type="text"
              value={nomeCategoria}
              onChange={(e) => setNomeCategoria(e.target.value)}
              className="w-full rounded-lg border border-stone-300 p-2.5 text-sm text-ink-800"
              placeholder="Ex.: Pizzas"
            />
          </div>
          <button
            type="submit"
            disabled={criandoCategoria}
            className="rounded-lg bg-brand-700 p-2.5 px-4 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70"
          >
            {criandoCategoria ? 'Criando...' : 'Criar categoria'}
          </button>
        </form>
      )}

      <div className="mt-8 space-y-4">
        {categorias.map((categoria) => {
          const aberta = !categoriasFechadas.has(categoria.id);
          const alternarAberta = () =>
            setCategoriasFechadas((atual) => {
              const proximo = new Set(atual);
              if (proximo.has(categoria.id)) proximo.delete(categoria.id);
              else proximo.add(categoria.id);
              return proximo;
            });
          return (
            <div key={categoria.id} className="rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex items-center justify-between p-5">
                <button
                  type="button"
                  onClick={alternarAberta}
                  className="text-left font-semibold text-ink-800"
                >
                  {categoria.nome}
                  <span className="ml-2 text-xs font-normal text-stone-400">
                    ({categoria.produtos.length} {categoria.produtos.length === 1 ? 'produto' : 'produtos'})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removerCategoria(categoria.id)}
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Remover categoria
                </button>
              </div>

              {aberta && (
                <div className="border-t border-stone-100 p-5">
                  {categoria.produtos.length === 0 && (
                    <p className="text-sm text-ink-600">Nenhum produto nesta categoria ainda.</p>
                  )}

                  <ul className="space-y-3">
                    {categoria.produtos.map((produto) => (
                      <li
                        key={produto.id}
                        className="flex items-center justify-between rounded-lg border border-stone-200 p-3"
                      >
                        <div>
                          <p className="font-semibold text-ink-800">{produto.nome}</p>
                          {produto.descricao && (
                            <p className="text-sm text-stone-500">{produto.descricao}</p>
                          )}
                          <p className="text-sm font-semibold text-ink-800">
                            {formatoMoeda.format(produto.preco)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => alternarDisponibilidade(produto)}
                            className={`rounded-lg border p-2 text-xs font-bold ${
                              produto.disponivel
                                ? 'border-brand-500/30 bg-brand-50 text-brand-900'
                                : 'border-stone-300 text-stone-500'
                            }`}
                          >
                            {produto.disponivel ? 'Disponível' : 'Indisponível'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removerProduto(produto)}
                            className="text-sm font-semibold text-red-600 hover:text-red-700"
                          >
                            Remover produto
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <form onSubmit={(e) => criarProduto(e, categoria.id)} className="mt-5 space-y-3">
                    <div>
                      <label
                        htmlFor={`nome-produto-${categoria.id}`}
                        className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-400"
                      >
                        Nome do produto
                      </label>
                      <input
                        id={`nome-produto-${categoria.id}`}
                        type="text"
                        value={novoProduto.nome}
                        onChange={(e) => setNovoProduto((atual) => ({ ...atual, nome: e.target.value }))}
                        className="w-full rounded-lg border border-stone-300 p-2.5 text-sm text-ink-800"
                        placeholder="Ex.: Marguerita"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`descricao-produto-${categoria.id}`}
                        className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-400"
                      >
                        Descrição
                      </label>
                      <input
                        id={`descricao-produto-${categoria.id}`}
                        type="text"
                        value={novoProduto.descricao}
                        onChange={(e) => setNovoProduto((atual) => ({ ...atual, descricao: e.target.value }))}
                        className="w-full rounded-lg border border-stone-300 p-2.5 text-sm text-ink-800"
                        placeholder="Opcional"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`preco-produto-${categoria.id}`}
                        className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-400"
                      >
                        Preço
                      </label>
                      <input
                        id={`preco-produto-${categoria.id}`}
                        type="text"
                        inputMode="decimal"
                        value={novoProduto.preco}
                        onChange={(e) => setNovoProduto((atual) => ({ ...atual, preco: e.target.value }))}
                        className="w-full max-w-[10rem] rounded-lg border border-stone-300 p-2.5 text-sm text-ink-800"
                        placeholder="Ex.: 45,90"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={criandoProduto}
                      className="rounded-lg bg-brand-700 p-2.5 px-4 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70"
                    >
                      {criandoProduto ? 'Criando...' : 'Criar produto'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Container>
  );
}

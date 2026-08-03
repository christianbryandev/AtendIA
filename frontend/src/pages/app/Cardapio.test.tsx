import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Cardapio from './Cardapio';

const CARDAPIO_COM_ITENS = {
  categorias: [
    {
      id: 'cat-1',
      nome: 'Pizzas',
      ordem: 0,
      produtos: [
        { id: 'prod-1', categoriaId: 'cat-1', nome: 'Marguerita', descricao: 'Molho, mussarela e manjericão', preco: 45.9, disponivel: true, ordem: 0 },
      ],
    },
  ],
};

const CARDAPIO_VAZIO = { categorias: [] };

function stubFetch(handler: (url: string, options?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(handler));
}

function respostaJson(corpo: unknown, ok = true) {
  return { ok, json: async () => corpo } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function montar() {
  return render(<MemoryRouter><Cardapio /></MemoryRouter>);
}

describe('Cardapio', () => {
  it('lista categorias e produtos vindos da API', async () => {
    stubFetch(async () => respostaJson(CARDAPIO_COM_ITENS));
    montar();

    expect(await screen.findByText('Pizzas')).toBeInTheDocument();
    expect(await screen.findByText('Marguerita')).toBeInTheDocument();
    expect(screen.getByText('R$ 45,90')).toBeInTheDocument();
  });

  it('mostra aviso quando o cardápio está vazio, explicando que a IA precisa dele para atender', async () => {
    stubFetch(async () => respostaJson(CARDAPIO_VAZIO));
    montar();

    const aviso = await screen.findByText(/cardápio.*vazio/i);
    expect(aviso).toBeInTheDocument();
    expect(aviso.closest('[role="status"]')).toHaveTextContent(/atender.*whatsapp|whatsapp.*atender/i);
  });

  it('cria categoria chamando POST /cardapio/categorias', async () => {
    const user = userEvent.setup();
    stubFetch(async (url: string) => {
      if (String(url).includes('/cardapio/categorias') ) {
        return respostaJson({ categoria: { id: 'cat-2', nome: 'Bebidas', ordem: 1, produtos: [] } }, true);
      }
      return respostaJson(CARDAPIO_VAZIO);
    });
    montar();

    await screen.findByText(/cardápio.*vazio/i);

    await user.type(screen.getByLabelText(/nome da categoria/i), 'Bebidas');
    await user.click(screen.getByRole('button', { name: /criar categoria/i }));

    await waitFor(() => {
      const chamada = (globalThis.fetch as any).mock.calls
        .find(([url]: [string]) => String(url).includes('/cardapio/categorias') && String(url).endsWith('/cardapio/categorias'));
      expect(chamada).toBeTruthy();
      expect(chamada[1].method).toBe('POST');
      const corpo = JSON.parse(chamada[1].body);
      expect(corpo.nome).toBe('Bebidas');
    });
  });

  it('recusa preço inválido (zero, negativo ou texto) antes de chamar a API, com mensagem em português', async () => {
    const user = userEvent.setup();
    stubFetch(async () => respostaJson(CARDAPIO_COM_ITENS));
    montar();

    await screen.findByText('Pizzas');

    await user.type(screen.getByLabelText(/nome do produto/i), 'Refrigerante');
    await user.type(screen.getByLabelText(/preço/i), '0');
    await user.click(screen.getByRole('button', { name: /criar produto/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/preço/i);

    const chamadasCriarProduto = (globalThis.fetch as any).mock.calls
      .filter(([url, opts]: [string, RequestInit]) => String(url).includes('/cardapio/produtos') && opts?.method === 'POST');
    expect(chamadasCriarProduto).toHaveLength(0);
  });

  it('aceita preço com duas casas decimais que dão problema de ponto flutuante (19,99)', async () => {
    const user = userEvent.setup();
    stubFetch(async (url: string, opts?: RequestInit) => {
      if (String(url).includes('/cardapio/produtos') && opts?.method === 'POST') {
        return respostaJson({ produto: { id: 'prod-2', categoriaId: 'cat-1', nome: 'Refrigerante', descricao: null, preco: 19.99, disponivel: true, ordem: 1 } });
      }
      return respostaJson(CARDAPIO_COM_ITENS);
    });
    montar();

    await screen.findByText('Pizzas');
    await user.type(screen.getByLabelText(/nome do produto/i), 'Refrigerante');
    await user.type(screen.getByLabelText(/preço/i), '19,99');
    await user.click(screen.getByRole('button', { name: /criar produto/i }));

    await waitFor(() => {
      const chamada = (globalThis.fetch as any).mock.calls
        .find(([url, opts]: [string, RequestInit]) => String(url).includes('/cardapio/produtos') && opts?.method === 'POST');
      expect(chamada).toBeTruthy();
      const corpo = JSON.parse(chamada[1].body);
      expect(corpo.preco).toBe(19.99);
    });
  });

  it('alterna a disponibilidade do produto chamando PUT', async () => {
    const user = userEvent.setup();
    stubFetch(async (url: string, opts?: RequestInit) => {
      if (String(url).includes('/cardapio/produtos/prod-1') && opts?.method === 'PUT') {
        return respostaJson({ success: true });
      }
      return respostaJson(CARDAPIO_COM_ITENS);
    });
    montar();

    await screen.findByText('Marguerita');

    await user.click(screen.getByRole('button', { name: /indisponibilizar|disponível/i }));

    await waitFor(() => {
      const chamada = (globalThis.fetch as any).mock.calls
        .find(([url, opts]: [string, RequestInit]) => String(url).includes('/cardapio/produtos/prod-1') && opts?.method === 'PUT');
      expect(chamada).toBeTruthy();
      const corpo = JSON.parse(chamada[1].body);
      expect(corpo.disponivel).toBe(false);
    });
  });

  it('pede confirmação antes de remover um produto', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    stubFetch(async () => respostaJson(CARDAPIO_COM_ITENS));
    montar();

    await screen.findByText('Marguerita');
    await user.click(screen.getByRole('button', { name: /remover produto/i }));

    expect(confirmSpy).toHaveBeenCalled();
    const chamadasRemover = (globalThis.fetch as any).mock.calls
      .filter(([, opts]: [string, RequestInit]) => opts?.method === 'DELETE');
    expect(chamadasRemover).toHaveLength(0);

    confirmSpy.mockRestore();
  });
});

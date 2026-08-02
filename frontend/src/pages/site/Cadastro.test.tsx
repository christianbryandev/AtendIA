import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Cadastro from './Cadastro';

const navegar = vi.fn();

vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useNavigate: () => navegar };
});

function montar() {
  return render(<MemoryRouter><Cadastro /></MemoryRouter>);
}

async function preencherTudo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/seu nome/i), 'Marina Souza');
  await user.type(screen.getByLabelText(/e-mail/i), 'marina@pizzaria.com.br');
  await user.type(screen.getByLabelText(/senha/i), 'senhaforte123');
  await user.type(screen.getByLabelText(/nome do restaurante/i), 'Pizzaria do Bairro');
  await user.type(screen.getByLabelText(/cnpj/i), '11222333000181');
  await user.type(screen.getByLabelText(/cep/i), '01310100');
  await user.type(screen.getByLabelText(/rua/i), 'Avenida Paulista');
  await user.type(screen.getByLabelText(/número/i), '1000');
  await user.type(screen.getByLabelText(/bairro/i), 'Bela Vista');
  await user.type(screen.getByLabelText(/cidade/i), 'São Paulo');
  await user.type(screen.getByLabelText(/^uf$/i), 'SP');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('viacep')) {
      return { ok: true, json: async () => ({ logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, token: 'jwt-de-teste' }) } as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cadastro', () => {
  it('mostra o formulário, não a mensagem de "em breve"', () => {
    montar();
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeInTheDocument();
    expect(screen.queryByText(/estamos finalizando/i)).not.toBeInTheDocument();
  });

  it('acusa CNPJ inválido antes de chamar o servidor', async () => {
    const user = userEvent.setup();
    montar();

    await preencherTudo(user);
    await user.clear(screen.getByLabelText(/cnpj/i));
    await user.type(screen.getByLabelText(/cnpj/i), '11222333000182');
    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    expect(await screen.findByText('CNPJ inválido.')).toBeInTheDocument();
    const chamadasAoCadastro = (globalThis.fetch as any).mock.calls
      .filter(([url]: [string]) => String(url).includes('/auth/cadastro'));
    expect(chamadasAoCadastro).toHaveLength(0);
  });

  it('guarda o token e leva ao pagamento quando o cadastro dá certo', async () => {
    const user = userEvent.setup();
    montar();

    await preencherTudo(user);
    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('jwt-de-teste');
    });
    expect(navegar).toHaveBeenCalledWith('/assinatura/pagamento');
  });

  it('mostra o erro que o servidor devolveu', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('viacep')) {
        return { ok: true, json: async () => ({ erro: true }) } as Response;
      }
      return { ok: false, json: async () => ({ success: false, error: 'Já existe uma conta com este e-mail.' }) } as Response;
    }));

    const user = userEvent.setup();
    montar();

    await preencherTudo(user);
    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    expect(await screen.findByText('Já existe uma conta com este e-mail.')).toBeInTheDocument();
  });

  it('preenche o endereço sozinho quando o CEP é encontrado', async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText(/cep/i), '01310100');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByLabelText(/rua/i)).toHaveValue('Avenida Paulista');
      expect(screen.getByLabelText(/cidade/i)).toHaveValue('São Paulo');
    });
  });

  it('não sobrescreve um campo já preenchido pelo lojista, mas completa os campos vazios', async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText(/cidade/i), 'Rio de Janeiro');
    await user.type(screen.getByLabelText(/cep/i), '01310100');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByLabelText(/rua/i)).toHaveValue('Avenida Paulista');
    });
    expect(screen.getByLabelText(/cidade/i)).toHaveValue('Rio de Janeiro');
  });

  it('avisa quando o endereço do CEP diverge do que foi digitado, e some ao aplicar', async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText(/cidade/i), 'Rio de Janeiro');
    await user.type(screen.getByLabelText(/cep/i), '01310100');
    await user.tab();

    expect(await screen.findByText(/endereço deste cep é outro/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /usar o endereço deste cep/i }));

    expect(screen.getByLabelText(/cidade/i)).toHaveValue('São Paulo');
    expect(screen.queryByText(/endereço deste cep é outro/i)).not.toBeInTheDocument();
  });

  it('some com o aviso de divergência quando o lojista muda o CEP de novo', async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText(/cidade/i), 'Rio de Janeiro');
    await user.type(screen.getByLabelText(/cep/i), '01310100');
    await user.tab();

    expect(await screen.findByText(/endereço deste cep é outro/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/cep/i), '9');

    expect(screen.queryByText(/endereço deste cep é outro/i)).not.toBeInTheDocument();
  });

  it('envia o CNPJ só com dígitos mesmo quando ele é colado já formatado', async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText(/seu nome/i), 'Marina Souza');
    await user.type(screen.getByLabelText(/e-mail/i), 'marina@pizzaria.com.br');
    await user.type(screen.getByLabelText(/senha/i), 'senhaforte123');
    await user.type(screen.getByLabelText(/nome do restaurante/i), 'Pizzaria do Bairro');

    const campoCnpj = screen.getByLabelText(/cnpj/i);
    await user.click(campoCnpj);
    await user.paste('11.222.333/0001-81');
    expect(campoCnpj).toHaveValue('11.222.333/0001-81');

    await user.type(screen.getByLabelText(/cep/i), '01310100');
    await user.type(screen.getByLabelText(/rua/i), 'Avenida Paulista');
    await user.type(screen.getByLabelText(/número/i), '1000');
    await user.type(screen.getByLabelText(/bairro/i), 'Bela Vista');
    await user.type(screen.getByLabelText(/cidade/i), 'São Paulo');
    await user.type(screen.getByLabelText(/^uf$/i), 'SP');

    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    await waitFor(() => {
      const chamada = (globalThis.fetch as any).mock.calls
        .find(([url]: [string]) => String(url).includes('/auth/cadastro'));
      expect(chamada).toBeTruthy();
      const corpo = JSON.parse(chamada[1].body);
      expect(corpo.cnpj).toBe('11222333000181');
    });
  });
});

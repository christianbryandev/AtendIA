import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RedefinirSenha from './RedefinirSenha';

const navegar = vi.fn();

vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useNavigate: () => navegar };
});

function montar(token = 'token-valido-123') {
  return render(
    <MemoryRouter initialEntries={[`/redefinir-senha?token=${token}`]}>
      <RedefinirSenha />
    </MemoryRouter>,
  );
}

async function preencherSenhas(user: ReturnType<typeof userEvent.setup>, senha: string, confirmacao: string) {
  await user.type(screen.getByLabelText(/^nova senha$/i), senha);
  await user.type(screen.getByLabelText(/confirme a nova senha/i), confirmacao);
  await user.click(screen.getByRole('button', { name: /redefinir senha/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RedefinirSenha', () => {
  it('recusa senha curta demais antes de chamar a API', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    montar();

    await preencherSenhas(user, 'curta12', 'curta12');

    expect(await screen.findByRole('alert')).toHaveTextContent(/8 caracteres/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('recusa quando a senha e a confirmação são diferentes', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    montar();

    await preencherSenhas(user, 'senhaforte123', 'senhaforte124');

    expect(await screen.findByRole('alert')).toHaveTextContent(/não conferem|não são iguais|coincidem/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('redireciona para o login com aviso quando dá certo', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, message: 'Senha redefinida com sucesso.' }),
    } as Response)));
    montar();

    await preencherSenhas(user, 'senhaforte123', 'senhaforte123');

    await waitFor(() => {
      expect(navegar).toHaveBeenCalledWith(
        '/login',
        expect.objectContaining({ state: expect.objectContaining({ aviso: expect.any(String) }) }),
      );
    });

    const chamada = (globalThis.fetch as any).mock.calls.find(([url]: [string]) =>
      String(url).includes('/auth/redefinir-senha'),
    );
    expect(chamada).toBeTruthy();
    const corpo = JSON.parse(chamada[1].body);
    expect(corpo).toEqual({ token: 'token-valido-123', senha: 'senhaforte123' });
  });

  it('mostra mensagem clara e um caminho para pedir outro link quando o token é inválido', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Link inválido ou expirado. Solicite uma nova recuperação de senha.',
      }),
    } as Response)));
    montar();

    await preencherSenhas(user, 'senhaforte123', 'senhaforte123');

    expect(await screen.findByRole('alert')).toHaveTextContent(/link inválido ou expirado/i);
    expect(screen.getByRole('link', { name: /solicitar um novo link|esqueci minha senha/i }))
      .toHaveAttribute('href', '/esqueci-senha');
    expect(navegar).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const fromMock = vi.fn();
const enviarEmailMock = vi.fn();

vi.mock('../../config/supabase.js', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...a) },
}));

vi.mock('../../config/env.js', () => ({
  env: { APP_URL: 'https://app.atendiarp.com.br' },
}));

vi.mock('../email/resend-client.js', () => ({
  enviarEmail: (...a: unknown[]) => enviarEmailMock(...a),
}));

const {
  gerarTokenRecuperacao,
  validarToken,
  consumirTokenERedefinir,
} = await import('./recuperacao-senha.js');

function hashDoToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Extrai o token em texto puro do link enviado no e-mail mockado.
function tokenEnviadoNoEmail(): string {
  expect(enviarEmailMock).toHaveBeenCalled();
  const html = (enviarEmailMock.mock.calls[0][0] as { html: string }).html;
  const match = html.match(/token=([a-f0-9]+)/);
  if (!match) throw new Error('token nao encontrado no html do e-mail');
  return match[1];
}

beforeEach(() => {
  fromMock.mockReset();
  enviarEmailMock.mockReset();
  enviarEmailMock.mockResolvedValue(undefined);
});

describe('gerarTokenRecuperacao', () => {
  it('gera um token aleatorio e grava no banco apenas o hash, nunca o token', async () => {
    let linhaInserida: Record<string, unknown> | undefined;

    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'usuarios') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: 'usuario-1' }, error: null }),
            }),
          }),
        };
      }
      if (tabela === 'tokens_recuperacao') {
        return {
          insert: (linhas: Record<string, unknown>[]) => {
            linhaInserida = linhas[0];
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });

    await gerarTokenRecuperacao('lojista@pizzaria.com.br');

    expect(linhaInserida).toBeDefined();
    const tokenHashGravado = linhaInserida!.token_hash as string;

    // O hash gravado tem formato de SHA-256 em hex (64 caracteres).
    expect(tokenHashGravado).toMatch(/^[a-f0-9]{64}$/);

    const tokenDoEmail = tokenEnviadoNoEmail();
    // Token em texto puro: 32 bytes em hex = 64 caracteres.
    expect(tokenDoEmail).toMatch(/^[a-f0-9]{64}$/);

    // O token do e-mail é diferente do hash gravado...
    expect(tokenDoEmail).not.toBe(tokenHashGravado);
    // ...mas o hash gravado é exatamente o SHA-256 do token enviado.
    expect(tokenHashGravado).toBe(hashDoToken(tokenDoEmail));
  });

  it('gera tokens diferentes a cada chamada', async () => {
    const linhasInseridas: Record<string, unknown>[] = [];

    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'usuarios') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: 'usuario-1' }, error: null }),
            }),
          }),
        };
      }
      if (tabela === 'tokens_recuperacao') {
        return {
          insert: (linhas: Record<string, unknown>[]) => {
            linhasInseridas.push(linhas[0]);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });

    await gerarTokenRecuperacao('lojista@pizzaria.com.br');
    await gerarTokenRecuperacao('lojista@pizzaria.com.br');

    expect(linhasInseridas).toHaveLength(2);
    expect(linhasInseridas[0].token_hash).not.toBe(linhasInseridas[1].token_hash);
  });

  it('nao revela se o e-mail existe: e-mail inexistente nao grava nem envia nada', async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'usuarios') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });

    await expect(gerarTokenRecuperacao('naoexiste@pizzaria.com.br')).resolves.toBeUndefined();
    expect(enviarEmailMock).not.toHaveBeenCalled();
  });
});

describe('validarToken', () => {
  const TOKEN = 'a'.repeat(64);

  it('devolve o usuario_id quando o token e valido e esta dentro do prazo', async () => {
    fromMock.mockImplementation((tabela: string) => {
      expect(tabela).toBe('tokens_recuperacao');
      return {
        select: () => ({
          eq: (coluna: string, valor: string) => {
            expect(coluna).toBe('token_hash');
            expect(valor).toBe(hashDoToken(TOKEN));
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    usuario_id: 'usuario-1',
                    expira_em: new Date(Date.now() + 60_000).toISOString(),
                    usado_em: null,
                  },
                  error: null,
                }),
            };
          },
        }),
      };
    });

    const resultado = await validarToken(TOKEN);
    expect(resultado).toBe('usuario-1');
  });

  it('recusa token expirado', async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                usuario_id: 'usuario-1',
                expira_em: new Date(Date.now() - 60_000).toISOString(),
                usado_em: null,
              },
              error: null,
            }),
        }),
      }),
    }));

    const resultado = await validarToken(TOKEN);
    expect(resultado).toBeNull();
  });

  it('recusa token ja usado', async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                usuario_id: 'usuario-1',
                expira_em: new Date(Date.now() + 60_000).toISOString(),
                usado_em: new Date().toISOString(),
              },
              error: null,
            }),
        }),
      }),
    }));

    const resultado = await validarToken(TOKEN);
    expect(resultado).toBeNull();
  });

  it('recusa token inexistente', async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }));

    const resultado = await validarToken(TOKEN);
    expect(resultado).toBeNull();
  });
});

describe('consumirTokenERedefinir', () => {
  const TOKEN = 'b'.repeat(64);

  it('grava a nova senha com bcrypt e marca o token como usado', async () => {
    let senhaHashGravada: string | undefined;
    let tokenMarcadoUsado = false;

    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'tokens_recuperacao') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: 'token-1',
                    usuario_id: 'usuario-1',
                    expira_em: new Date(Date.now() + 60_000).toISOString(),
                    usado_em: null,
                  },
                  error: null,
                }),
            }),
          }),
          update: (valores: Record<string, unknown>) => ({
            eq: (coluna: string, valor: string) => {
              expect(coluna).toBe('id');
              expect(valor).toBe('token-1');
              expect(valores.usado_em).toBeTruthy();
              tokenMarcadoUsado = true;
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (tabela === 'usuarios') {
        return {
          update: (valores: Record<string, unknown>) => ({
            eq: (coluna: string, valor: string) => {
              expect(coluna).toBe('id');
              expect(valor).toBe('usuario-1');
              senhaHashGravada = valores.senha_hash as string;
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });

    const resultado = await consumirTokenERedefinir(TOKEN, 'novaSenhaForte123');

    expect(resultado).toBe(true);
    expect(senhaHashGravada).toBeDefined();
    // Nunca em texto puro: o valor gravado precisa ser um hash bcrypt válido.
    expect(senhaHashGravada).not.toBe('novaSenhaForte123');
    await expect(bcrypt.compare('novaSenhaForte123', senhaHashGravada!)).resolves.toBe(true);
    expect(tokenMarcadoUsado).toBe(true);
  });

  it('recusa token ja usado e nao altera a senha', async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'tokens_recuperacao') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: 'token-1',
                    usuario_id: 'usuario-1',
                    expira_em: new Date(Date.now() + 60_000).toISOString(),
                    usado_em: new Date().toISOString(),
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada nesta chamada: ${tabela}`);
    });

    const resultado = await consumirTokenERedefinir(TOKEN, 'novaSenhaForte123');
    expect(resultado).toBe(false);
  });

  it('recusa token expirado e nao altera a senha', async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'tokens_recuperacao') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: 'token-1',
                    usuario_id: 'usuario-1',
                    expira_em: new Date(Date.now() - 60_000).toISOString(),
                    usado_em: null,
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada nesta chamada: ${tabela}`);
    });

    const resultado = await consumirTokenERedefinir(TOKEN, 'novaSenhaForte123');
    expect(resultado).toBe(false);
  });

  it('recusa token inexistente', async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'tokens_recuperacao') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada nesta chamada: ${tabela}`);
    });

    const resultado = await consumirTokenERedefinir(TOKEN, 'novaSenhaForte123');
    expect(resultado).toBe(false);
  });
});

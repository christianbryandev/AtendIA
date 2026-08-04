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

  function mockUsuarioExisteEInsertOk() {
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
        return { insert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });
  }

  it('nao aguarda o envio do e-mail: resolve antes do envio terminar (dispara e segue)', async () => {
    // Envio controlado manualmente: só "termina" quando resolverEnvio()
    // for chamado, o que só acontece no fim deste teste.
    let resolverEnvio!: () => void;
    const envioPendente = new Promise<void>((resolve) => {
      resolverEnvio = resolve;
    });
    enviarEmailMock.mockReturnValue(envioPendente);
    mockUsuarioExisteEInsertOk();

    let funcaoResolveu = false;
    const chamada = gerarTokenRecuperacao('lojista@pizzaria.com.br').then(() => {
      funcaoResolveu = true;
    });

    // A busca e o insert são mocks que resolvem em microtasks; se a
    // função não aguarda o envio do e-mail, ela já terá resolvido antes
    // de qualquer macrotask (setTimeout) rodar. Se estivesse aguardando
    // o envio — que só resolve quando resolverEnvio() for chamado, o que
    // ainda não aconteceu aqui — a função continuaria pendente. Usamos
    // um setTimeout(0) real (em vez de um número de ms arbitrário) como
    // fronteira de macrotask: é a forma determinística de dar chance a
    // todas as microtasks pendentes de rodarem, sem depender de timing.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(funcaoResolveu).toBe(true);

    // Limpeza: libera o envio pendente para não deixar promise solta.
    resolverEnvio();
    await envioPendente;
  });

  it('nao deixa a rejeicao do envio de e-mail sem tratamento (nao derruba o processo)', async () => {
    const erroEnvio = new Error('Resend fora do ar');
    enviarEmailMock.mockRejectedValue(erroEnvio);
    mockUsuarioExisteEInsertOk();
    const erroConsoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(gerarTokenRecuperacao('lojista@pizzaria.com.br')).resolves.toBeUndefined();

    // A rejeição acontece depois que a função já resolveu (é
    // dispara-e-segue); esperamos os microtasks/macrotasks pendentes
    // para dar tempo do .catch interno rodar e confirmar que foi tratado.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(erroConsoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Erro ao enviar e-mail'),
      erroEnvio,
    );

    erroConsoleSpy.mockRestore();
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

// Constrói um mock de `.from('tokens_recuperacao').update(...).eq(...).is(...).gt(...).select(...)`
// que simula o UPDATE condicional atômico: só "afeta" a linha (devolve
// em `.select()`) se `linhaAtual.usado_em` ainda for nulo e o token não
// estiver expirado — exatamente a condição que o banco real aplicaria
// via `WHERE usado_em IS NULL AND expira_em > agora`. `linhaAtual` é um
// objeto mutável para permitir simular duas chamadas concorrentes lendo
// e escrevendo o "mesmo estado" do banco.
function criarMockDeTokensRecuperacao(linhaAtual: {
  id: string;
  usuario_id: string;
  expira_em: string;
  usado_em: string | null;
} | null) {
  return {
    update: (valores: Record<string, unknown>) => ({
      eq: (coluna: string, valor: string) => {
        expect(coluna).toBe('token_hash');
        return {
          is: (colunaUsado: string, valorUsado: null) => {
            expect(colunaUsado).toBe('usado_em');
            expect(valorUsado).toBeNull();
            return {
              gt: (colunaExpira: string, valorExpira: string) => {
                expect(colunaExpira).toBe('expira_em');
                return {
                  select: (_colunas: string) => {
                    if (
                      !linhaAtual ||
                      linhaAtual.usado_em !== null ||
                      new Date(linhaAtual.expira_em).getTime() <= new Date(valorExpira).getTime()
                    ) {
                      // Condição do WHERE não bateu: nenhuma linha afetada.
                      return Promise.resolve({ data: [], error: null });
                    }
                    // Condição bateu: "grava" o usado_em no estado mockado
                    // e devolve a linha afetada, como o Supabase real faria.
                    linhaAtual.usado_em = valores.usado_em as string;
                    return Promise.resolve({
                      data: [{ id: linhaAtual.id, usuario_id: linhaAtual.usuario_id }],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      },
    }),
  };
}

describe('consumirTokenERedefinir', () => {
  const TOKEN = 'b'.repeat(64);

  it('grava a nova senha com bcrypt e marca o token como usado', async () => {
    let senhaHashGravada: string | undefined;
    const linhaAtual = {
      id: 'token-1',
      usuario_id: 'usuario-1',
      expira_em: new Date(Date.now() + 60_000).toISOString(),
      usado_em: null as string | null,
    };

    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'tokens_recuperacao') return criarMockDeTokensRecuperacao(linhaAtual);
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
    expect(linhaAtual.usado_em).toBeTruthy();
  });

  it('recusa token ja usado e nao altera a senha', async () => {
    const linhaAtual = {
      id: 'token-1',
      usuario_id: 'usuario-1',
      expira_em: new Date(Date.now() + 60_000).toISOString(),
      usado_em: new Date().toISOString(),
    };

    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'tokens_recuperacao') return criarMockDeTokensRecuperacao(linhaAtual);
      throw new Error(`tabela inesperada nesta chamada: ${tabela}`);
    });

    const resultado = await consumirTokenERedefinir(TOKEN, 'novaSenhaForte123');
    expect(resultado).toBe(false);
  });

  it('recusa token expirado e nao altera a senha', async () => {
    const linhaAtual = {
      id: 'token-1',
      usuario_id: 'usuario-1',
      expira_em: new Date(Date.now() - 60_000).toISOString(),
      usado_em: null as string | null,
    };

    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'tokens_recuperacao') return criarMockDeTokensRecuperacao(linhaAtual);
      throw new Error(`tabela inesperada nesta chamada: ${tabela}`);
    });

    const resultado = await consumirTokenERedefinir(TOKEN, 'novaSenhaForte123');
    expect(resultado).toBe(false);
  });

  it('recusa token inexistente', async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'tokens_recuperacao') return criarMockDeTokensRecuperacao(null);
      throw new Error(`tabela inesperada nesta chamada: ${tabela}`);
    });

    const resultado = await consumirTokenERedefinir(TOKEN, 'novaSenhaForte123');
    expect(resultado).toBe(false);
  });

  it('corrida: duas chamadas concorrentes com o mesmo token, apenas uma tem sucesso', async () => {
    // Estado único, compartilhado pelas duas chamadas "concorrentes" —
    // simula a mesma linha no banco sendo disputada por duas requisições.
    const linhaAtual = {
      id: 'token-1',
      usuario_id: 'usuario-1',
      expira_em: new Date(Date.now() + 60_000).toISOString(),
      usado_em: null as string | null,
    };

    fromMock.mockImplementation((tabela: string) => {
      if (tabela === 'tokens_recuperacao') return criarMockDeTokensRecuperacao(linhaAtual);
      if (tabela === 'usuarios') {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });

    const [resultadoAtacante, resultadoVitima] = await Promise.all([
      consumirTokenERedefinir(TOKEN, 'senhaDoAtacante123'),
      consumirTokenERedefinir(TOKEN, 'senhaDaVitima123'),
    ]);

    const sucessos = [resultadoAtacante, resultadoVitima].filter((r) => r === true);
    expect(sucessos).toHaveLength(1);
  });
});

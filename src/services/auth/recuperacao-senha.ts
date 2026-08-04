import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { supabaseAdmin } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import { enviarEmail } from '../email/resend-client.js';
import { templateRecuperacaoSenha } from '../email/templates.js';

// Validade do token de recuperação: 1 hora, contada a partir da geração.
const VALIDADE_MS = 60 * 60 * 1000;

// 32 bytes aleatórios em hexadecimal = 64 caracteres.
const TAMANHO_TOKEN_BYTES = 32;

function gerarTokenAleatorio(): string {
  return crypto.randomBytes(TAMANHO_TOKEN_BYTES).toString('hex');
}

// SHA-256 do token, em hex. É este valor — nunca o token — que vai para
// o banco: mesmo princípio de senha_hash em usuarios. Quem ler a tabela
// tokens_recuperacao não consegue usar os links pendentes.
function hashDoToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

interface LinhaTokenRecuperacao {
  id: string;
  usuario_id: string;
  expira_em: string;
  usado_em: string | null;
}

// Um token só é válido se existir, não estiver expirado e ainda não
// tiver sido usado. Centralizado aqui porque validarToken e
// consumirTokenERedefinir precisam da mesma regra.
function tokenAindaValido(linha: LinhaTokenRecuperacao): boolean {
  if (linha.usado_em) return false;
  return new Date(linha.expira_em).getTime() > Date.now();
}

/**
 * Gera um token de recuperação de senha e envia por e-mail, se o
 * e-mail pertencer a uma conta cadastrada.
 *
 * Não devolve nada nem lança em nenhum caso — nem quando o e-mail não
 * existe, nem quando o envio falha — porque a rota que chama esta
 * função precisa responder sempre a mesma mensagem, exista a conta ou
 * não. Revelar a diferença aqui (lançando, por exemplo) vazaria para a
 * rota justo o que ela existe para esconder.
 */
export async function gerarTokenRecuperacao(email: string): Promise<void> {
  const { data: usuario, error: erroBusca } = await supabaseAdmin
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (erroBusca) {
    console.error('[RecuperacaoSenha] Erro ao buscar usuario por e-mail:', erroBusca);
    return;
  }

  // E-mail não cadastrado: não gera token, não envia nada. A rota
  // responde a mesma mensagem de qualquer forma.
  if (!usuario) return;

  const token = gerarTokenAleatorio();
  const expiraEm = new Date(Date.now() + VALIDADE_MS).toISOString();

  const { error: erroInsercao } = await supabaseAdmin
    .from('tokens_recuperacao')
    .insert([{ usuario_id: usuario.id, token_hash: hashDoToken(token), expira_em: expiraEm }]);

  if (erroInsercao) {
    console.error('[RecuperacaoSenha] Erro ao gravar token de recuperacao:', erroInsercao);
    return;
  }

  const link = `${env.APP_URL}/redefinir-senha?token=${token}`;
  const { subject, html } = templateRecuperacaoSenha(link);

  // Dispara e segue: NÃO aguardamos o envio do e-mail (chamada de rede ao
  // Resend) antes de devolver o controle para a rota. Se esperássemos,
  // o tempo de resposta de "esqueci-senha" ficaria visivelmente maior
  // quando o e-mail existe do que quando não existe — um canal lateral
  // de tempo que permite descobrir quais e-mails são clientes mesmo com
  // a mensagem de resposta idêntica nos dois casos. O `.catch` aqui é
  // obrigatório: sem ele, uma rejeição não capturada de uma Promise solta
  // derruba o processo Node. A falha de envio ainda é registrada no
  // console — ela não pode sumir em silêncio.
  enviarEmail({ to: email, subject, html }).catch((erroEnvio) => {
    console.error('[RecuperacaoSenha] Erro ao enviar e-mail de recuperacao:', erroEnvio);
  });
}

/** Devolve o usuario_id do token, ou null se ele não existe, expirou ou já foi usado. */
export async function validarToken(token: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('tokens_recuperacao')
    .select('usuario_id, expira_em, usado_em')
    .eq('token_hash', hashDoToken(token))
    .maybeSingle();

  if (error || !data) return null;

  const linha = data as Pick<LinhaTokenRecuperacao, 'usuario_id' | 'expira_em' | 'usado_em'>;
  if (!tokenAindaValido({ id: '', ...linha })) return null;

  return linha.usuario_id;
}

/**
 * Redefine a senha associada ao token e marca o token como usado.
 *
 * Devolve `false` sem alterar nada quando o token não existe, expirou
 * ou já foi usado — uso único, senão o link do e-mail vira uma chave
 * permanente enquanto durar a validade de 1 hora.
 *
 * Uso único de verdade exige atomicidade: duas requisições concorrentes
 * com o mesmo token não podem passar ambas. Por isso a marcação de
 * `usado_em` acontece PRIMEIRO, num único UPDATE condicionado a
 * `usado_em IS NULL` e `expira_em` ainda no futuro, e só prosseguimos se
 * esse UPDATE afetou exatamente uma linha (via `.select()` no retorno,
 * que devolve as linhas realmente atualizadas). Se outra requisição já
 * tiver vencido a corrida — ou o token nunca existiu, ou já expirou — o
 * UPDATE não afeta nenhuma linha e recusamos, sem tocar na senha.
 */
export async function consumirTokenERedefinir(token: string, novaSenha: string): Promise<boolean> {
  const agora = new Date().toISOString();

  const { data: linhasMarcadas, error: erroMarcarUsado } = await supabaseAdmin
    .from('tokens_recuperacao')
    .update({ usado_em: agora })
    .eq('token_hash', hashDoToken(token))
    .is('usado_em', null)
    .gt('expira_em', agora)
    .select('id, usuario_id');

  if (erroMarcarUsado) {
    console.error('[RecuperacaoSenha] Erro ao marcar token como usado:', erroMarcarUsado);
    return false;
  }

  // Nenhuma linha afetada: token inexistente, expirado ou já consumido
  // por outra requisição que venceu a corrida. Nada foi alterado.
  if (!linhasMarcadas || linhasMarcadas.length !== 1) return false;

  const linha = linhasMarcadas[0] as Pick<LinhaTokenRecuperacao, 'id' | 'usuario_id'>;

  const senhaHash = await bcrypt.hash(novaSenha, 10);

  const { error: erroSenha } = await supabaseAdmin
    .from('usuarios')
    .update({ senha_hash: senhaHash })
    .eq('id', linha.usuario_id);

  if (erroSenha) {
    // O token já foi marcado como usado (a marcação vem primeiro, de
    // propósito, para garantir o uso único), mas a senha não mudou. Não
    // existe como "devolver" o token — ele fica queimado. Reportamos
    // falha ao chamador (a rota não pode dizer que deu certo) para que
    // o lojista veja o erro e solicite um novo link de recuperação.
    console.error(
      '[RecuperacaoSenha] Token marcado como usado, mas falhou ao gravar a nova senha:',
      erroSenha,
    );
    return false;
  }

  return true;
}

import { supabaseAdmin } from '../../config/supabase.js';
import { encrypt } from '../../utils/crypto.js';

// Enquanto a verificacao de "provedora de tecnologia" da Meta nao sai, a
// conexao e manual: o lojista cola o ID do numero e o token que ele mesmo
// obteve no painel da Meta. Sem fluxo automatico (Embedded Signup/OAuth).
const VERSAO_API_META = 'v21.0';

type ResultadoTeste = { ok: true; numero: string } | { ok: false; erro: string };

interface ErroMeta {
  error?: {
    message?: string;
    code?: number;
  };
}

/**
 * Traduz os erros comuns da Meta Graph API para português, para nunca
 * vazar o texto técnico em inglês da Meta ao lojista.
 */
function traduzirErro(status: number, dados: ErroMeta): string {
  const codigo = dados?.error?.code;

  if (status === 401 || codigo === 190) {
    return 'Token inválido ou expirado. Gere um novo token no painel da Meta e tente novamente.';
  }
  if (status === 404 || codigo === 100) {
    return 'Número não encontrado. Confira se o ID do número está correto.';
  }
  if (status === 403 || codigo === 10) {
    return 'Sem permissão para acessar este número. Confira as permissões do token no painel da Meta.';
  }
  return 'Não foi possível validar a conexão com a Meta. Confira os dados e tente novamente.';
}

/**
 * Testa se o par (ID do número, token) é válido, consultando a Meta
 * Graph API diretamente. Nunca lança: falha de rede também devolve
 * `{ ok: false }` com mensagem em português.
 */
export async function testarConexao(phoneNumberId: string, token: string): Promise<ResultadoTeste> {
  try {
    const resposta = await fetch(`https://graph.facebook.com/${VERSAO_API_META}/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error('[WhatsApp] Erro da Meta ao testar conexão:', dados);
      return { ok: false, erro: traduzirErro(resposta.status, dados) };
    }

    const numero = dados.display_phone_number || dados.verified_name || phoneNumberId;
    return { ok: true, numero };
  } catch (err) {
    console.error('[WhatsApp] Erro de rede ao testar conexão:', err);
    return { ok: false, erro: 'Não foi possível conectar à Meta agora. Tente novamente em instantes.' };
  }
}

/**
 * Grava a conexão do restaurante com o WhatsApp. O token é sempre
 * cifrado com `encrypt` antes de ir para o banco — o webhook decifra na
 * leitura (ver `src/server.ts`).
 */
export async function salvarConexao(restauranteId: string, phoneNumberId: string, token: string): Promise<void> {
  const tokenCifrado = encrypt(token);

  const { error } = await supabaseAdmin
    .from('restaurantes')
    .update({ meta_phone_number_id: phoneNumberId, meta_access_token: tokenCifrado })
    .eq('id', restauranteId);

  if (error) throw error;
}

/**
 * Estado atual da conexão para exibir no painel. Nunca devolve o token,
 * nem cifrado — só se está conectado e qual o número.
 */
export async function estadoDaConexao(restauranteId: string): Promise<{ conectado: boolean; numero: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('restaurantes')
    .select('meta_phone_number_id')
    .eq('id', restauranteId)
    .single();

  if (error) throw error;

  const numero = (data as { meta_phone_number_id: string | null } | null)?.meta_phone_number_id ?? null;
  return { conectado: !!numero, numero };
}

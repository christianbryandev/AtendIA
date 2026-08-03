import { supabaseAdmin } from '../../config/supabase.js';

const TAMANHO_MAXIMO_TRECHO = 80;
const MARCADOR_AUDIO = 'Áudio';

interface LinhaMensagem {
  telefone_cliente: string;
  tipo: string;
  texto: string | null;
  transcricao: string | null;
}

function truncar(texto: string): string {
  const limpo = texto.trim();
  if (limpo.length <= TAMANHO_MAXIMO_TRECHO) return limpo;
  return `${limpo.slice(0, TAMANHO_MAXIMO_TRECHO).trimEnd()}…`;
}

function trechoDaMensagem(m: LinhaMensagem): string {
  if (m.tipo === 'audio') {
    // Sem transcrição (ainda processando, ou falhou), o lojista precisa de
    // algo melhor que uma linha vazia na lista — daí o marcador fixo.
    return m.transcricao ? truncar(m.transcricao) : MARCADOR_AUDIO;
  }
  return m.texto ? truncar(m.texto) : MARCADOR_AUDIO;
}

/**
 * Busca o trecho da última mensagem de cada conversa, para a lista da
 * caixa de entrada mostrar uma prévia sem o lojista precisar abrir cada
 * conversa uma a uma.
 *
 * Uma única consulta para todos os telefones — não uma por conversa —
 * porque a lista pode ter até 50 conversas e não vale a pena pagar 50
 * idas ao banco a cada carregamento da tela. A mensagem mais recente de
 * cada telefone é escolhida em memória, já que a consulta vem ordenada
 * por data decrescente.
 */
export async function buscarTrechosUltimaMensagem(
  restauranteId: string,
  telefones: string[],
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (telefones.length === 0) return resultado;

  const { data, error } = await supabaseAdmin
    .from('mensagens')
    .select('telefone_cliente, tipo, texto, transcricao, created_at')
    .eq('restaurante_id', restauranteId)
    .in('telefone_cliente', telefones)
    .order('created_at', { ascending: false });

  if (error) throw error;

  for (const linha of (data ?? []) as LinhaMensagem[]) {
    if (!resultado.has(linha.telefone_cliente)) {
      resultado.set(linha.telefone_cliente, trechoDaMensagem(linha));
    }
  }

  return resultado;
}

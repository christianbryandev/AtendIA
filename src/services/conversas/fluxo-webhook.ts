import type { Conversa } from './conversa-repo.js';

const OCIOSIDADE_MS = 30 * 60 * 1000;

/**
 * Decide se o controle volta para a IA.
 *
 * Avaliado preguiçosamente, na chegada da próxima mensagem do cliente,
 * em vez de por trabalho agendado. O Render cobra à parte por cron, e um
 * agendador varrendo conversas de minuto em minuto gastaria recurso o
 * tempo todo para agir raramente. O efeito é o mesmo: a única coisa que
 * a devolução precisa destravar é o atendimento da próxima mensagem.
 */
export function deveDevolverControle(
  controleAssumidoEm: string | null,
  ultimaMensagemEm: string | null,
  agora: Date = new Date(),
): boolean {
  if (!controleAssumidoEm) return false;

  // Sem mensagem posterior, o marco é o momento em que o lojista
  // assumiu — senão uma conversa sem resposta ficaria presa para sempre.
  const referencia = ultimaMensagemEm ?? controleAssumidoEm;
  const marco = new Date(referencia);
  if (Number.isNaN(marco.getTime())) return false;

  return agora.getTime() - marco.getTime() >= OCIOSIDADE_MS;
}

export type DecisaoAtendimento =
  | { iaResponde: true; devolverControle: boolean }
  | { iaResponde: false; devolverControle: false };

/**
 * Decide se a IA atende esta mensagem.
 *
 * Separado do webhook de propósito: é a regra que impede a IA de falar
 * por cima do lojista, e precisa ser testável sem subir servidor nem
 * simular a Meta.
 */
export function decidirAtendimento(
  conversa: Conversa | null,
  agora: Date = new Date(),
): DecisaoAtendimento {
  if (!conversa?.sobControleHumano) {
    return { iaResponde: true, devolverControle: false };
  }

  if (deveDevolverControle(conversa.controleAssumidoEm, conversa.ultimaMensagemEm, agora)) {
    return { iaResponde: true, devolverControle: true };
  }

  return { iaResponde: false, devolverControle: false };
}

export interface MensagemDoHistorico {
  id: string;
  autor: string;
  texto: string | null;
  transcricao: string | null;
}

export type MensagemParaIA = { role: 'user' | 'assistant'; content: string };

/**
 * Monta o histórico no formato que a IA espera, a partir das mensagens
 * gravadas no banco.
 *
 * Remove a mensagem atual pelo id porque ela é enviada separadamente como
 * mensagemTexto — sem essa remoção, a IA veria o turno atual do cliente
 * duplicado no histórico. Extraído do webhook (que ficou grande demais)
 * para ser testável sem subir servidor nem simular a Meta, no mesmo
 * espírito de decidirAtendimento.
 */
export function montarHistoricoParaIA(
  historico: MensagemDoHistorico[],
  idMensagemAtual: string,
): MensagemParaIA[] {
  return historico
    .filter((m) => m.id !== idMensagemAtual)
    .map((m) => ({
      role: m.autor === 'cliente' ? ('user' as const) : ('assistant' as const),
      content: m.transcricao ?? m.texto ?? '',
    }))
    .filter((m) => m.content.length > 0);
}

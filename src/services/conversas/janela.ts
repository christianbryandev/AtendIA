/**
 * Janela de atendimento da Meta.
 *
 * A API do WhatsApp só aceita mensagem de texto livre até 24 horas
 * depois da última mensagem DO CLIENTE. Resposta nossa não reabre nada.
 * Passado esse prazo, só template aprovado — e ainda não temos nenhum.
 *
 * Vale igual para a IA e para o lojista. Na prática a IA quase nunca
 * esbarra nisso, porque responde em segundos; quem esbarra é o humano
 * que volta na conversa horas depois.
 */

const JANELA_MS = 24 * 60 * 60 * 1000;

export interface EstadoJanela {
  aberta: boolean;
  expiraEm: Date | null;
  minutosRestantes: number;
}

const FECHADA: EstadoJanela = { aberta: false, expiraEm: null, minutosRestantes: 0 };

export function calcularJanela(
  ultimaMensagemClienteEm: string | null,
  agora: Date = new Date(),
): EstadoJanela {
  if (!ultimaMensagemClienteEm) return FECHADA;

  const inicio = new Date(ultimaMensagemClienteEm);
  if (Number.isNaN(inicio.getTime())) return FECHADA;

  const expiraEm = new Date(inicio.getTime() + JANELA_MS);
  const restanteMs = expiraEm.getTime() - agora.getTime();

  if (restanteMs <= 0) {
    return { aberta: false, expiraEm, minutosRestantes: 0 };
  }

  return {
    aberta: true,
    expiraEm,
    minutosRestantes: Math.floor(restanteMs / 60_000),
  };
}

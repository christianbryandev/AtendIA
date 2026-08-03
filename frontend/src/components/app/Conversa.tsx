export interface MensagemConversa {
  id: string;
  autor: 'cliente' | 'ia' | 'lojista';
  tipo: 'texto' | 'audio';
  texto: string | null;
  transcricao: string | null;
  status: 'ok' | 'enviando' | 'falha';
  erro_envio: string | null;
  created_at: string;
  audioUrlAssinada: string | null;
}

interface ConversaProps {
  mensagens: MensagemConversa[];
}

function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// IA e lojista aparecem do mesmo lado (nós), diferenciados por rótulo e
// cor: quando o lojista volta na conversa depois, ele precisa saber na
// hora o que foi resposta automática e o que foi ele mesmo quem escreveu.
const ESTILO_POR_AUTOR: Record<MensagemConversa['autor'], string> = {
  cliente: 'self-start bg-stone-100 text-ink-800',
  ia: 'self-end bg-brand-50 text-brand-900 border border-brand-200',
  lojista: 'self-end bg-brand-700 text-white',
};

const ROTULO_POR_AUTOR: Record<MensagemConversa['autor'], string> = {
  cliente: 'Cliente',
  ia: 'IA',
  lojista: 'Você',
};

/**
 * Coluna direita da caixa de entrada: histórico da conversa em balões,
 * distinguindo quem falou. Áudio vem com o player nativo e a transcrição
 * logo abaixo; mensagem que falhou ao sair aparece marcada com o motivo.
 */
export default function Conversa({ mensagens }: ConversaProps) {
  if (mensagens.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-ink-600">
        Nenhuma mensagem nesta conversa ainda.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {mensagens.map((mensagem) => (
        <div
          key={mensagem.id}
          className={`flex max-w-[75%] flex-col gap-1 rounded-2xl p-3 text-sm ${ESTILO_POR_AUTOR[mensagem.autor]}`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">
            {ROTULO_POR_AUTOR[mensagem.autor]}
          </span>

          {mensagem.tipo === 'audio' ? (
            <div className="flex flex-col gap-1">
              {mensagem.audioUrlAssinada && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio controls src={mensagem.audioUrlAssinada} className="max-w-full" />
              )}
              {mensagem.transcricao && <p className="text-xs italic opacity-80">"{mensagem.transcricao}"</p>}
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{mensagem.texto}</p>
          )}

          {mensagem.status === 'falha' && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              Falha ao enviar{mensagem.erro_envio ? `: ${mensagem.erro_envio}` : '.'}
            </p>
          )}

          <span className="self-end text-[10px] opacity-60">{formatarHorario(mensagem.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

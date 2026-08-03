export interface ConversaResumo {
  id: string;
  telefoneCliente: string;
  nomeCliente: string | null;
  trechoUltimaMensagem: string | null;
  ultimaMensagemEm: string | null;
  sobControleHumano: boolean;
}

interface ListaConversasProps {
  conversas: ConversaResumo[];
  telefoneSelecionado: string | null;
  onSelecionar: (telefone: string) => void;
}

function formatarHorario(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Coluna esquerda da caixa de entrada: uma conversa por linha, com o nome
 * do cliente (ou o telefone, quando o CRM ainda não tem o nome), um
 * trecho da última mensagem para o lojista saber do que se trata sem
 * abrir a conversa, o horário e uma marca de quem está sob controle
 * humano.
 */
export default function ListaConversas({ conversas, telefoneSelecionado, onSelecionar }: ListaConversasProps) {
  if (conversas.length === 0) {
    return (
      <p className="p-6 text-sm text-ink-600">
        Nenhuma conversa ainda. Assim que um cliente escrever no WhatsApp, ela aparece aqui.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-stone-100">
      {conversas.map((conversa) => {
        const selecionada = conversa.telefoneCliente === telefoneSelecionado;
        return (
          <li key={conversa.id}>
            <button
              type="button"
              onClick={() => onSelecionar(conversa.telefoneCliente)}
              aria-current={selecionada}
              className={`flex w-full flex-col gap-1 p-4 text-left transition-colors ${
                selecionada ? 'bg-brand-50' : 'hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink-800">
                  {conversa.nomeCliente || conversa.telefoneCliente}
                </span>
                <span className="shrink-0 text-xs text-stone-400">
                  {formatarHorario(conversa.ultimaMensagemEm)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-stone-500">
                  {conversa.trechoUltimaMensagem || 'Sem mensagens ainda'}
                </span>
                {conversa.sobControleHumano && (
                  <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-800">
                    Você está atendendo
                  </span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

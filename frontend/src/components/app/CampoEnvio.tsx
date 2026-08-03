import { useState, type FormEvent } from 'react';
import { apiFetch } from '../../services/api';

export interface EstadoJanela {
  aberta: boolean;
  expiraEm: string | null;
  minutosRestantes: number;
}

interface CampoEnvioProps {
  telefone: string;
  janela: EstadoJanela;
  sobControleHumano: boolean;
  onControleAlterado: (humano: boolean) => void;
}

function formatarTempoRestante(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const restoMinutos = minutos % 60;
  if (horas > 0) {
    return restoMinutos > 0 ? `${horas}h ${restoMinutos}min` : `${horas}h`;
  }
  return `${restoMinutos} min`;
}

/**
 * Campo de digitação da caixa de entrada, mais os botões de assumir e
 * devolver a conversa.
 *
 * O campo desabilitado com a janela fechada é conveniência para o lojista
 * entender por quê — a trava de segurança de verdade acontece no backend,
 * em enviarMensagemDoLojista. Uma requisição direta ao endpoint contornaria
 * este componente, mas nunca a checagem do servidor.
 */
export default function CampoEnvio({ telefone, janela, sobControleHumano, onControleAlterado }: CampoEnvioProps) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [alterandoControle, setAlterandoControle] = useState(false);

  const menosDeUmaHora = janela.aberta && janela.minutosRestantes < 60;

  const enviarMensagem = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!texto.trim() || !janela.aberta) return;

    setErro(null);
    setEnviando(true);
    try {
      const resposta = await apiFetch(`/atendimento/conversas/${telefone}/mensagens`, {
        method: 'POST',
        body: JSON.stringify({ texto: texto.trim() }),
      });
      const dados = await resposta.json();
      if (resposta.ok) {
        setTexto('');
      } else {
        setErro(dados.error || 'Não foi possível enviar a mensagem.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const alterarControle = async (humano: boolean) => {
    setErro(null);
    setAlterandoControle(true);
    try {
      const resposta = await apiFetch(`/atendimento/conversas/${telefone}/controle`, {
        method: 'POST',
        body: JSON.stringify({ humano }),
      });
      const dados = await resposta.json();
      if (resposta.ok) {
        onControleAlterado(humano);
      } else {
        setErro(dados.error || 'Não foi possível atualizar o controle da conversa.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setAlterandoControle(false);
    }
  };

  return (
    <div className="border-t border-stone-200 bg-white p-4">
      {erro && (
        <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      {janela.aberta ? (
        menosDeUmaHora ? (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Atenção: restam menos de 1 hora para responder livremente esta conversa. Depois disso só será possível
            retomar com um modelo de mensagem aprovado pela Meta.
          </div>
        ) : (
          <p className="mb-3 text-xs text-stone-500">
            Você pode responder livremente por mais {formatarTempoRestante(janela.minutosRestantes)}.
          </p>
        )
      ) : (
        <div role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          A janela de 24 horas para responder livremente já fechou. A Meta só permite retomar esta conversa com um
          modelo de mensagem aprovado — e o projeto ainda não tem nenhum. Aguarde o cliente escrever de novo para a
          janela reabrir.
        </div>
      )}

      <div className="mb-3 flex gap-3">
        <button
          type="button"
          onClick={() => alterarControle(true)}
          disabled={alterandoControle || sobControleHumano}
          className="rounded-lg border border-stone-300 p-2 px-3 text-xs font-bold text-ink-800 transition-colors hover:bg-stone-50 disabled:opacity-50"
        >
          Assumir conversa
        </button>
        <button
          type="button"
          onClick={() => alterarControle(false)}
          disabled={alterandoControle || !sobControleHumano}
          className="rounded-lg border border-stone-300 p-2 px-3 text-xs font-bold text-ink-800 transition-colors hover:bg-stone-50 disabled:opacity-50"
        >
          Devolver para a IA
        </button>
      </div>

      <form onSubmit={enviarMensagem} className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="mensagem-lojista" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-400">
            Mensagem
          </label>
          <input
            id="mensagem-lojista"
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={!janela.aberta || enviando}
            className="w-full rounded-lg border border-stone-300 p-2.5 text-sm text-ink-800 disabled:bg-stone-100"
            placeholder={janela.aberta ? 'Escreva sua mensagem...' : 'Indisponível: janela de 24h fechada'}
          />
        </div>
        <button
          type="submit"
          disabled={!janela.aberta || enviando}
          className="rounded-lg bg-brand-700 p-2.5 px-4 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70"
        >
          {enviando ? 'Enviando...' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}

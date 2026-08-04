import { useEffect, useRef, useState } from 'react';
import Container from '../../components/ui/Container';
import ListaConversas, { type ConversaResumo as ConversaResumoBase } from '../../components/app/ListaConversas';
import Conversa, { type MensagemConversa } from '../../components/app/Conversa';
import CampoEnvio, { type EstadoJanela } from '../../components/app/CampoEnvio';
import { apiFetch } from '../../services/api';
import { criarClienteSupabase } from '../../services/supabase';

interface ConversaResumo extends ConversaResumoBase {
  janela: EstadoJanela;
}

/**
 * Caixa de entrada: junta a lista de conversas (esquerda) com o histórico
 * e o campo de resposta da conversa selecionada (direita).
 *
 * Assina o Realtime para inserir mensagens novas assim que chegam — o
 * lojista vê a mensagem do cliente ou a resposta da IA sem precisar
 * recarregar a tela. A assinatura é cancelada ao desmontar: sem isso,
 * cada visita à tela deixaria uma conexão aberta com o Supabase.
 */
export default function Atendimento() {
  const [conversas, setConversas] = useState<ConversaResumo[]>([]);
  const [telefoneSelecionado, setTelefoneSelecionado] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemConversa[]>([]);
  const [carregandoConversas, setCarregandoConversas] = useState(true);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O callback do Realtime é registrado uma única vez (efeito com deps
  // vazias), mas precisa saber qual é a conversa aberta NO MOMENTO em que
  // a mensagem chega — daí o ref em vez de ler o state diretamente, que
  // ficaria preso ao valor da primeira renderização.
  const telefoneSelecionadoRef = useRef<string | null>(null);
  useEffect(() => {
    telefoneSelecionadoRef.current = telefoneSelecionado;
  }, [telefoneSelecionado]);

  const carregarConversas = async () => {
    setCarregandoConversas(true);
    setErro(null);
    try {
      const resposta = await apiFetch('/atendimento/conversas');
      const dados = await resposta.json();
      if (resposta.ok) {
        setConversas(dados.conversas ?? []);
      } else {
        setErro(dados.error || 'Não foi possível carregar as conversas.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setCarregandoConversas(false);
    }
  };

  const carregarMensagens = async (telefone: string) => {
    setCarregandoMensagens(true);
    setErro(null);
    try {
      const resposta = await apiFetch(`/atendimento/conversas/${telefone}/mensagens`);
      const dados = await resposta.json();
      if (resposta.ok) {
        setMensagens(dados.mensagens ?? []);
      } else {
        setErro(dados.error || 'Não foi possível carregar o histórico da conversa.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setCarregandoMensagens(false);
    }
  };

  useEffect(() => {
    void carregarConversas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (telefoneSelecionado) {
      void carregarMensagens(telefoneSelecionado);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telefoneSelecionado]);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    let cliente: ReturnType<typeof criarClienteSupabase>;
    try {
      cliente = criarClienteSupabase(token);
    } catch (erroConfiguracao) {
      // Sem as variáveis VITE_SUPABASE_*, a tela continua funcionando por
      // API normal — só perde a atualização em tempo real.
      console.error('[Atendimento] Realtime indisponível:', erroConfiguracao);
      return;
    }

    const canal = cliente
      .channel('atendimento-mensagens')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens' },
        (payload: { new: Record<string, unknown> }) => {
          const nova = payload.new as unknown as MensagemConversa & { telefone_cliente: string };
          if (nova.telefone_cliente === telefoneSelecionadoRef.current) {
            setMensagens((atual) => [...atual, nova]);
          }
        },
      )
      .subscribe();

    return () => {
      cliente.removeChannel(canal);
    };
  }, []);

  const conversaAtual = conversas.find((c) => c.telefoneCliente === telefoneSelecionado) ?? null;

  const atualizarControle = (humano: boolean) => {
    setConversas((atual) =>
      atual.map((c) => (c.telefoneCliente === telefoneSelecionado ? { ...c, sobControleHumano: humano } : c)),
    );
  };

  return (
    <Container className="py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink-800">Caixa de entrada</h1>
      <p className="mt-3 text-ink-600">
        Acompanhe o atendimento da IA no WhatsApp e assuma a conversa na mão quando precisar.
      </p>

      {erro && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      {carregandoConversas && <p className="mt-8 text-sm text-ink-600">Carregando conversas…</p>}

      {!carregandoConversas && (
        <div className="mt-8 grid grid-cols-1 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:grid-cols-[320px_1fr]">
          <div className="max-h-[70vh] overflow-y-auto border-b border-stone-200 md:border-b-0 md:border-r md:border-stone-200">
            <ListaConversas
              conversas={conversas}
              telefoneSelecionado={telefoneSelecionado}
              onSelecionar={setTelefoneSelecionado}
            />
          </div>

          <div className="flex max-h-[70vh] flex-col">
            {conversaAtual ? (
              <>
                {carregandoMensagens ? (
                  <p className="flex-1 p-6 text-sm text-ink-600">Carregando mensagens…</p>
                ) : (
                  <Conversa mensagens={mensagens} />
                )}
                <CampoEnvio
                  telefone={conversaAtual.telefoneCliente}
                  janela={conversaAtual.janela}
                  sobControleHumano={conversaAtual.sobControleHumano}
                  onControleAlterado={atualizarControle}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-ink-600">
                Selecione uma conversa para ver as mensagens.
              </div>
            )}
          </div>
        </div>
      )}
    </Container>
  );
}

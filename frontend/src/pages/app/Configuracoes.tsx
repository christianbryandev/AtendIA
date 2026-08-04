import { useEffect, useState, type FormEvent } from 'react';
import Container from '../../components/ui/Container';
import { apiFetch } from '../../services/api';

interface EstadoConexao {
  conectado: boolean;
  numero: string | null;
}

interface Categoria {
  id: string;
  produtos: { id: string }[];
}

export default function Configuracoes() {
  const [estado, setEstado] = useState<EstadoConexao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [cardapioVazio, setCardapioVazio] = useState(false);

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [token, setToken] = useState('');

  const [erro, setErro] = useState<string | null>(null);
  const [mensagemTeste, setMensagemTeste] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregarEstado = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [respostaConexao, respostaCardapio] = await Promise.all([
        apiFetch('/whatsapp/conexao'),
        apiFetch('/cardapio'),
      ]);
      const dadosConexao = await respostaConexao.json();
      const dadosCardapio = await respostaCardapio.json();

      if (respostaConexao.ok) {
        setEstado(dadosConexao);
      } else {
        setErro(dadosConexao.error || 'Não foi possível carregar o estado da conexão.');
      }

      if (respostaCardapio.ok) {
        const categorias = (dadosCardapio.categorias ?? []) as Categoria[];
        setCardapioVazio(categorias.every((categoria) => categoria.produtos.length === 0));
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregarEstado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testarConexao = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setMensagemTeste(null);

    if (!phoneNumberId.trim() || !token.trim()) {
      setErro('Informe o ID do número e o token.');
      return;
    }

    setTestando(true);
    try {
      const resposta = await apiFetch('/whatsapp/conexao/testar', {
        method: 'POST',
        body: JSON.stringify({ phoneNumberId: phoneNumberId.trim(), token: token.trim() }),
      });
      const dados = await resposta.json();

      if (resposta.ok && dados.ok) {
        setMensagemTeste({ tipo: 'sucesso', texto: `Conexão válida para o número ${dados.numero}.` });
      } else {
        setMensagemTeste({ tipo: 'erro', texto: dados.erro || dados.error || 'Não foi possível testar a conexão.' });
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setTestando(false);
    }
  };

  const salvarConexao = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setMensagemTeste(null);

    if (!phoneNumberId.trim() || !token.trim()) {
      setErro('Informe o ID do número e o token.');
      return;
    }

    setSalvando(true);
    try {
      const resposta = await apiFetch('/whatsapp/conexao', {
        method: 'POST',
        body: JSON.stringify({ phoneNumberId: phoneNumberId.trim(), token: token.trim() }),
      });
      const dados = await resposta.json();

      if (resposta.ok) {
        setToken('');
        await carregarEstado();
      } else {
        setErro(dados.error || 'Não foi possível salvar a conexão.');
      }
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Container className="py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink-800">Configurações</h1>
      <p className="mt-3 text-ink-600">
        Conecte o WhatsApp do seu restaurante para a IA começar a atender seus clientes.
      </p>

      {erro && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      {carregando && <p className="mt-8 text-sm text-ink-600">Carregando...</p>}

      {!carregando && (
        <div className="mt-8 max-w-lg space-y-6">
          {cardapioVazio && (
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Seu cardápio ainda está vazio. Se conectar o WhatsApp agora, a IA vai atender seus clientes sem saber o
              que vender. Cadastre ao menos uma categoria e um produto na tela de Cardápio antes de divulgar o
              número.
            </div>
          )}

          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-ink-800">Conexão com o WhatsApp</h2>

            <p className="mt-2 text-sm text-ink-600">
              {estado?.conectado ? (
                estado.numero ? (
                  <>
                    Conectado ao número <strong className="text-ink-800">{estado.numero}</strong>.
                  </>
                ) : (
                  // Conexão salva antes da migration do telefone legível (ou cujo
                  // último salvamento não conseguiu falar com a Meta): não
                  // mostramos o ID técnico nem uma string vazia, só pedimos para
                  // salvar de novo, o que atualiza o telefone exibido.
                  'Conectado, mas ainda não temos o telefone para exibir. Salve a conexão novamente para atualizar.'
                )
              ) : (
                'Nenhum número conectado ainda.'
              )}
            </p>

            <p className="mt-3 text-xs leading-relaxed text-stone-500">
              Cole o ID do número de telefone e o token de acesso que você mesmo gerou no painel de desenvolvedores
              da Meta. A conexão automática ainda não está disponível — assim que a verificação da Meta for
              concluída, essa etapa deixa de ser manual.
            </p>

            <form className="mt-5 space-y-4" onSubmit={salvarConexao}>
              <div>
                <label htmlFor="phone-number-id" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-400">
                  ID do número de telefone
                </label>
                <input
                  id="phone-number-id"
                  type="text"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 p-2.5 text-sm text-ink-800"
                  placeholder="Ex.: 123456789012345"
                />
              </div>
              <div>
                <label htmlFor="token-acesso" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-400">
                  Token de acesso
                </label>
                <input
                  id="token-acesso"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 p-2.5 text-sm text-ink-800"
                  placeholder="Cole aqui o token gerado no painel da Meta"
                />
              </div>

              {mensagemTeste && (
                <div
                  role={mensagemTeste.tipo === 'erro' ? 'alert' : 'status'}
                  className={`rounded-lg border p-3 text-sm ${
                    mensagemTeste.tipo === 'sucesso'
                      ? 'border-brand-500/30 bg-brand-50 text-brand-900'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {mensagemTeste.texto}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={testarConexao}
                  disabled={testando}
                  className="rounded-lg border border-stone-300 p-2.5 px-4 text-sm font-bold text-ink-800 transition-colors hover:bg-stone-50 disabled:opacity-70"
                >
                  {testando ? 'Testando...' : 'Testar conexão'}
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="rounded-lg bg-brand-700 p-2.5 px-4 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70"
                >
                  {salvando ? 'Salvando...' : 'Salvar conexão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Container>
  );
}

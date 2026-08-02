import { useEffect, useState } from 'react';
import Container from '../../components/ui/Container';
import { apiFetch } from '../../services/api';
import { useAssinatura } from '../../contexts/AssinaturaContext';

const PACOTES = [
  { id: 'creditos_2500', rotulo: '2.500 créditos', preco: 'R$ 59,90' },
  { id: 'creditos_5000', rotulo: '5.000 créditos', preco: 'R$ 109,90' },
  { id: 'creditos_10000', rotulo: '10.000 créditos', preco: 'R$ 199,90' },
];

interface Lancamento {
  tipo_evento: string;
  creditos_consumidos: number;
  motivo_reembolso: string | null;
  origem: string | null;
  created_at: string;
}

export default function Creditos() {
  const { creditosCota, creditosAvulsos, recarregar } = useAssinatura();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [comprando, setComprando] = useState<string | null>(null);

  useEffect(() => {
    // Voltar do Stripe com ?compra=ok significa que o webhook pode já ter
    // creditado: recarregar para o saldo na tela não ficar velho.
    if (new URLSearchParams(window.location.search).get('compra') === 'ok') {
      void recarregar();
    }

    void (async () => {
      try {
        const resposta = await apiFetch('/billing/extrato');
        const dados = await resposta.json();
        if (dados.success) setLancamentos(dados.lancamentos);
      } catch {
        // Extrato é secundário: falhar aqui não pode esconder os pacotes.
      }
    })();
  }, [recarregar]);

  const comprar = async (pacoteId: string) => {
    setErro(null);
    setComprando(pacoteId);

    try {
      const resposta = await apiFetch('/billing/pacote', {
        method: 'POST',
        body: JSON.stringify({ pacoteId }),
      });
      const dados = await resposta.json();

      if (dados.success && dados.url) {
        window.location.href = dados.url;
        return;
      }

      setErro(dados.error || 'Não foi possível abrir a compra.');
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setComprando(null);
    }
  };

  // A faixa de cota é montada uma vez só, em PainelLayout, para valer
  // em todas as telas do painel.
  return (
    <Container className="py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink-800">Créditos</h1>
      <p className="mt-3 text-ink-600">
        Cota deste mês: <strong>{creditosCota.toLocaleString('pt-BR')}</strong> ·
        Avulsos: <strong>{creditosAvulsos.toLocaleString('pt-BR')}</strong>
      </p>
      <p className="mt-1 text-sm text-stone-500">
        A cota reseta todo mês. Créditos avulsos não expiram e só são usados
        depois que a cota acaba.
      </p>

      {erro && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {PACOTES.map((pacote) => (
          <div key={pacote.id} className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
            <p className="font-semibold text-ink-800">{pacote.rotulo}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink-800">{pacote.preco}</p>
            <button onClick={() => comprar(pacote.id)} disabled={comprando !== null}
              className="mt-5 w-full rounded-lg bg-brand-700 p-3 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
              {comprando === pacote.id ? 'Abrindo...' : 'Comprar'}
            </button>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-xs font-bold uppercase tracking-wider text-stone-400">
        Últimos lançamentos
      </h2>

      {lancamentos.length === 0 ? (
        <p className="mt-4 text-sm text-ink-600">Nenhum consumo registrado ainda.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-stone-400">
              <tr>
                <th scope="col" className="py-2">Quando</th>
                <th scope="col" className="py-2">Tipo</th>
                <th scope="col" className="py-2">Origem</th>
                <th scope="col" className="py-2 text-right">Créditos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {lancamentos.map((l, i) => (
                <tr key={`${l.created_at}-${i}`}>
                  <td className="py-2.5 text-ink-600">
                    {new Date(l.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2.5 text-ink-800">
                    {l.motivo_reembolso ? 'Estorno' : l.tipo_evento}
                  </td>
                  <td className="py-2.5 text-ink-600">{l.origem ?? '—'}</td>
                  <td className={`py-2.5 text-right font-semibold ${l.creditos_consumidos < 0 ? 'text-brand-700' : 'text-ink-800'}`}>
                    {l.creditos_consumidos < 0 ? '+' : '−'}
                    {Math.abs(l.creditos_consumidos).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}

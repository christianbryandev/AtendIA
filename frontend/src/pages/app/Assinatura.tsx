import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../../components/ui/Container';
import { apiFetch } from '../../services/api';
import { useAssinatura } from '../../contexts/AssinaturaContext';

const ROTULO_STATUS: Record<string, string> = {
  ativa: 'Ativa',
  inadimplente: 'Pagamento pendente',
  pendente: 'Aguardando pagamento',
  cancelada: 'Cancelada',
  reembolsada: 'Reembolsada',
};

export default function Assinatura() {
  const { status, periodoFim, creditosCota, creditosAvulsos, cotaTotal } = useAssinatura();
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  const abrirPortal = async () => {
    setErro(null);
    setAbrindo(true);

    try {
      const resposta = await apiFetch('/billing/portal', { method: 'POST' });
      const dados = await resposta.json();

      if (dados.success && dados.url) {
        window.location.href = dados.url;
        return;
      }

      setErro(dados.error || 'Não foi possível abrir o gerenciamento.');
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setAbrindo(false);
    }
  };

  // A faixa de cota é montada uma vez só, em PainelLayout, para valer
  // em todas as telas do painel.
  return (
    <Container className="py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink-800">Sua assinatura</h1>

      {status === 'inadimplente' && (
        <div role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          O último pagamento não foi aprovado. Atualize o cartão no
          gerenciamento — seu atendimento continua no ar enquanto isso.
        </div>
      )}

      <div className="mt-6 max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
        <dl className="space-y-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-600">Situação</dt>
            <dd className="font-semibold text-ink-800">{ROTULO_STATUS[status ?? 'pendente']}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-600">Plano</dt>
            <dd className="font-semibold text-ink-800">R$ 179,99 /mês</dd>
          </div>
          {periodoFim && (
            <div className="flex justify-between">
              <dt className="text-ink-600">Próxima cobrança</dt>
              <dd className="font-semibold text-ink-800">
                {new Date(periodoFim).toLocaleDateString('pt-BR')}
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t border-stone-100 pt-4">
            <dt className="text-ink-600">Cota deste mês</dt>
            <dd className="font-semibold text-ink-800">
              {creditosCota.toLocaleString('pt-BR')} de {cotaTotal.toLocaleString('pt-BR')}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-600">Créditos avulsos</dt>
            <dd className="font-semibold text-ink-800">{creditosAvulsos.toLocaleString('pt-BR')}</dd>
          </div>
        </dl>

        {erro && (
          <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <button onClick={abrirPortal} disabled={abrindo}
            className="w-full rounded-lg bg-brand-700 p-3 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
            {abrindo ? 'Abrindo...' : 'Gerenciar assinatura'}
          </button>
          <Link to="/app/creditos"
            className="block w-full rounded-lg border border-stone-300 p-3 text-center text-sm font-bold text-ink-800 transition-colors hover:bg-stone-50">
            Comprar créditos
          </Link>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-stone-500">
          No gerenciamento você cancela a assinatura, troca o cartão e baixa
          suas faturas. É o ambiente seguro do Stripe.
        </p>
      </div>
    </Container>
  );
}

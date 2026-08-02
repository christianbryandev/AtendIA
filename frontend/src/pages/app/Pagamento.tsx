import { useState } from 'react';
import Container from '../../components/ui/Container';
import { apiFetch } from '../../services/api';

export default function Pagamento() {
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  const irParaCheckout = async () => {
    setErro(null);
    setIndo(true);

    try {
      const resposta = await apiFetch('/billing/checkout', { method: 'POST' });
      const dados = await resposta.json();

      if (dados.success && dados.url) {
        window.location.href = dados.url;
        return;
      }

      setErro(dados.error || 'Não foi possível abrir o pagamento.');
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setIndo(false);
    }
  };

  return (
    <Container className="py-20">
      <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-ink-800">
          Falta só o pagamento
        </h1>
        <p className="mt-3 text-ink-600">
          Sua conta já está criada. Assine para liberar o painel.
        </p>

        <p className="mt-6 text-4xl font-bold tracking-tight text-ink-800">
          R$ 179,99<span className="text-base font-medium text-ink-600"> /mês</span>
        </p>

        <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4 text-left text-sm">
          <p className="font-semibold text-brand-700">✓ Teste sem risco por 7 dias</p>
          <p className="mt-1 text-ink-600">
            A cobrança acontece na contratação; se pedir reembolso em até 7 dias,
            devolvemos 100% do valor.
          </p>
        </div>

        {erro && (
          <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        <button onClick={irParaCheckout} disabled={indo}
          className="mt-6 w-full rounded-lg bg-brand-700 p-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
          {indo ? 'Abrindo pagamento...' : 'Ir para o pagamento'}
        </button>

        <p className="mt-4 text-xs text-stone-500">
          O pagamento acontece no ambiente seguro do Stripe.
        </p>
      </div>
    </Container>
  );
}

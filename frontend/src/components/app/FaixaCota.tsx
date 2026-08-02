import { Link } from 'react-router-dom';
import { useAssinatura } from '../../contexts/AssinaturaContext';

const LIMIAR_AVISO = 0.8;

export default function FaixaCota() {
  const { creditosCota, creditosAvulsos, cotaTotal, carregando } = useAssinatura();

  if (carregando || cotaTotal <= 0) return null;

  const consumido = (cotaTotal - creditosCota) / cotaTotal;
  const cotaZerada = creditosCota <= 0;
  const semNadaSobrando = cotaZerada && creditosAvulsos <= 0;

  if (!semNadaSobrando && consumido < LIMIAR_AVISO) return null;

  if (semNadaSobrando) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
        <span>
          <strong>Seus créditos acabaram.</strong> A IA deixou de responder no
          WhatsApp até você recarregar.
        </span>
        <Link to="/app/creditos" className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white">
          Comprar créditos
        </Link>
      </div>
    );
  }

  const mensagem = cotaZerada
    ? `Sua cota mensal acabou. O atendimento segue com ${creditosAvulsos.toLocaleString('pt-BR')} de crédito avulso.`
    : `Você já usou ${Math.round(consumido * 100)}% da sua cota deste mês.`;

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
      <span>{mensagem}</span>
      <Link to="/app/creditos" className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white">
        Comprar créditos
      </Link>
    </div>
  );
}

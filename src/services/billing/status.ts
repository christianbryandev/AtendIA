import { getStripe } from './stripe-client.js';
import { atualizarStatus, buscarAssinatura } from './assinatura-repo.js';

const MINUTOS_ATE_RECONCILIAR = 5;

/**
 * Rede de segurança para webhook perdido: se a conta está pendente há
 * mais que alguns minutos, pergunta ao Stripe e se corrige. É a
 * reconciliação sob demanda, sem cron.
 */
export async function reconciliarSePreciso(
  restauranteId: string,
  criadaEm: string,
  status: string,
): Promise<string> {
  if (status !== 'pendente') return status;

  const minutosDesde = (Date.now() - new Date(criadaEm).getTime()) / 60_000;
  if (minutosDesde < MINUTOS_ATE_RECONCILIAR) return status;

  const assinatura = await buscarAssinatura(restauranteId);
  if (!assinatura?.stripeCustomerId) return status;

  try {
    const { data } = await getStripe().subscriptions.list({
      customer: assinatura.stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    const subscription = data[0];
    if (!subscription) return status;

    const periodoFim = typeof (subscription as any).current_period_end === 'number'
      ? new Date((subscription as any).current_period_end * 1000).toISOString()
      : null;

    await atualizarStatus(restauranteId, {
      status: 'ativa',
      stripeSubscriptionId: subscription.id,
      periodoFim,
    });

    return 'ativa';
  } catch (erro) {
    // Stripe indisponível não pode virar erro na tela do lojista.
    console.error('[Billing] Falha ao reconciliar com o Stripe:', erro);
    return status;
  }
}

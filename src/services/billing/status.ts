import { getStripe } from './stripe-client.js';
import { atualizarStatus, buscarAssinatura } from './assinatura-repo.js';

const MINUTOS_ATE_RECONCILIAR = 5;

// A tela de confirmação de pagamento do frontend faz polling de
// GET /api/billing/status a cada poucos segundos enquanto a assinatura
// está pendente, e o lojista pode deixar a aba aberta. Sem um teto, isso
// vira uma rajada de chamadas `subscriptions.list` ao Stripe sem limite,
// com risco de rate limit e custo. Este mapa em memória garante no máximo
// uma consulta ao Stripe por restaurante a cada 60s; nas requisições
// dentro dessa janela devolvemos o status que já está no banco. O
// backend roda como um processo só, então perder esse estado num
// restart é inofensivo.
const JANELA_ENTRE_CONSULTAS_MS = 60_000;
const ultimaConsultaStripePorRestaurante = new Map<string, number>();

// Evita que o mapa cresça sem limite: qualquer entrada mais velha que a
// janela já não bloqueia mais ninguém, então não serve pra nada.
function limparEntradasVelhas(agora: number): void {
  for (const [restauranteId, timestamp] of ultimaConsultaStripePorRestaurante) {
    if (agora - timestamp >= JANELA_ENTRE_CONSULTAS_MS) {
      ultimaConsultaStripePorRestaurante.delete(restauranteId);
    }
  }
}

// Exportado só para os testes resetarem o estado do módulo entre casos.
export function _resetLimiteDeConsultaStripeParaTeste(): void {
  ultimaConsultaStripePorRestaurante.clear();
}

function podeConsultarStripe(restauranteId: string): boolean {
  const agora = Date.now();
  limparEntradasVelhas(agora);

  const ultima = ultimaConsultaStripePorRestaurante.get(restauranteId);
  if (ultima !== undefined && agora - ultima < JANELA_ENTRE_CONSULTAS_MS) {
    return false;
  }

  ultimaConsultaStripePorRestaurante.set(restauranteId, agora);
  return true;
}

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

  if (!podeConsultarStripe(restauranteId)) return status;

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

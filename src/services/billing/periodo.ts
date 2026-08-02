import type Stripe from 'stripe';

/**
 * Data em que o ciclo atual da assinatura termina — é o que a tela
 * "Sua assinatura" mostra como "Próxima cobrança".
 *
 * O campo NÃO fica em `subscription.current_period_end`. Na versão de
 * API que o SDK instalado usa (stripe@22.4.0, apiVersion
 * 2026-07-29.dahlia) ele migrou para dentro de cada item da assinatura,
 * em `items.data[].current_period_end`, porque itens diferentes podem
 * ter ciclos diferentes. Ler do lugar antigo devolve `undefined`, e um
 * cast para `any` esconderia isso — foi exatamente assim que periodo_fim
 * passou a ser gravado como null sempre.
 *
 * Nosso plano tem um item só, então o primeiro item é o ciclo da
 * assinatura inteira.
 */
export function periodoFimDaSubscription(subscription: Stripe.Subscription): string | null {
  const fim = subscription.items?.data?.[0]?.current_period_end;

  return typeof fim === 'number' ? new Date(fim * 1000).toISOString() : null;
}

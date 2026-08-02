import type Stripe from 'stripe';
import { supabaseAdmin } from '../../config/supabase.js';
import { atualizarStatus, buscarAssinatura, buscarPorCustomerId } from './assinatura-repo.js';
import { pacotePorId } from './pacotes.js';
import { getStripe } from './stripe-client.js';

export const CREDITOS_DA_COTA = 10000;

/**
 * Grava o evento e diz se ele é novo. O Stripe reenvia quando não
 * recebe 200; sem esta trava, um reenvio credita a cota duas vezes.
 *
 * Só vale como "processado com sucesso" — ver removerRegistroEvento.
 */
export async function registrarEventoSeNovo(eventId: string, tipo: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('stripe_eventos_processados')
    .insert([{ event_id: eventId, tipo }]);

  // Violação de chave primária significa evento repetido.
  return !error;
}

/**
 * Correção 2 do spec: o registro em stripe_eventos_processados é
 * gravado ANTES de processar o evento (para travar concorrência entre
 * reenvios simultâneos do mesmo evento). Se o processamento em segundo
 * plano falhar depois disso, o registro precisa ser desfeito — senão o
 * evento fica marcado como "processado" para sempre, o Stripe reenvia
 * e o handler ignora como duplicata, e o lojista fica com o pagamento
 * feito e sem o crédito correspondente, em silêncio.
 *
 * A remoção é best-effort: se ela mesma falhar, só logamos. Não há
 * nada melhor a fazer aqui — o processamento já falhou e propagou o
 * erro para quem chamou; forçar essa segunda falha a subir não muda o
 * resultado, só perderia o registro do motivo original.
 */
export async function removerRegistroEvento(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('stripe_eventos_processados')
    .delete()
    .eq('event_id', eventId);

  if (error) {
    console.error(
      `[Stripe] Falha ao remover o registro de idempotencia do evento ${eventId} apos erro de processamento. ` +
      `Um reenvio do Stripe sera tratado como duplicata e NAO sera retentado:`,
      error,
    );
  }
}

async function restauranteDoEvento(objeto: any): Promise<string | null> {
  const direto = objeto?.metadata?.restaurante_id || objeto?.client_reference_id;
  if (direto) return direto;

  const customerId = typeof objeto?.customer === 'string' ? objeto.customer : objeto?.customer?.id;
  if (!customerId) return null;

  const assinatura = await buscarPorCustomerId(customerId);
  return assinatura?.restauranteId ?? null;
}

function paraIso(epochSegundos: unknown): string | undefined {
  return typeof epochSegundos === 'number'
    ? new Date(epochSegundos * 1000).toISOString()
    : undefined;
}

/**
 * Correção 1 do spec: supabase-js não lança em erro de RPC, devolve
 * { data, error }. As RPCs de crédito fazem RAISE EXCEPTION quando o
 * restaurante não existe, justamente para falhar ruidosamente — mas
 * isso só funciona se o chamador olhar o `error` e propagar. Sem este
 * wrapper, a exceção do banco seria engolida, o evento marcado como
 * processado e o Stripe nunca retentaria: dinheiro entrando sem
 * crédito ser dado, em silêncio.
 */
async function chamarRpc(nome: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.rpc(nome, args);

  if (error) {
    throw new Error(`[Stripe] RPC ${nome} falhou para ${JSON.stringify(args)}: ${error.message}`);
  }
}

export async function processarEvento(evento: Stripe.Event): Promise<void> {
  const objeto = evento.data.object as any;
  const restauranteId = await restauranteDoEvento(objeto);

  if (!restauranteId) {
    console.error(`[Stripe] Evento ${evento.id} (${evento.type}) sem restaurante identificável.`);
    return;
  }

  switch (evento.type) {
    case 'checkout.session.completed': {
      if (objeto.mode === 'payment') {
        const pacote = pacotePorId(objeto.metadata?.pacote_id);

        if (!pacote) {
          console.error(`[Stripe] Compra ${evento.id} sem pacote reconhecível.`);
          return;
        }

        await chamarRpc('creditar_pacote_avulso', {
          p_restaurante_id: restauranteId,
          p_qtd: pacote.creditos,
        });
        return;
      }

      await atualizarStatus(restauranteId, {
        status: 'ativa',
        stripeSubscriptionId: typeof objeto.subscription === 'string' ? objeto.subscription : null,
      });

      await chamarRpc('resetar_cota_mensal', {
        p_restaurante_id: restauranteId,
        p_qtd: CREDITOS_DA_COTA,
      });
      return;
    }

    case 'invoice.paid': {
      // A primeira fatura já foi creditada pelo checkout.session.completed.
      // O billing_reason vem do próprio Stripe — não inferir por data.
      if (objeto.billing_reason === 'subscription_create') return;

      await atualizarStatus(restauranteId, {
        status: 'ativa',
        periodoFim: paraIso(objeto.period_end) ?? null,
      });

      await chamarRpc('resetar_cota_mensal', {
        p_restaurante_id: restauranteId,
        p_qtd: CREDITOS_DA_COTA,
      });
      return;
    }

    case 'invoice.payment_failed': {
      // Não zera crédito: o Stripe ainda vai tentar cobrar de novo, e
      // derrubar o atendimento por um cartão recusado perde cliente.
      await atualizarStatus(restauranteId, { status: 'inadimplente' });
      return;
    }

    case 'customer.subscription.deleted': {
      await atualizarStatus(restauranteId, {
        status: 'cancelada',
        canceladaEm: new Date().toISOString(),
      });

      // Zera só a cota. Avulso foi pago à parte e continua valendo.
      await chamarRpc('resetar_cota_mensal', { p_restaurante_id: restauranteId, p_qtd: 0 });
      return;
    }

    case 'charge.refunded': {
      // O evento charge.refunded dispara para QUALQUER reembolso da
      // cobrança, inclusive um reembolso parcial (ex.: cortesia de
      // R$ 50 por um problema pontual). Só um reembolso TOTAL significa
      // "cliente saiu" — comparar amount_refunded com amount é a única
      // forma de diferenciar os dois casos. Se isso for removido, um
      // gesto de boa vontade parcial derruba o atendimento inteiro do
      // restaurante.
      const reembolsoTotal = (objeto.amount_refunded ?? 0) >= (objeto.amount ?? 0);

      if (!reembolsoTotal) {
        console.log(
          `[Stripe] Reembolso parcial no evento ${evento.id} para o restaurante ${restauranteId} ` +
          `(amount_refunded=${objeto.amount_refunded}, amount=${objeto.amount}): status e cota nao alterados.`,
        );
        return;
      }

      // Reembolsar no Stripe NÃO cancela a assinatura: o objeto
      // subscription continua vivo e cobra de novo no mês seguinte. Sem
      // cancelar aqui, o status "reembolsada" mentiria para a trava de
      // checkout.ts, que assume que ninguém reembolsado tem assinatura
      // ativa no Stripe.
      const assinatura = await buscarAssinatura(restauranteId);
      const subscriptionId = assinatura?.stripeSubscriptionId;

      if (subscriptionId) {
        try {
          await getStripe().subscriptions.cancel(subscriptionId);
        } catch (erro) {
          // O Stripe devolve erro quando a assinatura já está
          // cancelada. Isso NÃO é uma falha: significa que o estado
          // desejado (sem assinatura viva) já vale. Não deve abortar o
          // processamento do evento.
          console.log(
            `[Stripe] Nao foi possivel cancelar a assinatura ${subscriptionId} no reembolso do evento ` +
            `${evento.id} (provavelmente ja estava cancelada): ${(erro as Error).message}`,
          );
        }
      } else {
        console.log(
          `[Stripe] Evento ${evento.id}: reembolso total sem stripe_subscription_id salvo para o ` +
          `restaurante ${restauranteId}; seguindo apenas com a marcacao de status.`,
        );
      }

      await atualizarStatus(restauranteId, {
        status: 'reembolsada',
        canceladaEm: new Date().toISOString(),
      });

      await chamarRpc('resetar_cota_mensal', { p_restaurante_id: restauranteId, p_qtd: 0 });
      return;
    }

    default:
      return;
  }
}

import type Stripe from 'stripe';
import { supabaseAdmin } from '../../config/supabase.js';
import { atualizarStatus, buscarAssinatura, buscarPorCustomerId } from './assinatura-repo.js';
import { pacotePorId } from './pacotes.js';
import { getStripe } from './stripe-client.js';
import { periodoFimDaSubscription } from './periodo.js';

import { CREDITOS_DA_COTA } from './cota.js';

// Reexportado para não quebrar quem já importava a constante daqui.
export { CREDITOS_DA_COTA };

// Código do Postgres para unique_violation, exposto pelo supabase-js em
// error.code. É o único erro do insert abaixo que significa "evento
// repetido"; qualquer outro é falha de infraestrutura.
const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Grava o evento e diz se ele é novo. O Stripe reenvia quando não
 * recebe 200; sem esta trava, um reenvio credita a cota duas vezes.
 *
 * Só vale como "processado com sucesso" — ver removerRegistroEvento.
 *
 * Tratar QUALQUER erro do insert como duplicata seria pior do que não
 * ter idempotência: um blip do Supabase (ou a migration 006 ainda não
 * aplicada, com a tabela nem existindo) faria a rota responder 200, e o
 * Stripe nunca retenta um 200 — pagamento entrando e crédito não, em
 * silêncio. Só a violação de chave única é duplicata; o resto lança,
 * para a rota devolver 500 e o Stripe reenviar.
 */
export async function registrarEventoSeNovo(eventId: string, tipo: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('stripe_eventos_processados')
    .insert([{ event_id: eventId, tipo }]);

  if (!error) return true;

  if (error.code === POSTGRES_UNIQUE_VIOLATION) return false;

  throw new Error(
    `[Stripe] Falha ao registrar o evento ${eventId} (${tipo}) para idempotencia: ${error.message}`,
  );
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

/**
 * Mesma checagem de erro do chamarRpc acima, mas devolvendo o `data` —
 * usado por debitar_pacote_avulso, que devolve quanto foi de fato
 * debitado para o chamador poder logar o que se perdeu por saldo
 * insuficiente.
 */
async function chamarRpcComRetorno<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(nome, args);

  if (error) {
    throw new Error(`[Stripe] RPC ${nome} falhou para ${JSON.stringify(args)}: ${error.message}`);
  }

  return data as T;
}

/**
 * Busca no Stripe a data de fim do ciclo da assinatura recém-criada.
 *
 * O objeto Checkout Session não traz essa data — só o id da subscription
 * —, e sem ela a linha "Próxima cobrança" da tela de assinatura fica
 * invisível no primeiro mês inteiro, para todo mundo. A partir da
 * segunda fatura o invoice.paid já grava o período.
 *
 * Falha do Stripe aqui NÃO derruba o evento: a ativação e o crédito da
 * cota valem muito mais do que uma data na tela, e insistir só adiaria
 * os dois. Perder a data custa uma linha a menos até a renovação.
 */
async function buscarPeriodoFim(subscriptionId: string | null): Promise<string | null> {
  if (!subscriptionId) return null;

  try {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    return periodoFimDaSubscription(subscription);
  } catch (erro) {
    console.error(
      `[Stripe] Nao foi possivel ler o fim do periodo da assinatura ${subscriptionId}; ` +
      `seguindo sem gravar periodo_fim:`,
      erro,
    );
    return null;
  }
}

type Tratador = (evento: Stripe.Event, objeto: any, restauranteId: string) => Promise<void>;

async function tratarCheckoutSessionCompleted(
  evento: Stripe.Event,
  objeto: any,
  restauranteId: string,
): Promise<void> {
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

  const subscriptionId = typeof objeto.subscription === 'string' ? objeto.subscription : null;

  await atualizarStatus(restauranteId, {
    status: 'ativa',
    stripeSubscriptionId: subscriptionId,
    periodoFim: await buscarPeriodoFim(subscriptionId),
    // Limpa um eventual aviso de cancelamento agendado de uma assinatura
    // anterior: o lojista pode ter agendado o cancelamento, mudado de
    // ideia e feito um checkout novo em vez de reativar pelo Portal. Sem
    // isso, a assinatura nova nasce exibindo o aviso de cancelamento da
    // antiga.
    cancelamentoAgendadoPara: null,
  });

  await chamarRpc('resetar_cota_mensal', {
    p_restaurante_id: restauranteId,
    p_qtd: CREDITOS_DA_COTA,
  });
}

async function tratarInvoicePaid(_evento: Stripe.Event, objeto: any, restauranteId: string): Promise<void> {
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
}

async function tratarInvoicePaymentFailed(
  _evento: Stripe.Event,
  _objeto: any,
  restauranteId: string,
): Promise<void> {
  // Não zera crédito: o Stripe ainda vai tentar cobrar de novo, e
  // derrubar o atendimento por um cartão recusado perde cliente.
  await atualizarStatus(restauranteId, { status: 'inadimplente' });
}

async function tratarSubscriptionDeleted(
  _evento: Stripe.Event,
  _objeto: any,
  restauranteId: string,
): Promise<void> {
  await atualizarStatus(restauranteId, {
    status: 'cancelada',
    canceladaEm: new Date().toISOString(),
    // A assinatura já terminou de fato: um aviso de "continua ativa até
    // [data passada]" deixado para trás contradiz o status 'cancelada'
    // que acabou de ser gravado.
    cancelamentoAgendadoPara: null,
  });

  // Zera só a cota. Avulso foi pago à parte e continua valendo.
  await chamarRpc('resetar_cota_mensal', { p_restaurante_id: restauranteId, p_qtd: 0 });
}

/**
 * customer.subscription.updated: dispara para qualquer mudança na
 * subscription, mas o caso que interessa aqui é o cancelamento AGENDADO
 * pelo Customer Portal. Nesse fluxo o Stripe NÃO manda
 * customer.subscription.deleted na hora — a subscription continua
 * `active` e só ganha `cancel_at` (data em que vai terminar). O delete
 * de verdade só chega quando essa data vier.
 *
 * Por isso este tratador NUNCA mexe em status nem em crédito: o
 * lojista pagou o mês e continua com acesso até `cancel_at` chegar,
 * quando customer.subscription.deleted assume e faz a baixa de verdade.
 * Aqui só registramos o aviso (e o período atualizado, já que o evento
 * carrega o estado corrente da subscription) para a tela poder mostrar
 * a data ao lojista.
 *
 * `cancel_at` vazio significa que o lojista reativou pelo próprio
 * portal (o Stripe permite desfazer o cancelamento agendado) — nesse
 * caso limpamos o aviso, a assinatura volta ao normal.
 */
async function tratarSubscriptionUpdated(
  _evento: Stripe.Event,
  objeto: any,
  restauranteId: string,
): Promise<void> {
  await atualizarStatus(restauranteId, {
    cancelamentoAgendadoPara: paraIso(objeto.cancel_at) ?? null,
    periodoFim: periodoFimDaSubscription(objeto),
  });
}

/**
 * Reembolso de pacote avulso (metadata.pacote_id presente na Charge).
 *
 * Correção do spec: reembolso só debita crédito quando é TOTAL — mesma
 * regra do reembolso de assinatura logo abaixo (reembolsoTotal em
 * tratarChargeRefunded), pela mesma razão de negócio: neste modelo o
 * reembolso é sempre integral; um estorno parcial é sempre engano ou
 * cortesia no painel do Stripe, nunca uma devolução proporcional de
 * créditos. Um estorno de cortesia de R$ 5 num pacote de R$ 59,90 não
 * pode tirar os 2.500 créditos do lojista. Se isso for "simplificado" de
 * volta para debitar em qualquer reembolso, essa regra quebra de novo.
 */
async function tratarReembolsoDePacote(
  evento: Stripe.Event,
  objeto: any,
  restauranteId: string,
): Promise<void> {
  const reembolsoTotal = (objeto.amount_refunded ?? 0) >= (objeto.amount ?? 0);

  if (!reembolsoTotal) {
    console.log(
      `[Stripe] Reembolso parcial de pacote avulso no evento ${evento.id} para o restaurante ` +
      `${restauranteId} (amount_refunded=${objeto.amount_refunded}, amount=${objeto.amount}): ` +
      `nenhum credito foi debitado.`,
    );
    return;
  }

  // Decisão de negócio: reembolsar um pacote avulso debita os
  // créditos correspondentes de creditos_avulsos. Sem isso, o
  // lojista devolve o dinheiro e fica com os créditos de graça —
  // foi exatamente o que aconteceu no teste real (R$ 59,90
  // reembolsados, 2.500 créditos mantidos).
  const pacote = pacotePorId(objeto.metadata.pacote_id);

  if (!pacote) {
    console.error(
      `[Stripe] Reembolso ${evento.id} referencia pacote_id ` +
      `"${objeto.metadata.pacote_id}" desconhecido; nao foi possivel debitar ` +
      `creditos avulsos do restaurante ${restauranteId}.`,
    );
    return;
  }

  const debitado = await chamarRpcComRetorno<number>('debitar_pacote_avulso', {
    p_restaurante_id: restauranteId,
    p_qtd: pacote.creditos,
  });

  const naoDebitado = pacote.creditos - debitado;

  // O saldo nunca fica negativo: a RPC debita no máximo o que
  // existe. Se o lojista já consumiu parte, sobra uma diferença
  // que ninguém devolveu — logada aqui para o dono do projeto
  // decidir se vale cobrar manualmente.
  console.log(
    `[Stripe] Evento ${evento.id}: reembolso total de pacote avulso ` +
    `(pacote_id=${objeto.metadata.pacote_id}) do restaurante ${restauranteId}. ` +
    `Debitados ${debitado} de ${pacote.creditos} creditos avulsos` +
    (naoDebitado > 0 ? ` (${naoDebitado} ja haviam sido consumidos e nao puderam ser recuperados).` : '.') +
    ` A assinatura, o status e a cota nao sao afetados.`,
  );
}

async function tratarChargeRefunded(evento: Stripe.Event, objeto: any, restauranteId: string): Promise<void> {
  // A compra de pacote avulso (mode: 'payment') gera uma Charge do
  // MESMO Customer da assinatura. Sem esta saída, devolver os
  // R$ 59,90 de um pacote por cortesia cairia no caminho de baixo,
  // que cancela a assinatura no Stripe, marca 'reembolsada' e zera a
  // cota: o restaurante perderia o acesso ao painel por causa de um
  // reembolso que não tem nada a ver com a mensalidade.
  //
  // A metadata chega aqui porque criarSessaoPacote a repassa em
  // payment_intent_data — o Stripe copia a metadata do PaymentIntent
  // para a Charge. Não dá para distinguir pelo campo `invoice`: ele
  // não existe mais no objeto Charge da versão de API deste SDK.
  if (objeto.metadata?.pacote_id) {
    await tratarReembolsoDePacote(evento, objeto, restauranteId);
    return;
  }

  // O evento charge.refunded dispara para QUALQUER reembolso da
  // cobrança, inclusive um reembolso parcial (ex.: cortesia de
  // R$ 50 por um problema pontual). Só um reembolso TOTAL significa
  // "cliente saiu" — comparar amount_refunded com amount é a única
  // forma de diferenciar os dois casos. Se isso for removido, um
  // gesto de boa vontade parcial derruba o atendimento inteiro do
  // restaurante. Mesma regra usada em tratarReembolsoDePacote acima.
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
    // O reembolso total também encerra o serviço: um cancelamento
    // agendado que porventura existisse fica órfão e mentiria na tela
    // junto com o status 'reembolsada'.
    cancelamentoAgendadoPara: null,
  });

  await chamarRpc('resetar_cota_mensal', { p_restaurante_id: restauranteId, p_qtd: 0 });
}

/**
 * Única fonte de verdade de quais tipos de evento o handler trata, e o
 * que fazer com cada um. Correção do spec: antes havia um Set
 * (TIPOS_TRATADOS) e um switch mantidos lado a lado por convenção, sem
 * nada garantindo que continuassem sincronizados — um `case` novo sem
 * entrada no Set virava código morto silencioso, e uma entrada no Set
 * sem `case` caía no `default` do switch, marcada como processada sem
 * fazer nada. Com o dispatch abaixo como fonte única, as duas
 * divergências deixam de ser possíveis: a saída antecipada em
 * processarEvento verifica a PRÓPRIA chave deste objeto (TRATADORES[tipo]),
 * não uma lista separada — um tipo só é tratado se, e somente se,
 * houver uma função aqui para ele.
 */
const TRATADORES: Record<string, Tratador> = {
  'checkout.session.completed': tratarCheckoutSessionCompleted,
  'invoice.paid': tratarInvoicePaid,
  'invoice.payment_failed': tratarInvoicePaymentFailed,
  'customer.subscription.deleted': tratarSubscriptionDeleted,
  'customer.subscription.updated': tratarSubscriptionUpdated,
  'charge.refunded': tratarChargeRefunded,
};

export async function processarEvento(evento: Stripe.Event): Promise<void> {
  // Sai cedo, ANTES de tentar identificar o restaurante, para tipos de
  // evento que o handler não trata (isto é, sem entrada em TRATADORES).
  // Marcar como processado é o correto aqui: não há nada a fazer com
  // esses eventos, e retentar não mudaria isso. Se essa checagem
  // rodasse depois da busca do restaurante, um evento não tratado
  // (ex.: invoice_payment.paid) e sem restaurante identificável cairia
  // no `throw` abaixo por engano e entraria num laço de retentativa
  // infinito — foi exatamente isso que aconteceu no teste real com a
  // conta do Stripe.
  const tratador = TRATADORES[evento.type];
  if (!tratador) return;

  const objeto = evento.data.object as any;
  const restauranteId = await restauranteDoEvento(objeto);

  // Lança em vez de retornar: o registro de idempotência já foi gravado
  // antes de chegar aqui, e um `return` o deixaria valendo como
  // "processado com sucesso". Aí um reenvio do Stripe — que é o que
  // resolveria uma corrida com o salvamento do stripe_customer_id —
  // seria descartado como duplicata para sempre. Lançando, quem chamou
  // roda removerRegistroEvento e o reenvio volta a ser tratado como novo.
  //
  // Só chega aqui para tipos que TRATADORES já filtrou como tratados
  // (ver saída antecipada acima), então não achar o restaurante é de
  // fato uma falha que vale a pena retentar.
  if (!restauranteId) {
    throw new Error(
      `[Stripe] Evento ${evento.id} (${evento.type}) sem restaurante identificavel.`,
    );
  }

  await tratador(evento, objeto, restauranteId);
}

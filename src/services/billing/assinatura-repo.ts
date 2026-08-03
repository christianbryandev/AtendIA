import { supabaseAdmin } from '../../config/supabase.js';

export type StatusAssinatura =
  | 'pendente' | 'ativa' | 'inadimplente' | 'cancelada' | 'reembolsada';

export interface Assinatura {
  restauranteId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: StatusAssinatura;
  periodoFim: string | null;
  cancelamentoAgendadoPara: string | null;
}

interface LinhaAssinatura {
  restaurante_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: StatusAssinatura;
  periodo_fim: string | null;
  cancelamento_agendado_para: string | null;
}

const COLUNAS =
  'restaurante_id, stripe_customer_id, stripe_subscription_id, status, periodo_fim, cancelamento_agendado_para';

function paraDominio(linha: LinhaAssinatura): Assinatura {
  return {
    restauranteId: linha.restaurante_id,
    stripeCustomerId: linha.stripe_customer_id,
    stripeSubscriptionId: linha.stripe_subscription_id,
    status: linha.status,
    periodoFim: linha.periodo_fim,
    cancelamentoAgendadoPara: linha.cancelamento_agendado_para ?? null,
  };
}

export async function buscarAssinatura(restauranteId: string): Promise<Assinatura | null> {
  const { data } = await supabaseAdmin
    .from('assinaturas')
    .select(COLUNAS)
    .eq('restaurante_id', restauranteId)
    .maybeSingle();

  return data ? paraDominio(data as LinhaAssinatura) : null;
}

export async function buscarPorCustomerId(customerId: string): Promise<Assinatura | null> {
  const { data } = await supabaseAdmin
    .from('assinaturas')
    .select(COLUNAS)
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  return data ? paraDominio(data as LinhaAssinatura) : null;
}

export async function salvarCustomerId(restauranteId: string, customerId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('assinaturas')
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq('restaurante_id', restauranteId);

  if (error) throw error;
}

export async function atualizarStatus(
  restauranteId: string,
  campos: Partial<Pick<Assinatura, 'status' | 'stripeSubscriptionId' | 'periodoFim' | 'cancelamentoAgendadoPara'>> & { canceladaEm?: string },
): Promise<void> {
  const linha: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (campos.status !== undefined) linha.status = campos.status;
  if (campos.stripeSubscriptionId !== undefined) linha.stripe_subscription_id = campos.stripeSubscriptionId;
  if (campos.periodoFim !== undefined) linha.periodo_fim = campos.periodoFim;
  if (campos.canceladaEm !== undefined) linha.cancelada_em = campos.canceladaEm;
  if (campos.cancelamentoAgendadoPara !== undefined) linha.cancelamento_agendado_para = campos.cancelamentoAgendadoPara;

  const { error } = await supabaseAdmin
    .from('assinaturas')
    .update(linha)
    .eq('restaurante_id', restauranteId);

  if (error) throw error;
}

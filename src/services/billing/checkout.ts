import { env } from '../../config/env.js';
import { getStripe } from './stripe-client.js';
import { buscarAssinatura, salvarCustomerId } from './assinatura-repo.js';
import { pacotePorId } from './pacotes.js';

async function garantirCustomer(restauranteId: string, email?: string): Promise<string> {
  const assinatura = await buscarAssinatura(restauranteId);

  if (!assinatura) {
    throw new Error('Conta sem registro de assinatura.');
  }

  if (assinatura.stripeCustomerId) {
    return assinatura.stripeCustomerId;
  }

  const customer = await getStripe().customers.create({
    email,
    metadata: { restaurante_id: restauranteId },
  });

  await salvarCustomerId(restauranteId, customer.id);
  return customer.id;
}

export async function criarSessaoAssinatura(restauranteId: string, email: string): Promise<string> {
  const assinatura = await buscarAssinatura(restauranteId);

  // O Stripe aceita duas assinaturas do mesmo preço para o mesmo
  // Customer sem reclamar. A trava contra cobrança dupla é esta.
  //
  // 'cancelada' e 'reembolsada' passam por aqui de propósito: nos dois
  // casos não existe assinatura viva no Stripe (customer.subscription.deleted
  // marca a primeira; o webhook de charge.refunded cancela a assinatura
  // antes de marcar a segunda), então barrar o checkout impediria um
  // ex-cliente de assinar de novo sem motivo.
  if (assinatura?.status === 'ativa') {
    throw new Error('Esta conta já tem uma assinatura ativa.');
  }

  // 'inadimplente' também tem uma assinatura viva no Stripe (em
  // dunning, ainda não cancelada) — abrir um novo checkout duplicaria
  // a cobrança em vez de resolver o atraso. O caminho correto é o
  // Customer Portal, que permite atualizar a forma de pagamento.
  if (assinatura?.status === 'inadimplente') {
    throw new Error('Esta conta tem uma assinatura com pagamento pendente. Abra o portal de cobrança para regularizar.');
  }

  // Lido de process.env em tempo de chamada (não de `env`, que é
  // congelado no import): igual ao padrão de pacotes.ts, evita URL de
  // preço "presa" no valor que existia quando o módulo carregou.
  const priceAssinatura = process.env.STRIPE_PRICE_ASSINATURA;

  if (!priceAssinatura) {
    throw new Error('STRIPE_PRICE_ASSINATURA não configurada.');
  }

  const customerId = await garantirCustomer(restauranteId, email);

  const sessao = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceAssinatura, quantity: 1 }],
    client_reference_id: restauranteId,
    metadata: { restaurante_id: restauranteId },
    subscription_data: { metadata: { restaurante_id: restauranteId } },
    locale: 'pt-BR',
    success_url: `${env.APP_URL}/assinatura/confirmando?sessao={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}/assinatura/pagamento`,
  });

  if (!sessao.url) throw new Error('O Stripe não devolveu a URL do checkout.');
  return sessao.url;
}

export async function criarSessaoPacote(restauranteId: string, pacoteId: string): Promise<string> {
  const assinatura = await buscarAssinatura(restauranteId);

  if (assinatura?.status !== 'ativa') {
    throw new Error('É preciso ter uma assinatura ativa para comprar créditos.');
  }

  const pacote = pacotePorId(pacoteId);

  if (!pacote || !pacote.priceId) {
    throw new Error('Pacote inválido.');
  }

  const customerId = await garantirCustomer(restauranteId);

  const sessao = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{ price: pacote.priceId, quantity: 1 }],
    client_reference_id: restauranteId,
    metadata: { restaurante_id: restauranteId, pacote_id: pacote.id },
    locale: 'pt-BR',
    success_url: `${env.APP_URL}/app/creditos?compra=ok`,
    cancel_url: `${env.APP_URL}/app/creditos`,
  });

  if (!sessao.url) throw new Error('O Stripe não devolveu a URL do checkout.');
  return sessao.url;
}

export async function criarSessaoPortal(restauranteId: string): Promise<string> {
  const assinatura = await buscarAssinatura(restauranteId);

  if (!assinatura?.stripeCustomerId) {
    throw new Error('Nenhuma assinatura para gerenciar.');
  }

  const sessao = await getStripe().billingPortal.sessions.create({
    customer: assinatura.stripeCustomerId,
    return_url: `${env.APP_URL}/app/assinatura`,
  });

  return sessao.url;
}

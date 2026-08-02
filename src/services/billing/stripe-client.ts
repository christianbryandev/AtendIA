import Stripe from 'stripe';
import { env } from '../../config/env.js';

let instancia: Stripe | null = null;

/** Único ponto do sistema que conhece a chave secreta do Stripe. */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY não configurada. Cobrança indisponível.');
  }

  if (!instancia) {
    instancia = new Stripe(env.STRIPE_SECRET_KEY);
  }

  return instancia;
}

export function getWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET não configurada. Webhook indisponível.');
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

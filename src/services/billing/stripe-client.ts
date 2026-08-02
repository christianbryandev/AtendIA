import Stripe from 'stripe';
import { env } from '../../config/env.js';

let instancia: Stripe | null = null;

/** Único ponto do sistema que conhece a chave secreta do Stripe. */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY não configurada. Cobrança indisponível.');
  }

  if (!instancia) {
    // A versão de API é fixada de propósito. Sem `apiVersion`, tanto as
    // chamadas quanto os payloads de webhook chegam na versão default
    // da conta Stripe, que pode ser mais antiga (ou mudar sozinha num
    // upgrade do dashboard) do que a versão que os tipos deste SDK
    // assumem. O resultado é campo lido do lugar errado sem erro
    // nenhum — foi assim que periodo_fim ficou null: `current_period_end`
    // mudou de lugar entre versões. Este valor é a versão que o
    // stripe@22.4.0 instalado espera (node_modules/stripe/esm/apiVersion.d.ts);
    // ao subir o SDK, subir também aqui.
    instancia = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-07-29.dahlia' });
  }

  return instancia;
}

export function getWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET não configurada. Webhook indisponível.');
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

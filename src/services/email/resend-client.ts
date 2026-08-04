import { Resend } from 'resend';
import { env } from '../../config/env.js';

let instancia: Resend | null = null;

// E-mail verificado no domínio próprio (pendência do dono: contratar o
// Resend e verificar o domínio atendiarp.com.br antes de qualquer envio
// real funcionar).
const REMETENTE = 'AtendIA <contato@atendiarp.com.br>';

/**
 * Único ponto do sistema que conhece a chave do Resend.
 *
 * Mesmo padrão de getStripe() (src/services/billing/stripe-client.ts):
 * a chave é opcional em env.ts e só é exigida aqui, no momento do uso —
 * nunca no import deste módulo — para o servidor continuar subindo sem
 * ela enquanto o Resend não é contratado.
 */
export function getResend(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY não configurada. Envio de e-mail indisponível.');
  }

  if (!instancia) {
    instancia = new Resend(env.RESEND_API_KEY);
  }

  return instancia;
}

export interface EnvioDeEmail {
  to: string;
  subject: string;
  html: string;
}

/** Envia um e-mail via Resend, sempre a partir de contato@atendiarp.com.br. */
export async function enviarEmail({ to, subject, html }: EnvioDeEmail): Promise<void> {
  const resend = getResend();

  const { error } = await resend.emails.send({
    from: REMETENTE,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${error.message}`);
  }
}

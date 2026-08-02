import type { Request, Response } from 'express';
import { getStripe, getWebhookSecret } from './stripe-client.js';
import { processarEvento, registrarEventoSeNovo, removerRegistroEvento } from './webhook-handler.js';

/**
 * Rota POST /api/webhooks/stripe.
 *
 * Vive fora do server.ts para poder ser testada de ponta a ponta: é a
 * única rota do sistema que escreve saldo e status a partir de entrada
 * externa, e a verificação de assinatura é a única coisa que separa
 * "Stripe mandou" de "qualquer um na internet mandou".
 */
export async function webhookStripeHandler(req: Request, res: Response): Promise<void> {
  const assinaturaHeader = req.headers['stripe-signature'];

  if (!assinaturaHeader || !req.rawBody) {
    res.status(400).send('Assinatura ausente.');
    return;
  }

  let evento;

  try {
    evento = getStripe().webhooks.constructEvent(
      req.rawBody,
      assinaturaHeader as string,
      getWebhookSecret(),
    );
  } catch (erro: any) {
    console.error('[Stripe] Assinatura inválida:', erro.message);
    res.status(400).send('Assinatura inválida.');
    return;
  }

  let ehNovo: boolean;

  try {
    ehNovo = await registrarEventoSeNovo(evento.id, evento.type);
  } catch (erro) {
    // Falha de infraestrutura ao gravar o registro de idempotência (banco
    // fora do ar, tabela ainda não migrada). Responder 200 aqui seria o
    // pior desfecho possível: o Stripe nunca retenta um 200, então o
    // pagamento entraria e o crédito não, sem sinal nenhum. Com 500 o
    // Stripe reenvia o evento e o crédito acontece na retentativa.
    console.error(`[Stripe] Falha de infraestrutura no registro do evento ${evento.id}:`, erro);
    res.status(500).json({ success: false, error: 'Falha ao registrar o evento.' });
    return;
  }

  if (!ehNovo) {
    console.log(`[Stripe] Evento ${evento.id} já processado. Ignorando duplicata.`);
    res.status(200).json({ received: true });
    return;
  }

  // Responde antes de processar: o Stripe considera timeout acima de
  // ~20s e reenvia. O processamento segue em segundo plano.
  res.status(200).json({ received: true });

  setImmediate(async () => {
    try {
      await processarEvento(evento);
    } catch (erro) {
      console.error(`[Stripe] Falha ao processar ${evento.id}:`, erro);

      // O registro de idempotência só vale como "processado com
      // sucesso". Sem desfazê-lo aqui, um reenvio do Stripe para este
      // mesmo evento seria descartado como duplicata para sempre, e a
      // falha (rede, banco fora do ar, etc.) viraria perda permanente
      // e silenciosa de crédito para o lojista.
      await removerRegistroEvento(evento.id);
    }
  });
}

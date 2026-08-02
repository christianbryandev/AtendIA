import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import Stripe from 'stripe';

// A rota /api/webhooks/stripe é a única do sistema que escreve saldo e
// status a partir de entrada externa. A verificação de assinatura é a
// única coisa que separa "o Stripe mandou" de "qualquer um na internet
// mandou", então ela é exercitada aqui com o algoritmo REAL do SDK — não
// com um constructEvent falso que sempre aceita.
const SEGREDO_WEBHOOK = 'whsec_segredo_de_teste';

// Chave falsa: nenhuma chamada de rede acontece neste arquivo. O
// constructEvent é criptografia pura, offline.
const stripeReal = new Stripe('sk_test_chave_falsa_de_teste', { apiVersion: '2026-07-29.dahlia' });

vi.mock('./stripe-client.js', () => ({
  getStripe: () => stripeReal,
  getWebhookSecret: () => SEGREDO_WEBHOOK,
}));

const processarEventoMock = vi.fn();
const registrarEventoSeNovoMock = vi.fn();
const removerRegistroEventoMock = vi.fn();

vi.mock('./webhook-handler.js', () => ({
  processarEvento: (...a: unknown[]) => processarEventoMock(...a),
  registrarEventoSeNovo: (...a: unknown[]) => registrarEventoSeNovoMock(...a),
  removerRegistroEvento: (...a: unknown[]) => removerRegistroEventoMock(...a),
}));

const { webhookStripeHandler } = await import('./webhook-route.js');

const EVENTO = JSON.stringify({
  id: 'evt_teste_1',
  type: 'checkout.session.completed',
  data: { object: { mode: 'subscription', client_reference_id: 'rest-1' } },
});

function criarResposta() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res as Response;
}

function criarRequisicao(corpo: string, assinatura?: string): Request {
  return {
    headers: assinatura === undefined ? {} : { 'stripe-signature': assinatura },
    rawBody: Buffer.from(corpo, 'utf8'),
  } as unknown as Request;
}

function assinaturaValida(corpo: string): string {
  return stripeReal.webhooks.generateTestHeaderString({
    payload: corpo,
    secret: SEGREDO_WEBHOOK,
  });
}

// O processamento roda em setImmediate, depois da resposta. Sem esperar
// um tick, o teste terminaria antes de ele acontecer.
const proximoTick = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  registrarEventoSeNovoMock.mockResolvedValue(true);
  processarEventoMock.mockResolvedValue(undefined);
  removerRegistroEventoMock.mockResolvedValue(undefined);
});

describe('POST /api/webhooks/stripe', () => {
  it('rejeita com 400 uma assinatura forjada, sem escrever nada', async () => {
    const req = criarRequisicao(EVENTO, 't=1,v1=assinatura_inventada');
    const res = criarResposta();

    await webhookStripeHandler(req, res);
    await proximoTick();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(registrarEventoSeNovoMock).not.toHaveBeenCalled();
    expect(processarEventoMock).not.toHaveBeenCalled();
  });

  // Payload trocado depois de assinado: a assinatura é legítima, mas não
  // corresponde a este corpo. É o ataque que a verificação existe para
  // barrar — sem ela, qualquer um creditaria 10.000 no próprio
  // restaurante mandando um checkout.session.completed forjado.
  it('rejeita com 400 uma assinatura válida de OUTRO payload', async () => {
    const req = criarRequisicao(
      JSON.stringify({ id: 'evt_adulterado', type: 'checkout.session.completed', data: { object: {} } }),
      assinaturaValida(EVENTO),
    );
    const res = criarResposta();

    await webhookStripeHandler(req, res);
    await proximoTick();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(registrarEventoSeNovoMock).not.toHaveBeenCalled();
    expect(processarEventoMock).not.toHaveBeenCalled();
  });

  it('rejeita com 400 quando o header de assinatura nem vem', async () => {
    const res = criarResposta();

    await webhookStripeHandler(criarRequisicao(EVENTO), res);
    await proximoTick();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(registrarEventoSeNovoMock).not.toHaveBeenCalled();
  });

  it('aceita a assinatura válida, responde 200 e processa o evento', async () => {
    const req = criarRequisicao(EVENTO, assinaturaValida(EVENTO));
    const res = criarResposta();

    await webhookStripeHandler(req, res);
    await proximoTick();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(registrarEventoSeNovoMock).toHaveBeenCalledWith('evt_teste_1', 'checkout.session.completed');
    expect(processarEventoMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt_teste_1' }),
    );
  });

  it('responde 200 e não reprocessa quando o evento é duplicata', async () => {
    registrarEventoSeNovoMock.mockResolvedValue(false);
    const res = criarResposta();

    await webhookStripeHandler(criarRequisicao(EVENTO, assinaturaValida(EVENTO)), res);
    await proximoTick();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(processarEventoMock).not.toHaveBeenCalled();
  });

  // O Stripe nunca retenta um 200. Falha de infraestrutura no registro
  // precisa virar 500 para o evento ser reenviado — senão o pagamento
  // entra e o crédito não.
  it('responde 500 quando o registro de idempotência falha por erro de infraestrutura', async () => {
    registrarEventoSeNovoMock.mockRejectedValue(new Error('banco fora do ar'));
    const res = criarResposta();

    await webhookStripeHandler(criarRequisicao(EVENTO, assinaturaValida(EVENTO)), res);
    await proximoTick();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(processarEventoMock).not.toHaveBeenCalled();
  });

  it('desfaz o registro de idempotência quando o processamento falha', async () => {
    processarEventoMock.mockRejectedValue(new Error('RPC falhou'));
    const res = criarResposta();

    await webhookStripeHandler(criarRequisicao(EVENTO, assinaturaValida(EVENTO)), res);
    await proximoTick();

    expect(removerRegistroEventoMock).toHaveBeenCalledWith('evt_teste_1');
  });
});

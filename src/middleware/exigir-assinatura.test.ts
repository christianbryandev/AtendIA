import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const buscarAssinaturaMock = vi.fn();

vi.mock('../services/billing/assinatura-repo.js', () => ({
  buscarAssinatura: (...args: unknown[]) => buscarAssinaturaMock(...args),
}));

const { exigirAssinaturaAtiva } = await import('./exigir-assinatura.js');

function criarResposta() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function criarRequisicao(): Request {
  return { restauranteId: 'rest-1' } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('exigirAssinaturaAtiva', () => {
  it('deixa passar quando o status é "ativa"', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa' });
    const req = criarRequisicao();
    const res = criarResposta();
    const next = vi.fn() as NextFunction;

    await exigirAssinaturaAtiva(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  // De propósito: o Stripe ainda vai retentar a cobrança, e cortar o
  // atendimento de um restaurante por um cartão recusado uma vez perde
  // cliente à toa.
  it('deixa passar quando o status é "inadimplente"', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'inadimplente' });
    const req = criarRequisicao();
    const res = criarResposta();
    const next = vi.fn() as NextFunction;

    await exigirAssinaturaAtiva(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('barra com 402 quando o status é "pendente"', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente' });
    const req = criarRequisicao();
    const res = criarResposta();
    const next = vi.fn() as NextFunction;

    await exigirAssinaturaAtiva(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'pendente' }));
  });

  it('barra quando o status é "cancelada"', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'cancelada' });
    const req = criarRequisicao();
    const res = criarResposta();
    const next = vi.fn() as NextFunction;

    await exigirAssinaturaAtiva(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelada' }));
  });

  it('barra quando o status é "reembolsada"', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'reembolsada' });
    const req = criarRequisicao();
    const res = criarResposta();
    const next = vi.fn() as NextFunction;

    await exigirAssinaturaAtiva(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'reembolsada' }));
  });

  it('barra conta sem registro de assinatura, reportando status "pendente"', async () => {
    buscarAssinaturaMock.mockResolvedValue(null);
    const req = criarRequisicao();
    const res = criarResposta();
    const next = vi.fn() as NextFunction;

    await exigirAssinaturaAtiva(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'pendente' }));
  });
});

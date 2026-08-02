import type { Request, Response, NextFunction } from 'express';
import { buscarAssinatura } from '../services/billing/assinatura-repo.js';

// 'inadimplente' passa de propósito: o Stripe ainda vai tentar cobrar
// de novo, e cortar o acesso por um cartão recusado perde cliente à toa.
const STATUS_COM_ACESSO = ['ativa', 'inadimplente'];

export async function exigirAssinaturaAtiva(req: Request, res: Response, next: NextFunction) {
  const assinatura = await buscarAssinatura(req.restauranteId!);

  if (!assinatura || !STATUS_COM_ACESSO.includes(assinatura.status)) {
    return res.status(402).json({
      success: false,
      error: 'Assinatura inativa.',
      status: assinatura?.status ?? 'pendente',
    });
  }

  return next();
}

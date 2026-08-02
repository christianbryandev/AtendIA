import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/env.js';

declare global {
  namespace Express {
    interface Request {
      restauranteId?: string;
      usuarioId?: string;
    }
  }
}

export function autenticar(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token não fornecido.' });
  }

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], getJwtSecret()) as jwt.JwtPayload;
    req.restauranteId = decoded.sub as string;
    req.usuarioId = decoded.user_metadata?.usuario_id as string | undefined;
    return next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado.' });
  }
}

import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { HttpError } from '../services/pool.service';

const secret = process.env.JWT_SECRET ?? 'development-only-change-me';

type TokenPayload = { id: string; role: UserRole; name: string };

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
  try {
    req.user = jwt.verify(header.slice(7), secret) as TokenPayload;
    next();
  } catch {
    next(new HttpError(401, 'INVALID_TOKEN', 'Your session is invalid or expired.'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    next();
  };
}

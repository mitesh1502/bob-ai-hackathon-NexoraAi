import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { AppError } from './errorHandler';

export interface AuthUser {
  id: string;
  role: 'super_admin' | 'state_admin' | 'worker';
  stateId?: string;
  email?: string;
  workerProfileId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Authentication required');
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new AppError(401, 'Authentication required');
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'Insufficient permissions');
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  requireRole('super_admin')(req, res, next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireRole('super_admin', 'state_admin')(req, res, next);
}

/**
 * Enforce state-level data isolation.
 * - super_admin: allowed all states
 * - state_admin: only their assigned state
 * - worker: enforced per-route
 *
 * Call this after authenticate(). Pass the stateId from the resource being accessed.
 */
export function enforceStateAccess(resourceStateId: string | undefined, req: Request): void {
  if (!req.user) throw new AppError(401, 'Authentication required');
  if (req.user.role === 'super_admin') return;
  if (req.user.role === 'state_admin') {
    if (!resourceStateId || req.user.stateId !== resourceStateId) {
      throw new AppError(403, 'Access denied: resource belongs to a different state');
    }
    return;
  }
  // Workers: enforced per-route
}

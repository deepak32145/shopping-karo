import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { HttpError } from './errors';

export interface AuthUser {
  id: string;
  email?: string;
  roles: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Fetches (and caches) the auth-service public keys. Tokens are verified locally; no call per request. */
export const remoteKeys = (jwksUrl: string): JWTVerifyGetKey => createRemoteJWKSet(new URL(jwksUrl));

export interface AuthOptions {
  keys: JWTVerifyGetKey;
  issuer: string;
}

/** Verifies the RS256 access tokens issued by auth-service. */
export interface Auth {
  authenticate: RequestHandler;
  requireRole: (role: string) => RequestHandler[];
}

export function createAuth({ keys, issuer }: AuthOptions): Auth {
  const authenticate: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue'));
      return;
    }
    try {
      const { payload } = await jwtVerify(token, keys, { issuer, algorithms: ['RS256'] });
      if (!payload.sub) throw new Error('token has no subject');
      req.user = {
        id: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        roles: Array.isArray(payload.roles) ? payload.roles.filter((r): r is string => typeof r === 'string') : [],
      };
      next();
    } catch {
      next(new HttpError(401, 'UNAUTHORIZED', 'Your session is invalid or has expired'));
    }
  };

  /** Authenticated AND holding the role. 401 if not signed in, 403 if signed in without the role. */
  const requireRole = (role: string): RequestHandler[] => [
    authenticate,
    (req, _res, next) => {
      if (req.user?.roles.includes(role)) next();
      else next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to do this'));
    },
  ];

  return { authenticate, requireRole };
}

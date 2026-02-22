import { Request, Response, NextFunction } from 'express';
import { JWTHandler } from '../auth/jwt-handler.js';
import { telemetry } from '../observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    role: string;
    scopes: string[];
    tokenId: string;
  };
}

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Authentication middleware: Extract and validate JWT token
 */
export function createAuthMiddleware(jwtHandler: JWTHandler) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const traceId = req.headers['x-trace-id'] as string || 'unknown';

    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        telemetry.emit('auth:missing_token', { traceId });
        return res.status(401).json({ error: 'Missing authentication token' });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Validate token
      const payload = await jwtHandler.validateToken(token, traceId);

      // Attach auth context to request
      req.auth = {
        userId: payload.sub,
        role: payload.role,
        scopes: payload.scopes || [],
        tokenId: payload.jti,
      };

      telemetry.emit('auth:authenticated', {
        userId: payload.sub,
        role: payload.role,
        traceId,
      });

      next();
    } catch (error) {
      telemetry.emit('auth:invalid_token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId,
      });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * Authorization middleware: Check role-based access
 */
export function createRBACMiddleware(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const traceId = req.headers['x-trace-id'] as string || 'unknown';

    if (!req.auth) {
      telemetry.emit('auth:unauthorized', {
        reason: 'no_auth_context',
        traceId,
      });
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.auth.role)) {
      telemetry.emit('auth:forbidden', {
        userId: req.auth.userId,
        role: req.auth.role,
        requiredRoles: allowedRoles,
        traceId,
      });
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Scope authorization middleware: Check specific scopes
 */
export function createScopeMiddleware(requiredScopes: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const traceId = req.headers['x-trace-id'] as string || 'unknown';

    if (!req.auth) {
      telemetry.emit('auth:unauthorized', {
        reason: 'no_auth_context',
        traceId,
      });
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has at least one of the required scopes
    const hasScope = requiredScopes.some((scope) => req.auth!.scopes.includes(scope));

    if (!hasScope) {
      telemetry.emit('auth:insufficient_scope', {
        userId: req.auth.userId,
        userScopes: req.auth.scopes,
        requiredScopes,
        traceId,
      });
      return res.status(403).json({ error: 'Insufficient scopes' });
    }

    next();
  };
}

/**
 * Audit logging middleware: Log all authenticated requests
 */
export function createAuditMiddleware() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const traceId = req.headers['x-trace-id'] as string || 'unknown';
    const timestamp = new Date().toISOString();

    if (req.auth) {
      telemetry.emit('auth:audit_log', {
        userId: req.auth.userId,
        role: req.auth.role,
        method: req.method,
        path: req.path,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        timestamp,
        traceId,
      });
    }

    next();
  };
}

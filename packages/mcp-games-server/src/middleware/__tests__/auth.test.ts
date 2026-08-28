import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock telemetry to avoid side effects
vi.mock('../../observability/index.js', () => ({
  telemetry: {
    emit: vi.fn(),
  },
}));

// Mock SelfAwareAgent
vi.mock('@omnigents/tier0-runtime', () => ({
  SelfAwareAgent: class {},
}));

import { JWTHandler } from '../../auth/jwt-handler.js';
import {
  createAuthMiddleware,
  createRBACMiddleware,
  createScopeMiddleware,
  createAuditMiddleware,
  type AuthenticatedRequest,
} from '../auth.js';

function mockRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('JWTHandler', () => {
  const handler = new JWTHandler('test-access-secret', 'test-refresh-secret');

  it('generates and validates an access token', async () => {
    const token = await handler.generateAccessToken('user-1', 'admin', ['read', 'write'], 'trace-1');
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');

    const payload = await handler.validateToken(token, 'trace-2');
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('admin');
    expect(payload.scopes).toEqual(['read', 'write']);
  });

  it('rejects invalid tokens', async () => {
    await expect(handler.validateToken('invalid-token', 'trace-3')).rejects.toThrow();
  });

  it('rejects tampered tokens', async () => {
    const token = await handler.generateAccessToken('user-2', 'player', [], 'trace-4');
    const tampered = token.slice(0, -5) + 'XXXXX';
    await expect(handler.validateToken(tampered, 'trace-5')).rejects.toThrow();
  });

  it('blacklists revoked tokens', async () => {
    const token = await handler.generateAccessToken('user-3', 'player', [], 'trace-6');
    const payload = await handler.validateToken(token, 'trace-7');
    await handler.revokeToken(payload.jti, 'trace-8');
    await expect(handler.validateToken(token, 'trace-9')).rejects.toThrow('revoked');
  });

  it('refreshes access token with rotation', async () => {
    const refreshToken = await handler.generateRefreshToken('user-4', 'trace-10');
    const pair = await handler.refreshAccessToken(refreshToken, 'trace-11');
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    expect(pair.accessToken).not.toBe(refreshToken);
    expect(pair.refreshToken).not.toBe(refreshToken);
  });

  it('rejects insecure defaults in production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createJWTHandler } = require('../../auth/jwt-handler.js');
      createJWTHandler('default-access-secret', 'default-refresh-secret');
    }).toThrow();
    process.env.NODE_ENV = origEnv;
  });
});

describe('createAuthMiddleware', () => {
  const handler = new JWTHandler('test-access-secret', 'test-refresh-secret');
  const authMiddleware = createAuthMiddleware(handler);

  it('returns 401 when no Authorization header', async () => {
    const req = { headers: {} } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is not Bearer', async () => {
    const req = { headers: { authorization: 'Basic abc123' } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid token', async () => {
    const req = { headers: { authorization: 'Bearer invalid-token' } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and attaches auth context for valid token', async () => {
    const token = await handler.generateAccessToken('user-99', 'admin', ['read', 'write'], 'trace');
    const req = {
      headers: { authorization: `Bearer ${token}`, 'x-trace-id': 'trace-99' },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toBeDefined();
    expect(req.auth!.userId).toBe('user-99');
    expect(req.auth!.role).toBe('admin');
    expect(req.auth!.scopes).toEqual(['read', 'write']);
  });
});

describe('createRBACMiddleware', () => {
  it('returns 401 when no auth context', () => {
    const rbac = createRBACMiddleware(['admin']);
    const req = { headers: {} } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    rbac(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when role not allowed', () => {
    const rbac = createRBACMiddleware(['admin']);
    const req = {
      headers: {},
      auth: { userId: 'u1', role: 'player', scopes: [], tokenId: 't1' },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    rbac(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when role is allowed', () => {
    const rbac = createRBACMiddleware(['admin', 'developer']);
    const req = {
      headers: {},
      auth: { userId: 'u1', role: 'developer', scopes: [], tokenId: 't1' },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    rbac(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('createScopeMiddleware', () => {
  it('returns 403 when required scope is missing', () => {
    const scopeMiddleware = createScopeMiddleware(['tools:execute']);
    const req = {
      headers: {},
      auth: { userId: 'u1', role: 'player', scopes: ['games:read'], tokenId: 't1' },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    scopeMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when user has required scope', () => {
    const scopeMiddleware = createScopeMiddleware(['tools:execute', 'games:read']);
    const req = {
      headers: {},
      auth: { userId: 'u1', role: 'player', scopes: ['games:read'], tokenId: 't1' },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    scopeMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('createAuditMiddleware', () => {
  it('calls next() and logs for authenticated requests', () => {
    const auditMiddleware = createAuditMiddleware();
    const req = {
      headers: { 'x-trace-id': 'trace-audit' },
      auth: { userId: 'u1', role: 'admin', scopes: [], tokenId: 't1' },
      method: 'GET',
      path: '/api/game',
      ip: '127.0.0.1',
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = mockNext();

    auditMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

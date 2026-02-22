import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface JWTPayload {
  sub: string; // user ID
  role: 'admin' | 'developer' | 'player' | 'readonly';
  scopes: string[]; // ['agents:read', 'tools:execute', 'games:create']
  iat: number; // issued at
  exp: number; // expiration
  jti: string; // JWT ID (for blacklisting)
}

export interface AuthContext {
  userId: string;
  role: string;
  scopes: string[];
  tokenId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ═══════════════════════════════════════════════════════════
// JWT HANDLER
// ═══════════════════════════════════════════════════════════

export class JWTHandler {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry = 15 * 60; // 15 minutes in seconds
  private refreshTokenExpiry = 7 * 24 * 60 * 60; // 7 days in seconds
  private agent: SelfAwareAgent | null;
  private blacklistedTokens: Set<string> = new Set(); // In-memory (should use Redis in production)

  constructor(accessSecret: string, refreshSecret: string, agent?: SelfAwareAgent) {
    this.accessTokenSecret = accessSecret;
    this.refreshTokenSecret = refreshSecret;
    this.agent = agent || null;
  }

  /**
   * Generate access token (short-lived, 15 minutes)
   */
  async generateAccessToken(
    userId: string,
    role: string,
    scopes: string[],
    traceId: string
  ): Promise<string> {
    const start = Date.now();
    try {
      const jti = uuidv4();
      const payload: JWTPayload = {
        sub: userId,
        role: role as any,
        scopes,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.accessTokenExpiry,
        jti,
      };

      const token = jwt.sign(payload, this.accessTokenSecret, { algorithm: 'HS256' });

      const duration = Date.now() - start;
      if (this.agent) {
        telemetry.emit('auth:generate_access_token:success', {
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('auth:access_token:generated', { userId, role, scopes, traceId });
      return token;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        telemetry.emit('auth:generate_access_token:error', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs: duration,
          traceId,
        });
      }
      throw error;
    }
  }

  /**
   * Generate refresh token (long-lived, 7 days)
   */
  async generateRefreshToken(userId: string, traceId: string): Promise<string> {
    const start = Date.now();
    try {
      const jti = uuidv4();
      const payload: Partial<JWTPayload> = {
        sub: userId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.refreshTokenExpiry,
        jti,
      };

      const token = jwt.sign(payload, this.refreshTokenSecret, { algorithm: 'HS256' });

      const duration = Date.now() - start;
      if (this.agent) {
        telemetry.emit('auth:generate_refresh_token:success', {
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('auth:refresh_token:generated', { userId, traceId });
      return token;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        telemetry.emit('auth:generate_refresh_token:error', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs: duration,
          traceId,
        });
      }
      throw error;
    }
  }

  /**
   * Validate and decode token
   */
  async validateToken(token: string, traceId: string): Promise<JWTPayload> {
    const start = Date.now();
    try {
      // Check if token is blacklisted
      const decoded = jwt.decode(token) as JWTPayload;
      if (decoded && this.isTokenBlacklisted(decoded.jti)) {
        throw new Error('Token has been revoked');
      }

      const payload = jwt.verify(token, this.accessTokenSecret, {
        algorithms: ['HS256'],
      }) as JWTPayload;

      const duration = Date.now() - start;
      if (this.agent) {
        telemetry.emit('auth:validate_token:success', {
          durationMs: duration,
          traceId,
        });
      }

      return payload;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        telemetry.emit('auth:validate_token:error', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs: duration,
          traceId,
        });
      }
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string, traceId: string): Promise<TokenPair> {
    const start = Date.now();
    try {
      const payload = jwt.verify(refreshToken, this.refreshTokenSecret, {
        algorithms: ['HS256'],
      }) as JWTPayload;

      // Generate new access token (keep same role/scopes)
      const newAccessToken = await this.generateAccessToken(
        payload.sub,
        payload.role || 'player',
        payload.scopes || [],
        traceId
      );

      // Generate new refresh token (rotation)
      const newRefreshToken = await this.generateRefreshToken(payload.sub, traceId);

      // Revoke old refresh token
      await this.revokeToken(payload.jti, traceId);

      const duration = Date.now() - start;
      if (this.agent) {
        telemetry.emit('auth:refresh_token:success', {
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('auth:token_refreshed', { userId: payload.sub, traceId });
      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        telemetry.emit('auth:refresh_token:error', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs: duration,
          traceId,
        });
      }
      throw error;
    }
  }

  /**
   * Revoke token (add to blacklist)
   */
  async revokeToken(tokenId: string, traceId: string): Promise<void> {
    this.blacklistedTokens.add(tokenId);
    telemetry.emit('auth:token_revoked', { tokenId, traceId });
  }

  /**
   * Check if token is blacklisted
   */
  isTokenBlacklisted(tokenId: string): boolean {
    return this.blacklistedTokens.has(tokenId);
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════

export function createJWTHandler(
  accessSecret: string = process.env.JWT_ACCESS_SECRET || 'default-access-secret',
  refreshSecret: string = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
  agent?: SelfAwareAgent
): JWTHandler {
  return new JWTHandler(accessSecret, refreshSecret, agent);
}

export const defaultJWTHandler = createJWTHandler();

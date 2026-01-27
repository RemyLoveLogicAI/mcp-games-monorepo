/**
 * MCP Authentication Providers
 *
 * Pluggable authentication system supporting multiple auth methods:
 * - OAuth 2.0 with automatic token refresh
 * - API Key authentication
 * - Bearer token authentication
 * - Basic authentication
 * - Custom header-based authentication
 */

import type {
  AuthProvider,
  AuthProviderType,
  AuthCredentials,
  OAuthCredentials,
} from 'shared-types';

/**
 * Abstract base class for authentication providers
 */
export abstract class BaseAuthProvider implements AuthProvider {
  abstract type: AuthProviderType;
  abstract name: string;
  abstract getCredentials(): Promise<AuthCredentials>;

  refreshCredentials?(): Promise<AuthCredentials>;
  isExpired?(): boolean;
}

/**
 * API Key authentication provider
 */
export class APIKeyAuthProvider extends BaseAuthProvider {
  type: AuthProviderType = 'api_key';
  name: string;
  private apiKey: string;
  private headerName: string;

  constructor(name: string, apiKey: string, headerName = 'X-API-Key') {
    super();
    this.name = name;
    this.apiKey = apiKey;
    this.headerName = headerName;
  }

  async getCredentials(): Promise<AuthCredentials> {
    return {
      type: 'api_key',
      apiKey: this.apiKey,
      customHeaders: {
        [this.headerName]: this.apiKey,
      },
    };
  }
}

/**
 * Bearer token authentication provider
 */
export class BearerTokenAuthProvider extends BaseAuthProvider {
  type: AuthProviderType = 'bearer_token';
  name: string;
  private token: string;
  private expiresAt?: Date;

  constructor(name: string, token: string, expiresAt?: Date) {
    super();
    this.name = name;
    this.token = token;
    this.expiresAt = expiresAt;
  }

  async getCredentials(): Promise<AuthCredentials> {
    return {
      type: 'bearer_token',
      token: this.token,
      customHeaders: {
        Authorization: `Bearer ${this.token}`,
      },
    };
  }

  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() >= this.expiresAt;
  }

  updateToken(token: string, expiresAt?: Date): void {
    this.token = token;
    this.expiresAt = expiresAt;
  }
}

/**
 * OAuth 2.0 authentication provider with automatic token refresh
 */
export class OAuth2AuthProvider extends BaseAuthProvider {
  type: AuthProviderType = 'oauth2';
  name: string;
  private credentials: OAuthCredentials;
  private refreshCallback?: () => Promise<OAuthCredentials>;
  private refreshBufferMs: number;

  constructor(
    name: string,
    credentials: OAuthCredentials,
    options?: {
      refreshCallback?: () => Promise<OAuthCredentials>;
      refreshBufferMs?: number;
    }
  ) {
    super();
    this.name = name;
    this.credentials = credentials;
    this.refreshCallback = options?.refreshCallback;
    this.refreshBufferMs = options?.refreshBufferMs ?? 60000; // 1 minute buffer
  }

  async getCredentials(): Promise<AuthCredentials> {
    // Auto-refresh if token is about to expire
    if (this.shouldRefresh() && this.refreshCallback) {
      await this.refreshCredentials();
    }

    return {
      type: 'oauth2',
      oauth: this.credentials,
      customHeaders: {
        Authorization: `${this.credentials.tokenType} ${this.credentials.accessToken}`,
      },
    };
  }

  async refreshCredentials(): Promise<AuthCredentials> {
    if (!this.refreshCallback) {
      throw new Error('No refresh callback configured');
    }

    this.credentials = await this.refreshCallback();
    return this.getCredentials();
  }

  isExpired(): boolean {
    if (!this.credentials.expiresAt) return false;
    return new Date() >= new Date(this.credentials.expiresAt);
  }

  private shouldRefresh(): boolean {
    if (!this.credentials.expiresAt) return false;
    const expiresAt = new Date(this.credentials.expiresAt);
    const refreshAt = new Date(expiresAt.getTime() - this.refreshBufferMs);
    return new Date() >= refreshAt;
  }

  getAccessToken(): string {
    return this.credentials.accessToken;
  }

  getRefreshToken(): string | undefined {
    return this.credentials.refreshToken;
  }
}

/**
 * Basic authentication provider
 */
export class BasicAuthProvider extends BaseAuthProvider {
  type: AuthProviderType = 'basic';
  name: string;
  private username: string;
  private password: string;

  constructor(name: string, username: string, password: string) {
    super();
    this.name = name;
    this.username = username;
    this.password = password;
  }

  async getCredentials(): Promise<AuthCredentials> {
    const encoded = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return {
      type: 'basic',
      username: this.username,
      password: this.password,
      customHeaders: {
        Authorization: `Basic ${encoded}`,
      },
    };
  }
}

/**
 * Custom header-based authentication provider
 */
export class CustomAuthProvider extends BaseAuthProvider {
  type: AuthProviderType = 'custom';
  name: string;
  private headers: Record<string, string>;
  private headerGenerator?: () => Promise<Record<string, string>>;

  constructor(
    name: string,
    headers: Record<string, string>,
    headerGenerator?: () => Promise<Record<string, string>>
  ) {
    super();
    this.name = name;
    this.headers = headers;
    this.headerGenerator = headerGenerator;
  }

  async getCredentials(): Promise<AuthCredentials> {
    const dynamicHeaders = this.headerGenerator
      ? await this.headerGenerator()
      : {};

    return {
      type: 'custom',
      customHeaders: {
        ...this.headers,
        ...dynamicHeaders,
      },
    };
  }

  updateHeaders(headers: Record<string, string>): void {
    this.headers = { ...this.headers, ...headers };
  }
}

/**
 * Authentication provider registry for managing multiple providers
 */
export class AuthProviderRegistry {
  private providers: Map<string, AuthProvider> = new Map();

  /**
   * Register an authentication provider
   */
  register(serverId: string, provider: AuthProvider): void {
    this.providers.set(serverId, provider);
  }

  /**
   * Unregister an authentication provider
   */
  unregister(serverId: string): boolean {
    return this.providers.delete(serverId);
  }

  /**
   * Get an authentication provider by server ID
   */
  get(serverId: string): AuthProvider | undefined {
    return this.providers.get(serverId);
  }

  /**
   * Check if a provider is registered
   */
  has(serverId: string): boolean {
    return this.providers.has(serverId);
  }

  /**
   * Get credentials for a server
   */
  async getCredentials(serverId: string): Promise<AuthCredentials | null> {
    const provider = this.providers.get(serverId);
    if (!provider) return null;

    // Check if credentials need refresh
    if (provider.isExpired?.() && provider.refreshCredentials) {
      return provider.refreshCredentials();
    }

    return provider.getCredentials();
  }

  /**
   * Get all registered server IDs
   */
  getRegisteredServers(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
  }
}

/**
 * Create a pre-configured auth provider for common MCP servers
 */
export function createAuthProvider(
  serverId: string,
  config: AuthProviderConfig
): AuthProvider {
  switch (config.type) {
    case 'api_key':
      return new APIKeyAuthProvider(
        serverId,
        config.apiKey!,
        config.headerName
      );

    case 'bearer_token':
      return new BearerTokenAuthProvider(
        serverId,
        config.token!,
        config.expiresAt ? new Date(config.expiresAt) : undefined
      );

    case 'oauth2':
      return new OAuth2AuthProvider(
        serverId,
        config.oauth!,
        {
          refreshCallback: config.refreshCallback,
          refreshBufferMs: config.refreshBufferMs,
        }
      );

    case 'basic':
      return new BasicAuthProvider(
        serverId,
        config.username!,
        config.password!
      );

    case 'custom':
      return new CustomAuthProvider(
        serverId,
        config.headers ?? {},
        config.headerGenerator
      );

    default:
      throw new Error(`Unknown auth provider type: ${config.type}`);
  }
}

/**
 * Configuration for creating auth providers
 */
export interface AuthProviderConfig {
  type: AuthProviderType;
  apiKey?: string;
  headerName?: string;
  token?: string;
  expiresAt?: string;
  oauth?: OAuthCredentials;
  refreshCallback?: () => Promise<OAuthCredentials>;
  refreshBufferMs?: number;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  headerGenerator?: () => Promise<Record<string, string>>;
}

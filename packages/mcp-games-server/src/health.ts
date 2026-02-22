import { Router, Request, Response } from 'express';
import { telemetry } from './observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    memory: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'up' | 'down' | 'degraded';
  latencyMs: number;
  message?: string;
}

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK MANAGER
// ═══════════════════════════════════════════════════════════

export class HealthManager {
  private startTime: number = Date.now();
  private lastHealthStatus: HealthStatus | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private db: any,
    private redis: any
  ) {}

  /**
   * Start periodic health checks
   */
  startHealthCheckMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        telemetry.emit('health:check_error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop health check monitoring
   */
  stopHealthCheckMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  /**
   * Perform full health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = Date.now() - this.startTime;

    // Check database
    const databaseCheck = await this.checkDatabase();

    // Check Redis
    const redisCheck = await this.checkRedis();

    // Check memory
    const memoryCheck = this.checkMemory();

    // Determine overall status
    const isHealthy = databaseCheck.status === 'up' && redisCheck.status === 'up' && memoryCheck.status === 'up';
    const status = isHealthy ? 'healthy' : 'degraded';

    const healthStatus: HealthStatus = {
      status,
      timestamp,
      uptime,
      version: '1.0.0',
      checks: {
        database: databaseCheck,
        redis: redisCheck,
        memory: memoryCheck,
      },
    };

    this.lastHealthStatus = healthStatus;

    telemetry.emit('health:check_completed', {
      status,
      uptime,
      databaseStatus: databaseCheck.status,
      redisStatus: redisCheck.status,
    });

    return healthStatus;
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.db.query('SELECT 1');
      return {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check memory usage
   */
  private checkMemory(): HealthCheck {
    const usage = process.memoryUsage();
    const heapUsagePercent = (usage.heapUsed / usage.heapTotal) * 100;

    let status: 'up' | 'down' | 'degraded' = 'up';
    if (heapUsagePercent > 90) {
      status = 'down'; // Critical memory pressure
    } else if (heapUsagePercent > 75) {
      status = 'degraded'; // Warning level
    }

    return {
      status,
      latencyMs: 0,
      message: `Heap: ${(heapUsagePercent).toFixed(1)}% used`,
    };
  }

  /**
   * Get last health status (for quick checks)
   */
  getLastHealthStatus(): HealthStatus | null {
    return this.lastHealthStatus;
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK ROUTER
// ═══════════════════════════════════════════════════════════

export function createHealthRouter(healthManager: HealthManager): Router {
  const router = Router();

  /**
   * Liveness Probe: Is the service alive?
   * Used by Kubernetes to determine if pod should be restarted
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const status = healthManager.getLastHealthStatus();

      if (!status) {
        // First check
        await healthManager.performHealthCheck();
      }

      const currentStatus = healthManager.getLastHealthStatus();

      if (currentStatus?.status === 'healthy' || currentStatus?.status === 'degraded') {
        return res.status(200).json({
          status: 'ok',
          uptime: healthManager.getUptime(),
        });
      }

      return res.status(503).json({
        status: 'error',
        message: 'Service unhealthy',
      });
    } catch (error) {
      return res.status(503).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Readiness Probe: Is the service ready to accept traffic?
   * Used by Kubernetes load balancer to determine if pod should receive traffic
   */
  router.get('/ready', async (req: Request, res: Response) => {
    try {
      const status = await healthManager.performHealthCheck();

      if (status.status === 'healthy') {
        return res.status(200).json({
          status: 'ready',
          checks: status.checks,
        });
      }

      if (status.status === 'degraded') {
        // Still ready, but log the degradation
        telemetry.emit('health:degraded', {
          checks: status.checks,
        });

        return res.status(200).json({
          status: 'ready_degraded',
          checks: status.checks,
        });
      }

      return res.status(503).json({
        status: 'not_ready',
        checks: status.checks,
      });
    } catch (error) {
      return res.status(503).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Detailed Health Status
   * Full diagnostic information for monitoring
   */
  router.get('/health/status', async (req: Request, res: Response) => {
    try {
      const status = await healthManager.performHealthCheck();
      return res.status(200).json(status);
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════

export function createHealthManager(db: any, redis: any): HealthManager {
  return new HealthManager(db, redis);
}

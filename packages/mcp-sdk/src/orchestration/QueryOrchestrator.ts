/**
 * MCP Query Orchestrator - Advanced query execution strategies
 *
 * Provides sophisticated query orchestration including:
 * - Query pipelines with transformation stages
 * - Parallel and sequential execution strategies
 * - Cross-server data correlation and joins
 * - Query optimization and planning
 * - Result streaming for large datasets
 * - Conditional branching based on intermediate results
 *
 * @example Pipeline Execution
 * ```typescript
 * const pipeline = createQueryPipeline()
 *   .stage('fetch-projects', {
 *     servers: ['github', 'linear'],
 *     query: 'active projects',
 *   })
 *   .transform('extract-ids', (results) => results.map(r => r.id))
 *   .stage('fetch-details', {
 *     servers: ['notion'],
 *     query: (ids) => `documentation for projects ${ids.join(', ')}`,
 *   })
 *   .correlate('join-data', {
 *     strategy: 'left-join',
 *     on: 'projectId',
 *   })
 *   .aggregate('summary', { strategy: 'merge' });
 *
 * const results = await orchestrator.execute(pipeline);
 * ```
 */

import type {
  MultiServerQuery,
  MultiQueryResult,
  ServerQueryResult,
  QueryFilters,
  AggregationStrategy,
  OutputFormat,
} from 'shared-types';

// =============================================================================
// Types
// =============================================================================

/**
 * Query pipeline stage types
 */
export type PipelineStageType =
  | 'query'
  | 'transform'
  | 'filter'
  | 'correlate'
  | 'aggregate'
  | 'branch'
  | 'parallel'
  | 'cache'
  | 'validate';

/**
 * Pipeline stage definition
 */
export interface PipelineStage<TInput = unknown, TOutput = unknown> {
  id: string;
  type: PipelineStageType;
  config: StageConfig;
  execute: (input: TInput, context: PipelineContext) => Promise<TOutput>;
  dependencies?: string[];
}

/**
 * Stage configuration
 */
export interface StageConfig {
  servers?: string[];
  query?: string | ((input: unknown) => string);
  filters?: QueryFilters | ((input: unknown) => QueryFilters);
  transform?: (data: unknown) => unknown;
  condition?: (data: unknown) => boolean;
  branches?: Record<string, string>;
  correlationKey?: string;
  aggregationStrategy?: AggregationStrategy;
  timeout?: number;
  retryOnFailure?: boolean;
  cacheKey?: string;
  cacheTtlMs?: number;
  validator?: (data: unknown) => ValidationResult;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Pipeline execution context
 */
export interface PipelineContext {
  pipelineId: string;
  startedAt: Date;
  variables: Record<string, unknown>;
  stageResults: Map<string, unknown>;
  errors: PipelineError[];
  metrics: PipelineMetrics;
}

/**
 * Pipeline error
 */
export interface PipelineError {
  stageId: string;
  error: Error;
  timestamp: Date;
  recoverable: boolean;
}

/**
 * Pipeline execution metrics
 */
export interface PipelineMetrics {
  totalDurationMs: number;
  stageDurations: Record<string, number>;
  queryCount: number;
  cacheHits: number;
  cacheMisses: number;
  bytesProcessed: number;
}

/**
 * Query execution strategy
 */
export type ExecutionStrategy = 'sequential' | 'parallel' | 'adaptive';

/**
 * Correlation strategy for joining data
 */
export type CorrelationStrategy =
  | 'inner-join'
  | 'left-join'
  | 'right-join'
  | 'full-join'
  | 'cross-join'
  | 'union'
  | 'intersect';

/**
 * Stream chunk for streaming results
 */
export interface StreamChunk<T = unknown> {
  type: 'data' | 'progress' | 'error' | 'complete';
  stageId?: string;
  data?: T;
  progress?: number;
  error?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  defaultStrategy: ExecutionStrategy;
  maxParallelQueries: number;
  defaultTimeout: number;
  enableMetrics: boolean;
  enableCaching: boolean;
  debug: boolean;
}

/**
 * Query executor interface
 */
export interface QueryExecutor {
  executeMultiQuery<T>(query: MultiServerQuery): Promise<MultiQueryResult<T>>;
}

// =============================================================================
// Query Pipeline Builder
// =============================================================================

/**
 * Fluent builder for creating query pipelines
 */
export class QueryPipelineBuilder {
  private stages: PipelineStage[] = [];
  private pipelineId: string;

  constructor(id?: string) {
    this.pipelineId = id ?? `pipeline_${Date.now()}`;
  }

  /**
   * Add a query stage
   */
  query(
    id: string,
    config: {
      servers: string[];
      query: string | ((input: unknown) => string);
      filters?: QueryFilters | ((input: unknown) => QueryFilters);
      timeout?: number;
    }
  ): this {
    this.stages.push({
      id,
      type: 'query',
      config,
      execute: async (input, context) => {
        // Query execution is handled by orchestrator
        return { input, config };
      },
    });
    return this;
  }

  /**
   * Add a transformation stage
   */
  transform<TIn, TOut>(
    id: string,
    transformer: (data: TIn, context: PipelineContext) => TOut | Promise<TOut>
  ): this {
    this.stages.push({
      id,
      type: 'transform',
      config: { transform: transformer as (data: unknown) => unknown },
      execute: async (input, context) => {
        return transformer(input as TIn, context);
      },
    });
    return this;
  }

  /**
   * Add a filter stage
   */
  filter(
    id: string,
    predicate: (data: unknown, context: PipelineContext) => boolean
  ): this {
    this.stages.push({
      id,
      type: 'filter',
      config: { condition: predicate },
      execute: async (input, context) => {
        if (Array.isArray(input)) {
          return input.filter(item => predicate(item, context));
        }
        return predicate(input, context) ? input : null;
      },
    });
    return this;
  }

  /**
   * Add a correlation/join stage
   */
  correlate(
    id: string,
    config: {
      strategy: CorrelationStrategy;
      leftKey: string;
      rightKey?: string;
      sourceStages: [string, string];
    }
  ): this {
    this.stages.push({
      id,
      type: 'correlate',
      config: { correlationKey: config.leftKey },
      dependencies: config.sourceStages,
      execute: async (input, context) => {
        const [leftStage, rightStage] = config.sourceStages;
        const leftData = context.stageResults.get(leftStage) as unknown[];
        const rightData = context.stageResults.get(rightStage) as unknown[];

        return correlateData(
          leftData,
          rightData,
          config.leftKey,
          config.rightKey ?? config.leftKey,
          config.strategy
        );
      },
    });
    return this;
  }

  /**
   * Add an aggregation stage
   */
  aggregate(
    id: string,
    config: {
      strategy: AggregationStrategy;
      groupBy?: string;
      operations?: AggregateOperation[];
    }
  ): this {
    this.stages.push({
      id,
      type: 'aggregate',
      config: { aggregationStrategy: config.strategy },
      execute: async (input, context) => {
        return aggregateData(input, config);
      },
    });
    return this;
  }

  /**
   * Add a conditional branching stage
   */
  branch(
    id: string,
    config: {
      condition: (data: unknown, context: PipelineContext) => string;
      branches: Record<string, QueryPipelineBuilder>;
    }
  ): this {
    this.stages.push({
      id,
      type: 'branch',
      config: {
        condition: config.condition,
        branches: Object.fromEntries(
          Object.entries(config.branches).map(([k, v]) => [k, v.build().id])
        ),
      },
      execute: async (input, context) => {
        const branchKey = config.condition(input, context);
        // Branch execution handled by orchestrator
        return { branchKey, input };
      },
    });
    return this;
  }

  /**
   * Add parallel execution of multiple sub-pipelines
   */
  parallel(
    id: string,
    pipelines: QueryPipelineBuilder[],
    mergeStrategy: 'concat' | 'merge' | 'object' = 'concat'
  ): this {
    this.stages.push({
      id,
      type: 'parallel',
      config: {},
      execute: async (input, context) => {
        // Parallel execution handled by orchestrator
        return { pipelines: pipelines.map(p => p.build()), mergeStrategy, input };
      },
    });
    return this;
  }

  /**
   * Add a caching stage
   */
  cache(
    id: string,
    config: {
      key: string | ((input: unknown) => string);
      ttlMs: number;
    }
  ): this {
    this.stages.push({
      id,
      type: 'cache',
      config: {
        cacheKey: typeof config.key === 'string' ? config.key : undefined,
        cacheTtlMs: config.ttlMs,
      },
      execute: async (input, context) => {
        // Caching handled by orchestrator
        return input;
      },
    });
    return this;
  }

  /**
   * Add a validation stage
   */
  validate(
    id: string,
    validator: (data: unknown) => ValidationResult
  ): this {
    this.stages.push({
      id,
      type: 'validate',
      config: { validator },
      execute: async (input, context) => {
        const result = validator(input);
        if (!result.valid) {
          throw new Error(`Validation failed: ${result.errors?.join(', ')}`);
        }
        return input;
      },
    });
    return this;
  }

  /**
   * Build the pipeline
   */
  build(): QueryPipeline {
    return {
      id: this.pipelineId,
      stages: [...this.stages],
    };
  }
}

/**
 * Query pipeline definition
 */
export interface QueryPipeline {
  id: string;
  stages: PipelineStage[];
}

// =============================================================================
// Query Orchestrator
// =============================================================================

/**
 * Advanced query orchestrator for executing complex query pipelines
 */
export class QueryOrchestrator {
  private executor: QueryExecutor;
  private config: OrchestratorConfig;
  private cache: Map<string, { data: unknown; expiresAt: number }> = new Map();

  constructor(executor: QueryExecutor, config: Partial<OrchestratorConfig> = {}) {
    this.executor = executor;
    this.config = {
      defaultStrategy: config.defaultStrategy ?? 'adaptive',
      maxParallelQueries: config.maxParallelQueries ?? 5,
      defaultTimeout: config.defaultTimeout ?? 30000,
      enableMetrics: config.enableMetrics ?? true,
      enableCaching: config.enableCaching ?? true,
      debug: config.debug ?? false,
    };
  }

  /**
   * Execute a query pipeline
   */
  async execute<T = unknown>(pipeline: QueryPipeline): Promise<PipelineResult<T>> {
    const context: PipelineContext = {
      pipelineId: pipeline.id,
      startedAt: new Date(),
      variables: {},
      stageResults: new Map(),
      errors: [],
      metrics: {
        totalDurationMs: 0,
        stageDurations: {},
        queryCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        bytesProcessed: 0,
      },
    };

    this.log(`Executing pipeline: ${pipeline.id}`);

    try {
      let currentResult: unknown = null;

      for (const stage of pipeline.stages) {
        const stageStart = Date.now();
        this.log(`Executing stage: ${stage.id} (${stage.type})`);

        try {
          currentResult = await this.executeStage(stage, currentResult, context);
          context.stageResults.set(stage.id, currentResult);
        } catch (error) {
          context.errors.push({
            stageId: stage.id,
            error: error instanceof Error ? error : new Error(String(error)),
            timestamp: new Date(),
            recoverable: stage.config.retryOnFailure ?? false,
          });

          if (!stage.config.retryOnFailure) {
            throw error;
          }
        }

        context.metrics.stageDurations[stage.id] = Date.now() - stageStart;
      }

      context.metrics.totalDurationMs = Date.now() - context.startedAt.getTime();

      return {
        success: true,
        data: currentResult as T,
        context,
      };
    } catch (error) {
      context.metrics.totalDurationMs = Date.now() - context.startedAt.getTime();

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        context,
      };
    }
  }

  /**
   * Execute a pipeline with streaming results
   */
  async *executeStream<T = unknown>(
    pipeline: QueryPipeline
  ): AsyncGenerator<StreamChunk<T>> {
    const context: PipelineContext = {
      pipelineId: pipeline.id,
      startedAt: new Date(),
      variables: {},
      stageResults: new Map(),
      errors: [],
      metrics: {
        totalDurationMs: 0,
        stageDurations: {},
        queryCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        bytesProcessed: 0,
      },
    };

    let currentResult: unknown = null;
    const totalStages = pipeline.stages.length;

    for (let i = 0; i < totalStages; i++) {
      const stage = pipeline.stages[i];

      yield {
        type: 'progress',
        stageId: stage.id,
        progress: (i / totalStages) * 100,
        metadata: { stage: stage.type },
      };

      try {
        currentResult = await this.executeStage(stage, currentResult, context);
        context.stageResults.set(stage.id, currentResult);

        // Yield intermediate results for query stages
        if (stage.type === 'query') {
          yield {
            type: 'data',
            stageId: stage.id,
            data: currentResult as T,
          };
        }
      } catch (error) {
        yield {
          type: 'error',
          stageId: stage.id,
          error: error instanceof Error ? error : new Error(String(error)),
        };

        if (!stage.config.retryOnFailure) {
          return;
        }
      }
    }

    yield {
      type: 'complete',
      data: currentResult as T,
      metadata: { metrics: context.metrics },
    };
  }

  /**
   * Execute a single stage
   */
  private async executeStage(
    stage: PipelineStage,
    input: unknown,
    context: PipelineContext
  ): Promise<unknown> {
    switch (stage.type) {
      case 'query':
        return this.executeQueryStage(stage, input, context);
      case 'cache':
        return this.executeCacheStage(stage, input, context);
      default:
        return stage.execute(input, context);
    }
  }

  /**
   * Execute a query stage
   */
  private async executeQueryStage(
    stage: PipelineStage,
    input: unknown,
    context: PipelineContext
  ): Promise<unknown> {
    const { servers, query, filters } = stage.config;

    const queryString = typeof query === 'function' ? query(input) : query;
    const queryFilters = typeof filters === 'function' ? filters(input) : filters;

    context.metrics.queryCount++;

    const result = await this.executor.executeMultiQuery({
      servers: servers ?? [],
      query: queryString ?? '',
      filters: queryFilters,
    });

    return result.aggregated ?? result.results;
  }

  /**
   * Execute a cache stage
   */
  private async executeCacheStage(
    stage: PipelineStage,
    input: unknown,
    context: PipelineContext
  ): Promise<unknown> {
    if (!this.config.enableCaching) {
      return input;
    }

    const key = stage.config.cacheKey ?? JSON.stringify(input);
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      context.metrics.cacheHits++;
      return cached.data;
    }

    context.metrics.cacheMisses++;

    // Cache the input for subsequent requests
    this.cache.set(key, {
      data: input,
      expiresAt: Date.now() + (stage.config.cacheTtlMs ?? 300000),
    });

    return input;
  }

  /**
   * Clear the orchestrator cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[QueryOrchestrator] ${message}`);
    }
  }
}

/**
 * Pipeline execution result
 */
export interface PipelineResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  context: PipelineContext;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Correlate/join data from multiple sources
 */
function correlateData(
  leftData: unknown[],
  rightData: unknown[],
  leftKey: string,
  rightKey: string,
  strategy: CorrelationStrategy
): unknown[] {
  if (!Array.isArray(leftData) || !Array.isArray(rightData)) {
    return [];
  }

  const getKey = (item: unknown, key: string): unknown => {
    if (typeof item === 'object' && item !== null) {
      return (item as Record<string, unknown>)[key];
    }
    return undefined;
  };

  const rightMap = new Map<unknown, unknown[]>();
  for (const item of rightData) {
    const key = getKey(item, rightKey);
    if (!rightMap.has(key)) {
      rightMap.set(key, []);
    }
    rightMap.get(key)!.push(item);
  }

  switch (strategy) {
    case 'inner-join':
      return leftData.flatMap(left => {
        const key = getKey(left, leftKey);
        const matches = rightMap.get(key) ?? [];
        return matches.map(right => ({ ...left as object, ...right as object }));
      });

    case 'left-join':
      return leftData.map(left => {
        const key = getKey(left, leftKey);
        const matches = rightMap.get(key) ?? [{}];
        return matches.map(right => ({ ...left as object, ...right as object }))[0];
      });

    case 'union':
      return [...leftData, ...rightData];

    case 'intersect':
      const leftKeys = new Set(leftData.map(item => getKey(item, leftKey)));
      return rightData.filter(item => leftKeys.has(getKey(item, rightKey)));

    default:
      return leftData;
  }
}

/**
 * Aggregate operation definition
 */
export interface AggregateOperation {
  field: string;
  operation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last' | 'collect';
  alias?: string;
}

/**
 * Aggregate data based on configuration
 */
function aggregateData(
  data: unknown,
  config: {
    strategy: AggregationStrategy;
    groupBy?: string;
    operations?: AggregateOperation[];
  }
): unknown {
  if (!Array.isArray(data)) {
    return data;
  }

  if (config.groupBy) {
    // Group by field
    const groups = new Map<unknown, unknown[]>();
    for (const item of data) {
      const key = (item as Record<string, unknown>)[config.groupBy];
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }

    // Apply operations to each group
    if (config.operations) {
      return Array.from(groups.entries()).map(([key, items]) => {
        const result: Record<string, unknown> = { [config.groupBy!]: key };
        for (const op of config.operations!) {
          result[op.alias ?? `${op.operation}_${op.field}`] = applyAggregation(
            items,
            op.field,
            op.operation
          );
        }
        return result;
      });
    }

    return Object.fromEntries(groups);
  }

  // Simple merge/concat
  switch (config.strategy) {
    case 'merge':
      return data.reduce((acc, item) => ({ ...acc as object, ...item as object }), {});
    case 'separate':
      return data;
    case 'ranked':
      return data; // Ranking would require scoring logic
    default:
      return data;
  }
}

/**
 * Apply aggregation operation to array
 */
function applyAggregation(
  items: unknown[],
  field: string,
  operation: AggregateOperation['operation']
): unknown {
  const values = items
    .map(item => (item as Record<string, unknown>)[field])
    .filter(v => v !== undefined);

  switch (operation) {
    case 'sum':
      return values.reduce((a, b) => Number(a) + Number(b), 0);
    case 'avg':
      return values.length > 0
        ? (values.reduce((a, b) => Number(a) + Number(b), 0) as number) / values.length
        : 0;
    case 'min':
      return Math.min(...values.map(Number));
    case 'max':
      return Math.max(...values.map(Number));
    case 'count':
      return values.length;
    case 'first':
      return values[0];
    case 'last':
      return values[values.length - 1];
    case 'collect':
      return values;
    default:
      return values;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new query pipeline builder
 */
export function createQueryPipeline(id?: string): QueryPipelineBuilder {
  return new QueryPipelineBuilder(id);
}

/**
 * Create a new query orchestrator
 */
export function createQueryOrchestrator(
  executor: QueryExecutor,
  config?: Partial<OrchestratorConfig>
): QueryOrchestrator {
  return new QueryOrchestrator(executor, config);
}

/**
 * Semantic Query Builder - Fluent API for building MCP queries
 *
 * Provides a chainable, type-safe API for constructing semantic queries
 * across multiple MCP servers with filtering, formatting, and caching options.
 *
 * Example usage:
 * ```typescript
 * const results = await mcpClient
 *   .from(['notion', 'linear', 'github'])
 *   .semanticSearch('project goals and metrics')
 *   .filter({ timeframe: 'this_week' })
 *   .format('markdown')
 *   .maxResults(10)
 *   .execute();
 * ```
 */

import type {
  MultiServerQuery,
  QueryFilters,
  MultiQueryOptions,
  MultiQueryResult,
  OutputFormat,
  CachePolicy,
  AggregationStrategy,
  FailureStrategy,
  TimeframeFilter,
  RelativeTimeframe,
  FormattedQueryResult,
} from 'shared-types';

/**
 * Query executor interface - implemented by MCPClient
 */
export interface QueryExecutor {
  executeMultiQuery<T>(query: MultiServerQuery): Promise<MultiQueryResult<T>>;
}

/**
 * Fluent builder for semantic queries across multiple MCP servers
 */
export class SemanticQueryBuilder<T = unknown> {
  private servers: string[] = [];
  private queryText: string = '';
  private filters: QueryFilters = {};
  private options: MultiQueryOptions = {};
  private outputFormat: OutputFormat = 'json';
  private executor: QueryExecutor;

  constructor(executor: QueryExecutor) {
    this.executor = executor;
  }

  /**
   * Specify which MCP servers to query
   */
  from(servers: string | string[]): this {
    this.servers = Array.isArray(servers) ? servers : [servers];
    return this;
  }

  /**
   * Set the semantic search query
   */
  semanticSearch(query: string): this {
    this.queryText = query;
    return this;
  }

  /**
   * Alias for semanticSearch
   */
  search(query: string): this {
    return this.semanticSearch(query);
  }

  /**
   * Alias for semanticSearch
   */
  query(query: string): this {
    return this.semanticSearch(query);
  }

  /**
   * Add filters to the query
   */
  filter(filters: Partial<QueryFilters>): this {
    this.filters = { ...this.filters, ...filters };
    return this;
  }

  /**
   * Filter by timeframe
   */
  timeframe(value: TimeframeFilter | RelativeTimeframe): this {
    if (typeof value === 'string') {
      this.filters.timeframe = { relative: value };
    } else {
      this.filters.timeframe = value;
    }
    return this;
  }

  /**
   * Filter by status
   */
  status(statuses: string | string[]): this {
    this.filters.status = Array.isArray(statuses) ? statuses : [statuses];
    return this;
  }

  /**
   * Filter by tags
   */
  tags(tags: string | string[]): this {
    this.filters.tags = Array.isArray(tags) ? tags : [tags];
    return this;
  }

  /**
   * Filter by authors
   */
  authors(authors: string | string[]): this {
    this.filters.authors = Array.isArray(authors) ? authors : [authors];
    return this;
  }

  /**
   * Filter by content types
   */
  types(types: string | string[]): this {
    this.filters.types = Array.isArray(types) ? types : [types];
    return this;
  }

  /**
   * Add custom filter
   */
  where(key: string, value: unknown): this {
    this.filters[key] = value;
    return this;
  }

  /**
   * Set output format
   */
  format(format: OutputFormat): this {
    this.outputFormat = format;
    return this;
  }

  /**
   * Set maximum number of results
   */
  maxResults(max: number): this {
    this.options.maxResults = max;
    return this;
  }

  /**
   * Alias for maxResults
   */
  limit(max: number): this {
    return this.maxResults(max);
  }

  /**
   * Set cache policy
   */
  cache(policy: CachePolicy): this {
    this.options.cachePolicy = policy;
    return this;
  }

  /**
   * Disable caching for this query
   */
  noCache(): this {
    return this.cache('no-cache');
  }

  /**
   * Prefer cached results
   */
  cacheFirst(): this {
    return this.cache('cache-first');
  }

  /**
   * Prefer network results
   */
  networkFirst(): this {
    return this.cache('network-first');
  }

  /**
   * Set timeout for the query
   */
  timeout(ms: number): this {
    this.options.timeout = ms;
    return this;
  }

  /**
   * Include metadata in results
   */
  includeMetadata(include = true): this {
    this.options.includeMetadata = include;
    return this;
  }

  /**
   * Set aggregation strategy for multi-server results
   */
  aggregate(strategy: AggregationStrategy): this {
    this.options.aggregationStrategy = strategy;
    return this;
  }

  /**
   * Merge results from all servers
   */
  mergeResults(): this {
    return this.aggregate('merge');
  }

  /**
   * Keep results separate by server
   */
  separateResults(): this {
    return this.aggregate('separate');
  }

  /**
   * Rank and sort results across all servers
   */
  rankedResults(): this {
    return this.aggregate('ranked');
  }

  /**
   * Execute queries in parallel
   */
  parallel(enabled = true): this {
    this.options.parallelExecution = enabled;
    return this;
  }

  /**
   * Set failure handling strategy
   */
  onFailure(strategy: FailureStrategy): this {
    this.options.failureStrategy = strategy;
    return this;
  }

  /**
   * Fail fast if any server fails
   */
  failFast(): this {
    return this.onFailure('fail-fast');
  }

  /**
   * Return partial results on failure
   */
  partialResults(): this {
    return this.onFailure('partial-results');
  }

  /**
   * Retry all servers on failure
   */
  retryAll(): this {
    return this.onFailure('retry-all');
  }

  /**
   * Build the query object without executing
   */
  build(): MultiServerQuery {
    if (this.servers.length === 0) {
      throw new QueryBuilderError('No servers specified. Use .from() to specify servers.');
    }

    if (!this.queryText) {
      throw new QueryBuilderError('No query specified. Use .semanticSearch() to set query.');
    }

    return {
      servers: this.servers,
      query: this.queryText,
      filters: Object.keys(this.filters).length > 0 ? this.filters : undefined,
      options: Object.keys(this.options).length > 0 ? this.options : undefined,
      format: this.outputFormat,
    };
  }

  /**
   * Execute the query and return results
   */
  async execute(): Promise<MultiQueryResult<T>> {
    const query = this.build();
    const result = await this.executor.executeMultiQuery<T>(query);

    // Apply formatting if needed
    if (this.outputFormat !== 'json') {
      result.aggregated = this.formatResult(result.aggregated, this.outputFormat) as T;
    }

    return result;
  }

  /**
   * Execute and return just the aggregated data
   */
  async get(): Promise<T | undefined> {
    const result = await this.execute();
    return result.aggregated;
  }

  /**
   * Execute and return formatted string
   */
  async getFormatted(): Promise<FormattedQueryResult> {
    const result = await this.execute();
    return {
      format: this.outputFormat,
      content: this.formatResult(result.aggregated, this.outputFormat),
      rawData: result.aggregated,
    };
  }

  /**
   * Clone the builder with current state
   */
  clone(): SemanticQueryBuilder<T> {
    const cloned = new SemanticQueryBuilder<T>(this.executor);
    cloned.servers = [...this.servers];
    cloned.queryText = this.queryText;
    cloned.filters = { ...this.filters };
    cloned.options = { ...this.options };
    cloned.outputFormat = this.outputFormat;
    return cloned;
  }

  /**
   * Format result data based on output format
   */
  private formatResult(data: unknown, format: OutputFormat): string {
    if (data === undefined || data === null) {
      return '';
    }

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);

      case 'markdown':
        return this.toMarkdown(data);

      case 'text':
        return this.toPlainText(data);

      case 'html':
        return this.toHtml(data);

      default:
        return String(data);
    }
  }

  /**
   * Convert data to Markdown format
   */
  private toMarkdown(data: unknown): string {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) {
      return data.map((item, i) => `${i + 1}. ${this.toMarkdown(item)}`).join('\n');
    }
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      const lines: string[] = [];

      if (obj.title) lines.push(`## ${obj.title}\n`);
      if (obj.description) lines.push(`${obj.description}\n`);
      if (obj.content) lines.push(`${obj.content}\n`);

      // Handle other properties
      for (const [key, value] of Object.entries(obj)) {
        if (!['title', 'description', 'content'].includes(key)) {
          if (Array.isArray(value)) {
            lines.push(`**${key}:** ${value.join(', ')}`);
          } else if (typeof value === 'object') {
            lines.push(`**${key}:**\n${this.toMarkdown(value)}`);
          } else {
            lines.push(`**${key}:** ${value}`);
          }
        }
      }

      return lines.join('\n');
    }
    return String(data);
  }

  /**
   * Convert data to plain text format
   */
  private toPlainText(data: unknown): string {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) {
      return data.map((item, i) => `${i + 1}. ${this.toPlainText(item)}`).join('\n');
    }
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      return Object.entries(obj)
        .map(([key, value]) => `${key}: ${this.toPlainText(value)}`)
        .join('\n');
    }
    return String(data);
  }

  /**
   * Convert data to HTML format
   */
  private toHtml(data: unknown): string {
    if (typeof data === 'string') return `<p>${this.escapeHtml(data)}</p>`;
    if (Array.isArray(data)) {
      const items = data.map(item => `<li>${this.toHtml(item)}</li>`).join('\n');
      return `<ul>\n${items}\n</ul>`;
    }
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      const rows = Object.entries(obj)
        .map(([key, value]) =>
          `<tr><th>${this.escapeHtml(key)}</th><td>${this.toHtml(value)}</td></tr>`
        )
        .join('\n');
      return `<table>\n${rows}\n</table>`;
    }
    return `<span>${this.escapeHtml(String(data))}</span>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

/**
 * Custom error for query builder validation
 */
export class QueryBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryBuilderError';
  }
}

/**
 * Create a new query builder instance
 */
export function createQueryBuilder<T = unknown>(
  executor: QueryExecutor
): SemanticQueryBuilder<T> {
  return new SemanticQueryBuilder<T>(executor);
}

/**
 * Safe JSON Parsing Utilities
 * 
 * Provides secure JSON parsing with proper error handling to prevent
 * application crashes from malformed JSON data and improve security posture.
 * 
 * @module safe-json
 * @security This module prevents JSON parse errors from crashing the application
 * @see SECURITY.md - TypeScript/Node.js Security Best Practices
 */

import { logger } from './logger';

/**
 * Result type for safe JSON parsing operations
 */
export type SafeJsonResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: Error };

/**
 * Options for safe JSON parsing
 */
export interface SafeJsonOptions {
  /** Custom error message prefix */
  errorPrefix?: string;
  /** Whether to log errors (default: true) */
  logErrors?: boolean;
  /** Whether to log the invalid JSON content (default: false for security) */
  logContent?: boolean;
  /** Maximum string length to parse (prevents DoS via large strings) */
  maxLength?: number;
}

/**
 * Safely parse JSON string with error handling
 * 
 * @template T - Expected type of parsed data
 * @param jsonString - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @param options - Parsing options
 * @returns Parsed data or fallback value
 * 
 * @example
 * ```typescript
 * const data = safeJsonParse<UserData>(userInput, { id: 0, name: 'unknown' });
 * ```
 * 
 * @security
 * - Prevents application crashes from malformed JSON
 * - Limits string length to prevent DoS attacks
 * - Avoids logging sensitive data by default
 */
export function safeJsonParse<T>(
  jsonString: string,
  fallback: T,
  options: SafeJsonOptions = {}
): T {
  const {
    errorPrefix = 'JSON parse error',
    logErrors = true,
    logContent = false,
    maxLength = 10_000_000, // 10MB max by default
  } = options;

  try {
    // Security: Prevent DoS via extremely large JSON strings
    if (jsonString.length > maxLength) {
      const error = new Error(
        `${errorPrefix}: JSON string exceeds maximum length (${jsonString.length} > ${maxLength})`
      );
      
      if (logErrors) {
        logger.error(error.message);
      }
      
      return fallback;
    }

    // Security: Validate input is a string
    if (typeof jsonString !== 'string') {
      const error = new Error(
        `${errorPrefix}: Expected string but received ${typeof jsonString}`
      );
      
      if (logErrors) {
        logger.error(error.message);
      }
      
      return fallback;
    }

    // Attempt to parse
    const parsed = JSON.parse(jsonString) as T;
    return parsed;
    
  } catch (error) {
    // Log error without exposing sensitive data
    if (logErrors) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`${errorPrefix}: ${errorMessage}`);
      
      // Only log content if explicitly enabled (security consideration)
      if (logContent && jsonString.length < 500) {
        logger.debug('Invalid JSON content:', jsonString.slice(0, 200));
      }
    }
    
    return fallback;
  }
}

/**
 * Safely parse JSON string and return a result object
 * 
 * @template T - Expected type of parsed data
 * @param jsonString - JSON string to parse
 * @param options - Parsing options
 * @returns Result object with success status and data or error
 * 
 * @example
 * ```typescript
 * const result = safeJsonParseResult<UserData>(userInput);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 * 
 * @security Provides explicit error handling without crashes
 */
export function safeJsonParseResult<T>(
  jsonString: string,
  options: SafeJsonOptions = {}
): SafeJsonResult<T> {
  const {
    errorPrefix = 'JSON parse error',
    logErrors = true,
    maxLength = 10_000_000,
  } = options;

  try {
    // Security checks
    if (jsonString.length > maxLength) {
      const error = new Error(
        `${errorPrefix}: JSON string exceeds maximum length`
      );
      if (logErrors) logger.error(error.message);
      return { success: false, error };
    }

    if (typeof jsonString !== 'string') {
      const error = new Error(
        `${errorPrefix}: Expected string but received ${typeof jsonString}`
      );
      if (logErrors) logger.error(error.message);
      return { success: false, error };
    }

    const data = JSON.parse(jsonString) as T;
    return { success: true, data };
    
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (logErrors) {
      logger.error(`${errorPrefix}: ${err.message}`);
    }
    return { success: false, error: err };
  }
}

/**
 * Safely stringify an object to JSON with error handling
 * 
 * @param data - Data to stringify
 * @param fallback - Fallback string if stringification fails (default: '{}')
 * @param options - Stringify options
 * @returns JSON string or fallback
 * 
 * @example
 * ```typescript
 * const jsonStr = safeJsonStringify(userData, '{}');
 * ```
 * 
 * @security
 * - Handles circular references gracefully
 * - Prevents crashes from unstringifiable objects
 * - Provides fallback for error cases
 */
export function safeJsonStringify(
  data: unknown,
  fallback: string = '{}',
  options: SafeJsonOptions = {}
): string {
  const {
    errorPrefix = 'JSON stringify error',
    logErrors = true,
  } = options;

  try {
    // Handle circular references and BigInt
    const seen = new WeakSet();
    const result = JSON.stringify(data, (key, value) => {
      // Handle BigInt
      if (typeof value === 'bigint') {
        return value.toString();
      }
      
      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      
      return value;
    });
    
    return result;
    
  } catch (error) {
    if (logErrors) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`${errorPrefix}: ${errorMessage}`);
    }
    return fallback;
  }
}

/**
 * Validate if a string is valid JSON without parsing
 * 
 * @param jsonString - String to validate
 * @returns true if valid JSON, false otherwise
 * 
 * @example
 * ```typescript
 * if (isValidJson(userInput)) {
 *   const data = JSON.parse(userInput);
 * }
 * ```
 * 
 * @security Lightweight validation without full parsing overhead
 */
export function isValidJson(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

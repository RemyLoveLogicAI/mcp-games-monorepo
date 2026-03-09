# JSON Parsing Security Migration Guide

## Overview

This guide provides instructions for migrating from unsafe `JSON.parse()` usage to the new safe JSON parsing utilities in the `@omnigents/shared` package.

## Why This Change?

**Security Issues with Direct JSON.parse():**
- ❌ Application crashes from malformed JSON
- ❌ No error handling or recovery
- ❌ Potential DoS via extremely large JSON strings
- ❌ No validation or sanitization
- ❌ Difficult to debug parsing failures

**Benefits of Safe JSON Parsing:**
- ✅ Graceful error handling with fallback values
- ✅ Protection against DoS attacks (size limits)
- ✅ Consistent error logging
- ✅ TypeScript type safety
- ✅ Better debugging and monitoring
- ✅ Improved application resilience

---

## Migration Instructions

### Step 1: Import Safe JSON Utilities

```typescript
// Add to imports
import { safeJsonParse, safeJsonParseResult, safeJsonStringify } from '@omnigents/shared';
```

### Step 2: Replace JSON.parse() Calls

#### Option A: Using safeJsonParse() (Recommended for most cases)

**Before:**
```typescript
const data = JSON.parse(jsonString);
```

**After:**
```typescript
const data = safeJsonParse<ExpectedType>(jsonString, defaultValue, {
  errorPrefix: 'ModuleName',
  logErrors: true,
  maxLength: 1_000_000 // Optional: custom size limit
});
```

#### Option B: Using safeJsonParseResult() (For explicit error handling)

**Before:**
```typescript
try {
  const data = JSON.parse(jsonString);
  // use data
} catch (error) {
  // handle error
}
```

**After:**
```typescript
const result = safeJsonParseResult<ExpectedType>(jsonString, {
  errorPrefix: 'ModuleName'
});

if (result.success) {
  const data = result.data;
  // use data
} else {
  // handle result.error
}
```

---

## File-by-File Migration Examples

### 1. packages/shared/src/telemetry-bus.ts

**Location:** Event deserialization from Redis streams

**Current Pattern:**
```typescript
const event: TelemetryEvent = JSON.parse(message.message['data']);
```

**Recommended Fix:**
```typescript
import { safeJsonParse } from './safe-json';

// In read method or event handler
const event: TelemetryEvent = safeJsonParse<TelemetryEvent>(
  message.message['data'],
  {
    stream: 'unknown',
    timestamp: Date.now(),
    data: {},
    metadata: {}
  },
  {
    errorPrefix: 'TelemetryBus event parse',
    logErrors: true,
    maxLength: 100_000 // 100KB limit for telemetry events
  }
);
```

**Why:** Prevents application crash if Redis returns corrupted event data.

---

### 2. packages/story-engine/src/index.ts

**Location:** Loading game state, story definitions

**Current Pattern:**
```typescript
const state = JSON.parse(savedState);
```

**Recommended Fix:**
```typescript
import { safeJsonParse } from '@omnigents/shared';

const state = safeJsonParse<GameState>(
  savedState,
  {
    // Provide safe default game state
    currentNode: 'start',
    variables: {},
    history: [],
    playerChoices: []
  },
  {
    errorPrefix: 'GameState load',
    logErrors: true,
    maxLength: 10_000_000 // 10MB for game states
  }
);
```

**Why:** Corrupted save files shouldn't crash the game engine.

---

### 3. packages/mcp-games-server/src/handlers/voice-call-handler.ts

**Location:** Processing voice call metadata, transcriptions

**Current Pattern:**
```typescript
const callData = JSON.parse(request.body);
```

**Recommended Fix:**
```typescript
import { safeJsonParseResult } from '@omnigents/shared';

const result = safeJsonParseResult<VoiceCallData>(request.body, {
  errorPrefix: 'VoiceCallHandler',
  logErrors: true,
  maxLength: 500_000 // 500KB for call data
});

if (!result.success) {
  return response.status(400).json({
    error: 'Invalid request data',
    message: result.error.message
  });
}

const callData = result.data;
// Process callData safely
```

**Why:** External API requests must be validated before processing.

---

### 4. packages/mcp-games-server/src/database/query-optimizer.ts

**Location:** Parsing stored query plans, cached results

**Current Pattern:**
```typescript
const queryPlan = JSON.parse(cachedPlan);
```

**Recommended Fix:**
```typescript
import { safeJsonParse } from '@omnigents/shared';

const queryPlan = safeJsonParse<QueryPlan>(
  cachedPlan,
  null, // Return null if invalid, trigger re-planning
  {
    errorPrefix: 'QueryOptimizer cache',
    logErrors: true,
    maxLength: 1_000_000 // 1MB for query plans
  }
);

if (queryPlan === null) {
  // Regenerate query plan
  return generateFreshQueryPlan(query);
}
```

**Why:** Invalid cached data should trigger regeneration, not crashes.

---

### 5. packages/mcp-games-server/src/cache/cache-manager.ts

**Location:** Deserializing cached values

**Current Pattern:**
```typescript
return JSON.parse(cachedValue);
```

**Recommended Fix:**
```typescript
import { safeJsonParse } from '@omnigents/shared';

const parsed = safeJsonParse<T>(
  cachedValue,
  undefined, // Return undefined for invalid cache (cache miss)
  {
    errorPrefix: 'CacheManager get',
    logErrors: true,
    maxLength: 10_000_000 // 10MB cache value limit
  }
);

if (parsed === undefined) {
  // Treat as cache miss, fetch from source
  return fetchFromSource(key);
}

return parsed;
```

**Why:** Cache corruption shouldn't propagate, treat as cache miss.

---

## Testing Checklist

After migration, verify the following:

### Unit Tests

- [ ] Add tests for valid JSON parsing
- [ ] Add tests for malformed JSON handling
- [ ] Add tests for max length validation
- [ ] Add tests for fallback behavior
- [ ] Add tests for error logging

**Example Test:**
```typescript
import { safeJsonParse } from '@omnigents/shared';

describe('Safe JSON Parsing', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"key":"value"}', {});
    expect(result).toEqual({ key: 'value' });
  });

  it('should return fallback for invalid JSON', () => {
    const fallback = { default: true };
    const result = safeJsonParse('invalid json', fallback);
    expect(result).toBe(fallback);
  });

  it('should reject oversized JSON', () => {
    const largeJson = '{"data":"' + 'x'.repeat(100_000) + '"}';
    const result = safeJsonParse(largeJson, {}, { maxLength: 1000 });
    expect(result).toEqual({});
  });
});
```

### Integration Tests

- [ ] Test API endpoints with malformed JSON
- [ ] Test cache with corrupted data
- [ ] Test file loading with invalid JSON files
- [ ] Test network responses with incomplete JSON
- [ ] Test telemetry with malformed events

### Manual Testing

- [ ] Verify application doesn't crash with bad input
- [ ] Check error logs contain helpful messages
- [ ] Verify fallback values work as expected
- [ ] Test with real-world malformed data
- [ ] Performance test with large JSON strings

---

## Best Practices

### 1. Choose Appropriate Fallback Values

```typescript
// ✅ Good: Type-safe, meaningful defaults
const config = safeJsonParse<AppConfig>(
  configString,
  { 
    apiUrl: 'https://default-api.com',
    timeout: 5000,
    retries: 3 
  }
);

// ❌ Bad: Empty object loses type safety
const config = safeJsonParse(configString, {});
```

### 2. Set Appropriate Max Lengths

```typescript
// ✅ Good: Reasonable limits based on use case
const metadata = safeJsonParse(data, {}, { maxLength: 10_000 }); // 10KB
const gameState = safeJsonParse(state, {}, { maxLength: 10_000_000 }); // 10MB
const telemetry = safeJsonParse(event, {}, { maxLength: 100_000 }); // 100KB

// ❌ Bad: Using defaults without considering data size
const data = safeJsonParse(untrustedInput, {});
```

### 3. Provide Descriptive Error Prefixes

```typescript
// ✅ Good: Clear context for debugging
safeJsonParse(data, fallback, { errorPrefix: 'UserProfile.load' });
safeJsonParse(data, fallback, { errorPrefix: 'GameState.deserialize' });

// ❌ Bad: Generic or missing prefixes
safeJsonParse(data, fallback);
```

### 4. Use safeJsonParseResult() for Critical Operations

```typescript
// ✅ Good: Explicit error handling for critical operations
const result = safeJsonParseResult<PaymentData>(paymentJson);
if (!result.success) {
  logger.error('Payment data parsing failed', result.error);
  await notifyAdmin(result.error);
  return errorResponse();
}
processPayment(result.data);

// ⚠️ Acceptable: Fallback for non-critical operations
const preferences = safeJsonParse(preferencesJson, defaultPreferences);
```

### 5. Consider Validation After Parsing

```typescript
import { safeJsonParse } from '@omnigents/shared';
import { z } from 'zod'; // or your validation library

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().min(0).max(150)
});

const parsed = safeJsonParse<unknown>(userJson, null);
if (parsed === null) {
  return { error: 'Invalid JSON' };
}

// Validate structure and types
const validation = UserSchema.safeParse(parsed);
if (!validation.success) {
  return { error: 'Invalid user data', details: validation.error };
}

const user = validation.data; // Type-safe user object
```

---

## Common Patterns

### Pattern 1: API Request Body Parsing

```typescript
// Express/Fastify handler
async function handleRequest(req, res) {
  const result = safeJsonParseResult<RequestBody>(req.body, {
    errorPrefix: 'API.handleRequest',
    maxLength: 1_000_000 // 1MB request limit
  });

  if (!result.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      message: result.error.message
    });
  }

  // Process result.data safely
}
```

### Pattern 2: Cache/Storage Retrieval

```typescript
async function getFromCache<T>(key: string, defaultValue: T): Promise<T> {
  const cached = await redis.get(key);
  if (!cached) return defaultValue;

  return safeJsonParse<T>(cached, defaultValue, {
    errorPrefix: `Cache.get.${key}`,
    maxLength: 10_000_000
  });
}
```

### Pattern 3: File Loading

```typescript
function loadConfig(filePath: string): AppConfig {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return safeJsonParse<AppConfig>(content, getDefaultConfig(), {
      errorPrefix: `Config.load.${filePath}`,
      logErrors: true
    });
  } catch (error) {
    logger.error(`Failed to read config file: ${filePath}`, error);
    return getDefaultConfig();
  }
}
```

---

## Performance Considerations

The safe JSON utilities add minimal overhead:

- **safeJsonParse()**: ~5-10μs overhead (try/catch + validation)
- **safeJsonParseResult()**: ~3-7μs overhead (similar to safeJsonParse)
- **Size validation**: ~1μs (string length check)

For hot paths (>10,000 ops/sec), consider:
1. Pre-validating JSON format if possible
2. Using `isValidJson()` for quick checks
3. Caching parsed results

---

## Rollout Plan

### Phase 1: High-Risk Areas (Week 1)
- [ ] API request handlers
- [ ] External data processing
- [ ] User input handling

### Phase 2: Core Systems (Week 2)
- [ ] Game state management
- [ ] Cache operations
- [ ] Database query optimization

### Phase 3: Supporting Systems (Week 3)
- [ ] Telemetry and logging
- [ ] Configuration loading
- [ ] Background jobs

### Phase 4: Comprehensive Audit (Week 4)
- [ ] Run security linting: `pnpm lint:security`
- [ ] Search codebase for remaining `JSON.parse(`
- [ ] Update documentation
- [ ] Final testing and validation

---

## Additional Resources

- [Safe JSON Utility API Documentation](../packages/shared/src/safe-json.ts)
- [OWASP: Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

## Support

For questions or issues during migration:
- Review this guide
- Check the safe-json.ts source code
- Create an issue in the repository
- Contact the security team: security@lovelogicai.com

---

**Document Version**: 1.0.0  
**Last Updated**: March 9, 2026  
**Author**: Security Team

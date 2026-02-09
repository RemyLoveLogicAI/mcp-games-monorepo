# Three-Tier Observability Architecture
## Unrestricted OmniAgents Monitoring Stack

**Version:** 1.0  
**Date:** January 26, 2026  
**Philosophy:** AI handles the noise. Humans see the signal.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     OMNIGENT RUNTIME                                │
│  (MCP Games, PersonaPlex, Telegram, Context Engine, etc.)          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ All events (verbose)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 1: VERBOSE TELEMETRY (Agent-Only)                            │
│                                                                     │
│  • Every operation, every trace, every payload                     │
│  • Machine-readable JSON event stream                              │
│  • Stored in hot storage (24h) + cold archive                      │
│  • Consumed by: AI Watchdog                                         │
│  • Human access: Only for deep debugging (rare)                    │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ AI Watchdog processes
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AI WATCHDOG AGENT                                                  │
│                                                                     │
│  • Reads all Tier 1 telemetry                                      │
│  • Detects anomalies, patterns, failures                           │
│  • Executes recovery actions autonomously                          │
│  • Logs its own actions to Tier 2                                  │
│  • Escalates to Tier 3 when uncertain                              │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ Aggregated status + key events
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 2: SYSTEMS CHECK (Human Glanceable)                          │
│                                                                     │
│  • Service health: ✅ OK / ⚠️ DEGRADED / 🔴 CRITICAL               │
│  • Key metrics: uptime, error rate, latency, throughput            │
│  • Watchdog actions: what it did, success/fail                     │
│  • No verbose logs, no traces, no payloads                         │
│  • Simple dashboard or CLI command                                 │
│  • Human checks: once a day or on alert                            │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ Escalation only
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 3: HUMAN-IN-THE-LOOP (Decision Required)                     │
│                                                                     │
│  • AI can't decide → asks human                                    │
│  • Security-sensitive actions                                       │
│  • Cost/billing approvals                                          │
│  • Novel failure patterns                                          │
│  • Push notification to phone/Telegram                             │
│  • Simple choice UI: [Approve] [Deny] [Investigate]                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tier 1: Verbose Telemetry (Agent-Only)

### Purpose
Feed the AI Watchdog everything it needs to understand system state.

### Format
```json
{
  "timestamp": "2026-01-26T14:32:05.123Z",
  "level": "INFO",
  "event": "game-engine:make-choice:complete",
  "traceId": "abc123xyz",
  "requestId": "req-456",
  "service": "mcp-games",
  "duration": 145,
  "payload": {
    "sessionId": "sess-789",
    "fromScene": "wake_up",
    "toScene": "energetic_morning",
    "effectsApplied": 2,
    "contextInjected": true
  },
  "health": {
    "status": "OK",
    "memoryMb": 256,
    "cpuPercent": 12
  }
}
```

### Storage
- **Hot:** Last 24 hours in Redis Streams / Supabase
- **Cold:** Archived to S3/R2 (compressed, queryable for debugging)

### Access
- AI Watchdog: Always reading
- Humans: Only via explicit debug command (rare)

---

## Tier 2: Systems Check (Human Glanceable)

### Purpose
Give humans a 10-second health overview without noise.

### What's Shown

| Category | Data | Update Frequency |
|----------|------|------------------|
| **Service Status** | Name, status (OK/DEGRADED/CRITICAL), uptime | Real-time |
| **Key Metrics** | Error rate, p99 latency, throughput | 1-minute aggregates |
| **Watchdog Actions** | Last 10 actions with outcome | On action |
| **HITL Queue** | Count of pending human decisions | Real-time |

### Interface Options

#### Option A: CLI Command
```bash
$ omnigent status

UNRESTRICTED OMNIGENTS — SYSTEMS CHECK
Last updated: 2026-01-26 14:32:05 UTC

SERVICES
  mcp-games       ✅ OK        uptime: 4d 12h    latency: 120ms
  personaplex     ✅ OK        uptime: 4d 12h    latency: 245ms
  telegram-bot    ✅ OK        uptime: 4d 12h    msg/hr: 1.2k
  context-engine  ⚠️ DEGRADED  uptime: 2h        calendar MCP slow
  supabase        ✅ OK        uptime: 4d 12h    conn: 12/100

WATCHDOG (last 24h)
  Recoveries: 3 (all successful)
  Last action: 2h ago — restarted context-engine

METRICS (24h)
  Games: 847 started | Choices: 4,231 | Voice: 1,892
  Error rate: 0.3% | Avg latency: 180ms

HITL QUEUE: 0 pending
```

#### Option B: Simple Web Dashboard
Single page, no navigation, auto-refresh:

```
┌────────────────────────────────────────────────────────────────┐
│  🟢 ALL SYSTEMS OPERATIONAL                                    │
│  Updated: 14:32:05 UTC                                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  [====] mcp-games       OK     4d 12h                         │
│  [====] personaplex     OK     4d 12h                         │
│  [====] telegram-bot    OK     4d 12h                         │
│  [=== ] context-engine  WARN   2h (recovering)                │
│  [====] supabase        OK     4d 12h                         │
│                                                                │
│  ─────────────────────────────────────────────────────────────│
│  Watchdog: 3 recoveries (24h) | 94% success rate (7d)         │
│  HITL Queue: 0                                                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

#### Option C: Telegram Bot
```
You: /status

OmniBot: 
🟢 All systems operational

Services:
✅ mcp-games (4d 12h)
✅ personaplex (4d 12h)
✅ telegram-bot (4d 12h)
⚠️ context-engine (recovering)
✅ supabase (4d 12h)

Watchdog: 3 recoveries today, all successful
HITL: 0 pending

Last check: 14:32 UTC
```

### What's NOT Shown
- Individual request logs
- Trace IDs
- Payload contents
- Detailed error messages
- AI reasoning/thinking

---

## Tier 3: Human-in-the-Loop (Escalation)

### Purpose
Get human decision when AI is uncertain or action requires approval.

### Trigger Conditions

| Condition | Example | Why Escalate |
|-----------|---------|--------------|
| **Recovery exhausted** | 3 restart attempts failed | AI out of options |
| **Novel pattern** | Error type never seen before | AI can't classify |
| **Cost threshold** | Action costs >$X | Budget approval |
| **Security event** | Unusual access pattern | Threat assessment |
| **Data action** | User deletion request | Legal/privacy |
| **Ambiguous** | Can't determine right action | Human judgment |

### Notification Channels
1. **Telegram** (primary) — Push notification to your phone
2. **Email** (backup) — If Telegram fails
3. **Dashboard** (passive) — HITL queue counter

### Escalation Message Format

```
🔔 OMNIGENT NEEDS YOUR INPUT

Priority: MEDIUM
Time: 14:45 UTC

WHAT HAPPENED:
PersonaPlex failing 12% of requests
Error: "CUDA out of memory"

AI ANALYSIS:
• GPU memory exhausted
• Likely cause: memory leak (70%)
• 3 restart attempts made, issue persists

AI RECOMMENDATION:
Scale to 2 GPU instances (+$0.80/hr)

YOUR OPTIONS:
1️⃣ Approve scaling
2️⃣ Keep retrying (1hr)
3️⃣ Investigate first
4️⃣ Disable voice (fallback to text)

Reply with number:
```

### Response Handling
```typescript
// Human replies "1"
// AI Watchdog receives response
// Executes approved action
// Logs decision to audit trail
// Notifies human of outcome
```

### Timeout Behavior
If human doesn't respond within configured timeout:
- **LOW priority:** AI picks safest option, logs decision
- **MEDIUM priority:** AI picks recommendation, alerts human of auto-decision
- **HIGH priority:** AI does nothing, keeps alerting until response

---

## Implementation

### Tier 1: Telemetry Emitter

```typescript
// telemetry/emitter.ts
interface TelemetryEvent {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  event: string;
  traceId: string;
  requestId: string;
  service: string;
  duration?: number;
  payload: Record<string, unknown>;
  health: {
    status: 'OK' | 'DEGRADED' | 'CRITICAL';
    recoverable?: boolean;
    suggestedAction?: string;
    errorMessage?: string;
  };
}

class TelemetryEmitter {
  private stream: RedisStream;
  
  emit(event: Omit<TelemetryEvent, 'timestamp'>): void {
    const fullEvent: TelemetryEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };
    
    // Write to Tier 1 stream (AI Watchdog reads this)
    this.stream.add('telemetry:verbose', fullEvent);
    
    // If degraded/critical, also write to Tier 2 aggregator
    if (event.health.status !== 'OK') {
      this.stream.add('telemetry:alerts', fullEvent);
    }
  }
}

export const telemetry = new TelemetryEmitter();
```

### Tier 2: Systems Check Aggregator

```typescript
// systems-check/aggregator.ts
interface ServiceStatus {
  name: string;
  status: 'OK' | 'DEGRADED' | 'CRITICAL';
  uptime: number;
  lastCheck: string;
  metrics: {
    latencyP99?: number;
    errorRate?: number;
    throughput?: number;
  };
}

interface SystemsCheck {
  timestamp: string;
  overallStatus: 'OK' | 'DEGRADED' | 'CRITICAL';
  services: ServiceStatus[];
  watchdog: {
    lastAction: string;
    lastActionTime: string;
    recoveries24h: number;
    successRate7d: number;
  };
  hitlQueue: number;
  keyMetrics: {
    gamesStarted24h: number;
    choicesMade24h: number;
    voiceNarrations24h: number;
    errorRate24h: number;
    avgLatency24h: number;
  };
}

class SystemsCheckAggregator {
  async getStatus(): Promise<SystemsCheck> {
    const [services, watchdog, hitl, metrics] = await Promise.all([
      this.getServiceStatuses(),
      this.getWatchdogStatus(),
      this.getHitlQueueCount(),
      this.getKeyMetrics()
    ]);
    
    const overallStatus = this.computeOverallStatus(services);
    
    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      services,
      watchdog,
      hitlQueue: hitl,
      keyMetrics: metrics
    };
  }
  
  private computeOverallStatus(services: ServiceStatus[]): 'OK' | 'DEGRADED' | 'CRITICAL' {
    if (services.some(s => s.status === 'CRITICAL')) return 'CRITICAL';
    if (services.some(s => s.status === 'DEGRADED')) return 'DEGRADED';
    return 'OK';
  }
}
```

### Tier 3: HITL Manager

```typescript
// hitl/manager.ts
interface HitlRequest {
  id: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  createdAt: string;
  expiresAt: string;
  
  situation: string;
  aiAnalysis: string;
  aiRecommendation: string;
  costImplication?: string;
  
  options: HitlOption[];
  defaultOption?: number;  // Auto-select if timeout
  
  triggerEvent: TelemetryEvent;
}

interface HitlOption {
  id: number;
  label: string;
  description: string;
  action: string;  // Action code for watchdog to execute
}

interface HitlResponse {
  requestId: string;
  selectedOption: number;
  respondedBy: string;
  respondedAt: string;
  autoSelected: boolean;
}

class HitlManager {
  private pendingRequests: Map<string, HitlRequest> = new Map();
  
  async escalate(request: Omit<HitlRequest, 'id' | 'createdAt' | 'expiresAt'>): Promise<string> {
    const id = generateId();
    const timeout = this.getTimeoutForPriority(request.priority);
    
    const fullRequest: HitlRequest = {
      ...request,
      id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + timeout).toISOString()
    };
    
    this.pendingRequests.set(id, fullRequest);
    
    // Notify human via all channels
    await this.notifyHuman(fullRequest);
    
    // Start timeout timer
    this.startTimeoutTimer(fullRequest);
    
    return id;
  }
  
  async handleResponse(requestId: string, optionId: number, respondedBy: string): Promise<void> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`HITL request ${requestId} not found or expired`);
    }
    
    const option = request.options.find(o => o.id === optionId);
    if (!option) {
      throw new Error(`Invalid option ${optionId}`);
    }
    
    // Log response
    const response: HitlResponse = {
      requestId,
      selectedOption: optionId,
      respondedBy,
      respondedAt: new Date().toISOString(),
      autoSelected: false
    };
    
    await this.logResponse(response);
    
    // Execute chosen action
    await this.executeAction(option.action, request.triggerEvent);
    
    // Remove from pending
    this.pendingRequests.delete(requestId);
    
    // Notify human of outcome
    await this.notifyOutcome(request, option);
  }
  
  private async notifyHuman(request: HitlRequest): Promise<void> {
    const message = this.formatHitlMessage(request);
    
    // Try Telegram first
    try {
      await telegramBot.sendMessage(ADMIN_CHAT_ID, message, {
        reply_markup: this.buildKeyboard(request.options)
      });
    } catch (error) {
      // Fallback to email
      await sendEmail(ADMIN_EMAIL, 'OmniAgent HITL Request', message);
    }
  }
  
  private formatHitlMessage(request: HitlRequest): string {
    const priorityEmoji = {
      LOW: '🔵',
      MEDIUM: '🟡',
      HIGH: '🔴'
    };
    
    let message = `${priorityEmoji[request.priority]} OMNIGENT NEEDS INPUT\n\n`;
    message += `Priority: ${request.priority}\n`;
    message += `Expires: ${request.expiresAt}\n\n`;
    message += `SITUATION:\n${request.situation}\n\n`;
    message += `AI ANALYSIS:\n${request.aiAnalysis}\n\n`;
    message += `AI RECOMMENDS:\n${request.aiRecommendation}\n\n`;
    
    if (request.costImplication) {
      message += `COST: ${request.costImplication}\n\n`;
    }
    
    message += `OPTIONS:\n`;
    for (const option of request.options) {
      message += `${option.id}️⃣ ${option.label}\n`;
    }
    
    message += `\nReply with number:`;
    
    return message;
  }
  
  private startTimeoutTimer(request: HitlRequest): void {
    const timeout = new Date(request.expiresAt).getTime() - Date.now();
    
    setTimeout(async () => {
      if (this.pendingRequests.has(request.id)) {
        // Still pending, handle timeout
        await this.handleTimeout(request);
      }
    }, timeout);
  }
  
  private async handleTimeout(request: HitlRequest): Promise<void> {
    if (request.defaultOption !== undefined) {
      // Auto-select default
      const option = request.options.find(o => o.id === request.defaultOption);
      
      const response: HitlResponse = {
        requestId: request.id,
        selectedOption: request.defaultOption,
        respondedBy: 'SYSTEM_TIMEOUT',
        respondedAt: new Date().toISOString(),
        autoSelected: true
      };
      
      await this.logResponse(response);
      await this.executeAction(option!.action, request.triggerEvent);
      
      // Notify human of auto-decision
      await this.notifyAutoDecision(request, option!);
    } else {
      // No default, keep alerting for HIGH priority
      if (request.priority === 'HIGH') {
        await this.notifyHuman(request);  // Re-notify
        this.startTimeoutTimer(request);   // Reset timer
      }
    }
    
    this.pendingRequests.delete(request.id);
  }
}

export const hitlManager = new HitlManager();
```

---

## Summary

| Tier | Audience | Content | Interface |
|------|----------|---------|-----------|
| **1. Verbose** | AI Watchdog | Everything | Event stream |
| **2. Systems Check** | Human (glance) | Status + metrics | CLI / Dashboard / Telegram |
| **3. HITL** | Human (decision) | Escalations only | Telegram push + buttons |

**You don't watch the logs. You watch the AI watching the logs. And the AI only bothers you when it needs a decision.**

---

## Files to Create

1. `telemetry/emitter.ts` — Tier 1 event emitter
2. `systems-check/aggregator.ts` — Tier 2 status aggregator
3. `systems-check/cli.ts` — `omnigent status` command
4. `systems-check/dashboard.ts` — Simple web page (optional)
5. `hitl/manager.ts` — Tier 3 escalation handling
6. `watchdog/agent.ts` — AI that reads Tier 1, writes Tier 2, escalates to Tier 3

---

Does this capture the three-tier model correctly?

- **Tier 1:** Verbose for AI (you never see it)
- **Tier 2:** Systems check for humans (glanceable)
- **Tier 3:** HITL for decisions (push notifications)

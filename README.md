# 🚀 Unrestricted OmniAgents

**Four-Tier Self-Healing AI Agent Platform**

> By the time a human sees an issue, the system has already attempted 15-20 automated recovery actions.

## Vision

Unrestricted OmniAgents are AI agents that operate without arbitrary guardrails—not because they lack safety, but because safety emerges from **observable, recoverable, governable** architectures rather than pre-emptive restrictions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 3: HUMAN-IN-THE-LOOP                                         │
│  • Absolute intervention only                                       │
│  • Push notification + simple buttons                              │
└─────────────────────────────────────────────────────────────────────┘
                            ▲ Escalation (rare)
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 2: SYSTEMS CHECK                                             │
│  • Human-glanceable dashboard                                      │
│  • Coordinated multi-service recovery                              │
└─────────────────────────────────────────────────────────────────────┘
                            ▲ Aggregated status
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 1: AI WATCHDOG                                               │
│  • Reads all Tier 0 verbose telemetry                             │
│  • Primary healing: 5+ recovery strategies per failure            │
└─────────────────────────────────────────────────────────────────────┘
                            ▲ Verbose telemetry
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 0: AGENT RUNTIME (Self-Aware)                                │
│  • The actual operating OmniAgent                                  │
│  • Self-monitors: memory, CPU, latency, errors                    │
└─────────────────────────────────────────────────────────────────────┘
```

## First Product: MCP Games

Context-aware Choose Your Own Adventure games that inject real-time player context (calendar, weather, notes) into narrative experiences.

### Features
- 🎮 CYOA game engine with YAML-defined games
- 🎤 Voice narration via PersonaPlex
- 💬 Telegram bot interface
- 🔄 Real-time context injection from MCPs

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- Redis
- Docker (optional)

### Installation

```bash
# Clone the repo
git clone https://github.com/omnigents/omnigents.git
cd omnigents

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Start development
pnpm dev
```

### Docker Development

```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Project Structure

```
omnigents/
├── packages/
│   ├── shared/                # Shared types & telemetry bus
│   ├── tier0-runtime/         # Self-aware agent wrapper
│   ├── tier1-watchdog/        # AI-powered recovery
│   ├── tier2-systems-check/   # Dashboard & coordination
│   ├── tier3-hitl/            # Human escalation
│   ├── mcp-games-server/      # Game engine
│   └── telegram-bot/          # Telegram interface
├── games/                     # YAML game definitions
├── docs/                      # Documentation
└── docker-compose.yml         # Production stack
```

## Development

### Build all packages
```bash
pnpm build
```

### Run tests
```bash
pnpm test
```

### Lint
```bash
pnpm lint
```

### Type check
```bash
pnpm typecheck
```

## Sprint 1 Goals (35 days)

- [x] Monorepo setup
- [ ] Tier 0: Self-aware runtime
- [ ] Tier 1: AI Watchdog
- [ ] Tier 2: Systems Check
- [ ] Tier 3: HITL Manager
- [ ] MCP Games engine
- [ ] "The Morning Decision" game
- [ ] Telegram bot
- [ ] PersonaPlex voice integration

## Philosophy

1. **Agents monitor agents** — Human oversight is governance, not babysitting
2. **Recover first, escalate later** — 15-20 automated attempts before human sees it
3. **Observable by default** — Every operation emits telemetry
4. **Context is power** — Real-time context makes experiences personal

## License

MIT © LoveLogicAI LLC

---

**Built with 🤖 by Unrestricted OmniAgents**

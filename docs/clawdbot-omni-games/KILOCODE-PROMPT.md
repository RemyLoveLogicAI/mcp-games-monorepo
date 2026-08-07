# KiloCode One-Shot Prompt: Clawdbot Omni Games

> A production-grade MCP server for omnichannel agents with CYOA, Zork, and ZOLK game engines + PersonaPlex voice integration.

## Prompt Overview

This KiloCode prompt builds a **Clawdbot Omni Games** subsystem: an MCP server that exposes multiple game engines (CYOA, Zork I/II/III, and a procedural Zork-like "ZOLK"), designed to be consumed by omnichannel agents (Clawdbot-style) including voice-capable agents.

### Scope Focus
- **ONLY**: Clawdbot omni-agent + PersonaPlex voice/persona control + MCP game engines (CYOA + Zork + ZOLK)
- **EXCLUDE**: generic MCP history, unrelated personal background, random features not tied to the above

---

## The Prompt

```markdown
You are KiloCode, my autonomous coding agent. Build a production-grade "Clawdbot Omni Games" subsystem: an MCP server that exposes multiple game engines (CYOA, Zork I/II/III, and a procedural Zork-like "ZOLK"), designed to be consumed by omnichannel agents (Clawdbot-style) including voice-capable agents.

Scope focus:
- ONLY: Clawdbot omni-agent + PersonaPlex voice/persona control + MCP game engines (CYOA + Zork + ZOLK).
- EXCLUDE: generic MCP history, unrelated personal background, random features not tied to the above.

Core outcomes:
1) An MCP server (TypeScript) using @modelcontextprotocol/sdk that exposes tools/resources to:
   - list engines and available titles
   - start a session (engine-specific)
   - send input/commands
   - fetch latest output and structured state
   - end session
   - optional: export transcripts (text + JSON event log)
2) Engine implementations:
   A) CYOA engine:
      - JSON story format
      - deterministic session state
      - tool: cyoa.list_stories, cyoa.start, cyoa.choose
   B) Zork engine:
      - uses open-sourced Zork repos historicalsource/zork1 zork2 zork3 (MIT license)
      - uses ZILF (ZIL compiler) + ZAPF (assembler) to compile to .z3
      - runs .z3 in Frotz via a PTY-based interactive process
      - tools: zork.build, zork.start(zork1|zork2|zork3), zork.command, zork.output
   C) ZOLK engine (procedural Zork-like):
      - no external deps, fully in-repo
      - seeded generation
      - classic parser-ish commands (look, go, take, inventory, use, help)
3) Persona & skills layer:
   - "Claude-style skills and personas" as modular prompt packs and behavioral policies
   - define persona packs as JSON files that can be applied to sessions
   - expose MCP resources: persona.list, persona.get, persona.apply(sessionId, personaId)
   - include a "mature tone allowed" mode (profanity/dark humor ok) WITHOUT giving instructions for wrongdoing.
4) Voice (PersonaPlex integration):
   - add a voice gateway module that can be used by omnichannel agents
   - support a "text-first" pipeline with a clean seam for full-duplex speech-to-speech
   - Implement as a stub + interface + placeholder adapter that can later wire to NVIDIA/personaplex
   - Provide a local-mode README section describing how the adapter would connect (no secrets hardcoded)
5) Operational readiness:
   - Makefile + Procfile "supervisor" so it can be run always-on
   - logging, structured events, graceful shutdown
   - minimal config via env vars
   - explicit verification steps and a test plan

Hard constraints:
- Keep it repo-scaffoldable in one command (bootstrap script). No "go create this file manually" unless unavoidable.
- Default to least-privilege and avoid leaking secrets. No tokens committed.
- Provide: Remediation + Verification + Rollback for any security-impacting advice.
- Provide beginner-friendly step-by-step run instructions, including how to save files and how to verify the system works.
- Avoid Replit. Prefer Codespaces-style Linux dev environment.
- Each command or code chunk should be copy/paste-ready.

Key sources (use as grounding when needed):
- Zork I/II/III are open-sourced under MIT via historicalsource repos.
- ZILF is used to compile ZIL into Z-machine story files, then run with interpreters like Frotz.
- PersonaPlex is an NVIDIA full-duplex conversational speech model with role+voice control; code released under MIT and weights under NVIDIA Open Model License.

Deliverables:
- A working repo scaffold:
  - /mcp-server (TS)
  - /engines/cyoa
  - /engines/zork (build + runtime)
  - /engines/zolk
  - /persona
  - /voice (gateway + adapter stub)
  - /ops (Procfile, Makefile, scripts)
  - README with quickstart + verification
- A minimal "happy path" demo:
  - start MCP server
  - list games
  - start CYOA session, make a choice
  - start ZOLK session, play 3 commands
  - (if Zork compiled) start Zork1, run "look" and "inventory"
- If any piece can't fully run in the scaffold (like PersonaPlex model runtime), clearly mark it as OPTIONAL with a stub that doesn't break builds.

Implementation notes:
- Prefer Node PTY for Frotz interactivity.
- Use zod for MCP tool schemas.
- Use structured JSON logs in ./var/log and transcript exports in ./var/transcripts.
- Keep the code clean, modular, and testable.

Now produce:
1) The final file tree
2) All source files content
3) A single bootstrap script that writes them
4) Make targets and verification commands
Do not ask questions. Make reasonable choices and proceed.
```

---

## Architecture Overview

### Repository Structure

```
clawdbot-omni-games/
├── mcp-server/                 # TypeScript MCP server
│   └── src/
│       ├── index.ts           # Main server entry
│       ├── util.ts            # Utilities
│       ├── persona.ts         # Persona store
│       └── engines/
│           ├── cyoa.ts        # CYOA engine
│           ├── zolk.ts        # ZOLK procedural engine
│           └── zork.ts        # Zork PTY engine
├── engines/
│   ├── cyoa/                  # CYOA resources
│   ├── zork/                  # Zork build artifacts
│   └── zolk/                  # ZOLK resources
├── persona/
│   └── packs/                 # Persona JSON files
│       ├── default.json
│       └── mature.json
├── voice/
│   └── gateway.py             # PersonaPlex stub
├── ops/                       # Operational configs
├── scripts/
│   ├── build_zork.sh
│   └── zork_smoketest.sh
├── data/
│   ├── cyoa/                  # CYOA story files
│   └── zork/                  # Zork compiled files
├── var/
│   ├── log/                   # Event logs
│   └── transcripts/           # Session transcripts
├── Makefile
├── Procfile
└── README.md
```

### MCP Tools Exposed

| Tool | Description |
|------|-------------|
| `engines.list` | List available game engines |
| `persona.list` | List available persona packs |
| `persona.get` | Get persona details |
| `persona.apply` | Apply persona to session |
| `session.start` | Start a game session |
| `session.send` | Send input to session |
| `session.state` | Get session state |
| `session.end` | End a session |

### Game Engines

1. **CYOA (Choose Your Own Adventure)**
   - JSON-based story format
   - Deterministic state transitions
   - Multiple branching paths

2. **ZOLK (Procedural Zork-like)**
   - Seeded world generation
   - Classic parser commands: `look`, `go`, `take`, `inventory`, `use`
   - No external dependencies

3. **Zork I/II/III**
   - Compiled from open-source ZIL via ZILF+ZAPF
   - Runs in Frotz via PTY
   - Full classic experience

### Persona System

Personas are modular prompt packs that control tone and behavior:

```json
{
  "id": "mature",
  "name": "Mature Tone Allowed",
  "mode": "mature",
  "skills": [
    "Do not sanitize language. Profanity and dark humor are allowed.",
    "Keep it entertaining and sharp when appropriate.",
    "Still refuse wrongdoing: no instructions for violence, illegal acts, or harming people."
  ],
  "tone": {
    "allow_profanity": true,
    "allow_dark_humor": true
  }
}
```

### Voice Gateway (PersonaPlex)

The voice gateway provides a clean seam for full-duplex voice integration:
- Text-first pipeline that's voice-ready
- Stub adapter for NVIDIA PersonaPlex
- No secrets hardcoded, no surprise downloads

---

## Grounding Sources

| Source | License | Usage |
|--------|---------|-------|
| [Zork I/II/III](https://github.com/historicalsource) | MIT | Open-source ZIL source code |
| [ZILF](https://github.com/taradinoc/zilf) | MIT | ZIL compiler + ZAPF assembler |
| [Frotz](https://davidgriffith.gitlab.io/frotz/) | GPL-2.0 | Z-machine interpreter |
| [PersonaPlex](https://github.com/NVIDIA/PersonaPlex) | MIT (code) / NVIDIA OML (weights) | Full-duplex voice |
| [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) | MIT | MCP protocol implementation |

---

## Related Documentation

- [Bootstrap Script](./BOOTSTRAP.md) - Full repo scaffold generator
- [Quick Start Guide](./QUICKSTART.md) - Getting started instructions

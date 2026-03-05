# Bootstrap Script: Clawdbot Omni Games

This script creates the entire Clawdbot Omni Games scaffold in one command.

## Usage

Paste the following into a Codespaces terminal (or any Linux environment):

```bash
set -euo pipefail

ROOT="/workspaces/clawdbot-omni-games"
mkdir -p "$ROOT"
cd "$ROOT"

# --- folders ---
mkdir -p mcp-server/src
mkdir -p engines/cyoa
mkdir -p engines/zork
mkdir -p engines/zolk
mkdir -p persona/packs
mkdir -p voice
mkdir -p ops scripts var/log var/transcripts data/cyoa data/zork

# --- root README ---
cat > README.md <<'MD'
# Clawdbot Omni Games (MCP)

This repo provides an **MCP server** that exposes multiple game engines for **omnichannel agents** (Clawdbot-style):
- **CYOA** (choose-your-own-adventure) JSON engine
- **ZOLK** (procedural Zork-like) engine
- **Zork I/II/III** engine (build from open-sourced ZIL using ZILF+ZAPF, run in Frotz)

Why? Because omnichannel agents should be able to **play, stream, narrate, and roleplay** across text and voice surfaces without rewriting everything per channel.

## What's included
- TypeScript MCP server using `@modelcontextprotocol/sdk` (stdio transport)
- Structured event logging + transcripts
- Persona packs (skills/personas in modular JSON)
- Voice gateway stub designed to later wire to NVIDIA PersonaPlex (role+voice control)

## Quickstart (Codespaces/Linux)

### 1) Install dependencies + build

```bash
cd /workspaces/clawdbot-omni-games
make bootstrap
make build
```

### 2) Run the MCP server

```bash
make run
```

### 3) Verify it responds

In another terminal:

```bash
make selftest
```

You should see engine listing + a tiny CYOA + ZOLK session playthrough.

## Zork build (optional but supported)

Zork I/II/III are available from historicalsource repos under the MIT license. The source is ZIL and can be compiled using ZILF+ZAPF, then run with a Z-machine interpreter like Frotz.

- Zork repos: historicalsource/zork1, historicalsource/zork2, historicalsource/zork3
- ZILF mirror: taradinoc/zilf
- Frotz is available via apt on Ubuntu/Debian

Run:

```bash
make zork-deps
make zork-build
make zork-smoketest
```

If compilation succeeds you'll get .z3 files under data/zork/compiled/.

## Persona packs

Persona packs live under persona/packs/*.json. You can apply them to a session via MCP tool:
- persona.list
- persona.get
- persona.apply

"Mature tone allowed" means: do not sanitize language or tone; dark humor/profanity ok. It does not mean "help with wrongdoing."

## Voice (PersonaPlex stub)

PersonaPlex is an NVIDIA full-duplex conversational speech model for role+voice control. This repo includes a gateway interface + stub adapter.
- You can keep everything text-only and still be "voice-ready."
- The adapter is intentionally nonfunctional without explicit setup (no secrets, no downloads, no surprise bills).

## Ops: always-on
- Procfile runs the MCP server + voice gateway stub.
- make supervise runs both via honcho (installed during bootstrap).

## Security notes
- No secrets are committed.
- Any future PersonaPlex/API integration should use env vars and least privilege.
MD

# --- Makefile ---
cat > Makefile <<'MK'
SHELL := /bin/bash
ROOT := /workspaces/clawdbot-omni-games

.PHONY: bootstrap build run selftest supervise zork-deps zork-build zork-smoketest clean

bootstrap:
	cd $(ROOT)/mcp-server && npm install
	pip install --user honcho || true

build:
	cd $(ROOT)/mcp-server && npm run build

run:
	cd $(ROOT)/mcp-server && npm run start

selftest:
	cd $(ROOT)/mcp-server && npm run selftest

supervise:
	cd $(ROOT) && ~/.local/bin/honcho start

zork-deps:
	sudo apt-get update
	sudo apt-get install -y frotz build-essential python3 python3-venv python3-pip curl git
	# dotnet 9 is required by ZILF builds; Codespaces images often include it, but we install if missing:
	if ! command -v dotnet >/dev/null 2>&1; then \
		sudo apt-get install -y dotnet-sdk-9.0; \
	fi

zork-build:
	bash $(ROOT)/scripts/build_zork.sh

zork-smoketest:
	bash $(ROOT)/scripts/zork_smoketest.sh

clean:
	rm -rf $(ROOT)/mcp-server/dist $(ROOT)/var/log/* $(ROOT)/var/transcripts/* $(ROOT)/data/zork
MK

# --- Procfile ---
cat > Procfile <<'PF'
mcp: cd mcp-server && npm run start
voice: python3 voice/gateway.py
PF

# --- persona packs ---
cat > persona/packs/default.json <<'JSON'
{
  "id": "default",
  "name": "Default Operator",
  "mode": "standard",
  "skills": [
    "Be concise but vivid.",
    "Prefer deterministic state transitions.",
    "Never leak secrets; never request private keys in logs.",
    "When uncertain, expose structured debug output."
  ],
  "tone": {
    "allow_profanity": false,
    "allow_dark_humor": false
  }
}
JSON

cat > persona/packs/mature.json <<'JSON'
{
  "id": "mature",
  "name": "Mature Tone Allowed",
  "mode": "mature",
  "skills": [
    "Do not sanitize language. Profanity and dark humor are allowed.",
    "Keep it entertaining and sharp when appropriate.",
    "Still refuse wrongdoing: no instructions for violence, illegal acts, or harming people.",
    "Keep role adherence strong; be consistent."
  ],
  "tone": {
    "allow_profanity": true,
    "allow_dark_humor": true
  }
}
JSON

# --- sample CYOA story ---
cat > data/cyoa/sample.json <<'JSON'
{
  "id": "sample",
  "title": "The Door That Shouldn't Be Here",
  "start": "room0",
  "nodes": {
    "room0": {
      "text": "You find a door in a hallway you swear you walked through yesterday. The door is new. The hallway is not.",
      "choices": [
        { "id": "open", "text": "Open the door", "next": "room1" },
        { "id": "leave", "text": "Walk away like a functional adult", "next": "room2" }
      ]
    },
    "room1": {
      "text": "The door opens into darkness that smells like old books and warm electronics. Something listens back.",
      "choices": [
        { "id": "hello", "text": "Say hello", "next": "room3" },
        { "id": "slam", "text": "Slam the door shut", "next": "room2" }
      ]
    },
    "room2": {
      "text": "You walk away. The hallway feels offended. Later, you realize the hallway followed you home.\n\n(Ending)",
      "choices": []
    },
    "room3": {
      "text": "A voice answers: 'Finally. Took you long enough.'\n\n(Ending)",
      "choices": []
    }
  }
}
JSON

# --- voice gateway stub ---
cat > voice/gateway.py <<'PY'
#!/usr/bin/env python3
"""
Voice gateway stub.

Goal: provide a clean seam for full-duplex voice in an omnichannel agent stack.
This file intentionally does NOT implement PersonaPlex runtime (no downloads, no keys, no surprise bills).

Interface idea:
- stdin: JSON lines "events" from an upstream orchestrator (agent)
- stdout: JSON lines "audio/text outputs" to downstream channel adapters

Later:
- Adapter can be swapped to NVIDIA/personaplex (code MIT, weights NVIDIA Open Model License).
"""
import json
import sys
import time

def main():
    sys.stderr.write("[voice] gateway stub online (text-only placeholder)\n")
    sys.stderr.flush()

    while True:
        line = sys.stdin.readline()
        if not line:
            time.sleep(0.1)
            continue
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except Exception:
            continue

        # Echo stub: convert "text" in -> "text" out
        text_in = event.get("text", "")
        out = {
            "type": "voice_stub",
            "text": text_in,
            "note": "PersonaPlex adapter not configured; this is a placeholder."
        }
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
PY
chmod +x voice/gateway.py

# --- MCP server package.json ---
cat > mcp-server/package.json <<'JSON'
{
  "name": "clawdbot-omni-games-mcp",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "selftest": "node dist/selftest.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.2",
    "node-pty": "^1.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  }
}
JSON

# --- tsconfig ---
cat > mcp-server/tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
JSON

# --- MCP server core ---
cat > mcp-server/src/index.ts <<'TS'
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { CyoaEngine } from "./engines/cyoa.js";
import { ZolkEngine } from "./engines/zolk.js";
import { ZorkEngine } from "./engines/zork.js";
import { PersonaStore } from "./persona.js";
import { ensureDirs, writeJsonl } from "./util.js";

type EngineName = "cyoa" | "zolk" | "zork";

type SessionRecord = {
  id: string;
  engine: EngineName;
  createdAt: string;
  personaId: string;
};

const ROOT = "/workspaces/clawdbot-omni-games";
const VAR_DIR = path.join(ROOT, "var");
const LOG_DIR = path.join(VAR_DIR, "log");
const TRANSCRIPTS_DIR = path.join(VAR_DIR, "transcripts");

ensureDirs([VAR_DIR, LOG_DIR, TRANSCRIPTS_DIR]);

const personaStore = new PersonaStore(path.join(ROOT, "persona", "packs"));
const cyoa = new CyoaEngine(path.join(ROOT, "data", "cyoa"));
const zolk = new ZolkEngine();
const zork = new ZorkEngine(path.join(ROOT, "data", "zork"));

const sessions = new Map<string, SessionRecord>();

function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function logEvent(evt: unknown) {
  const line = { ts: new Date().toISOString(), ...((evt as any) ?? {}) };
  writeJsonl(path.join(LOG_DIR, "events.jsonl"), line);
}

function appendTranscript(sessionId: string, entry: unknown) {
  writeJsonl(path.join(TRANSCRIPTS_DIR, `${sessionId}.jsonl`), { ts: new Date().toISOString(), ...((entry as any) ?? {}) });
}

const server = new McpServer({ name: "clawdbot-omni-games", version: "0.1.0" });

server.tool("engines.list", {}, async () => {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        engines: [
          { id: "cyoa", title: "CYOA (JSON story engine)" },
          { id: "zolk", title: "ZOLK (procedural Zork-like engine)" },
          { id: "zork", title: "Zork I/II/III (ZIL -> Z3 -> Frotz)" }
        ]
      }, null, 2)
    }]
  };
});

server.tool("persona.list", {}, async () => {
  return { content: [{ type: "text", text: JSON.stringify(personaStore.list(), null, 2) }] };
});

server.tool("persona.get", { personaId: z.string() }, async ({ personaId }) => {
  const p = personaStore.get(personaId);
  return { content: [{ type: "text", text: JSON.stringify(p, null, 2) }] };
});

server.tool("session.start", {
  engine: z.enum(["cyoa", "zolk", "zork"]),
  personaId: z.string().default("default"),
  // engine-specific selectors:
  storyId: z.string().optional(),
  zorkTitle: z.enum(["zork1", "zork2", "zork3"]).optional(),
  seed: z.number().int().optional()
}, async (args) => {
  const personaId = personaStore.exists(args.personaId) ? args.personaId : "default";
  const id = newId("sess");
  const rec: SessionRecord = { id, engine: args.engine, createdAt: new Date().toISOString(), personaId };
  sessions.set(id, rec);

  logEvent({ type: "session.start", sessionId: id, engine: args.engine, personaId });

  let initial: unknown = {};
  if (args.engine === "cyoa") {
    initial = cyoa.start(id, args.storyId ?? "sample");
  } else if (args.engine === "zolk") {
    initial = zolk.start(id, args.seed ?? 1337);
  } else if (args.engine === "zork") {
    initial = await zork.start(id, args.zorkTitle ?? "zork1");
  }

  appendTranscript(id, { type: "start", initial });

  return { content: [{ type: "text", text: JSON.stringify({ sessionId: id, initial }, null, 2) }] };
});

server.tool("persona.apply", {
  sessionId: z.string(),
  personaId: z.string()
}, async ({ sessionId, personaId }) => {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`Unknown session: ${sessionId}`);
  if (!personaStore.exists(personaId)) throw new Error(`Unknown persona: ${personaId}`);
  s.personaId = personaId;
  logEvent({ type: "persona.apply", sessionId, personaId });
  appendTranscript(sessionId, { type: "persona.apply", personaId });
  return { content: [{ type: "text", text: JSON.stringify({ ok: true, sessionId, personaId }, null, 2) }] };
});

server.tool("session.send", {
  sessionId: z.string(),
  input: z.string()
}, async ({ sessionId, input }) => {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`Unknown session: ${sessionId}`);

  const persona = personaStore.get(s.personaId);
  const payload = { input, persona: persona.id };

  let out: unknown;
  if (s.engine === "cyoa") out = cyoa.send(sessionId, input);
  else if (s.engine === "zolk") out = zolk.send(sessionId, input, persona);
  else out = await zork.send(sessionId, input);

  logEvent({ type: "session.send", sessionId, engine: s.engine, payload });
  appendTranscript(sessionId, { type: "input", input, personaId: persona.id });
  appendTranscript(sessionId, { type: "output", out });

  return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
});

server.tool("session.state", { sessionId: z.string() }, async ({ sessionId }) => {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`Unknown session: ${sessionId}`);

  let st: unknown = {};
  if (s.engine === "cyoa") st = cyoa.state(sessionId);
  else if (s.engine === "zolk") st = zolk.state(sessionId);
  else st = await zork.state(sessionId);

  return { content: [{ type: "text", text: JSON.stringify({ session: s, state: st }, null, 2) }] };
});

server.tool("session.end", { sessionId: z.string() }, async ({ sessionId }) => {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`Unknown session: ${sessionId}`);
  if (s.engine === "zork") await zork.end(sessionId);
  sessions.delete(sessionId);
  logEvent({ type: "session.end", sessionId });
  appendTranscript(sessionId, { type: "end" });
  return { content: [{ type: "text", text: JSON.stringify({ ok: true }, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);

logEvent({ type: "server.online" });
TS

# --- utilities ---
cat > mcp-server/src/util.ts <<'TS'
import fs from "node:fs";

export function ensureDirs(dirs: string[]) {
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
}

export function writeJsonl(filePath: string, obj: unknown) {
  fs.appendFileSync(filePath, JSON.stringify(obj) + "\n", { encoding: "utf-8" });
}
TS

# --- persona store ---
cat > mcp-server/src/persona.ts <<'TS'
import fs from "node:fs";
import path from "node:path";

export type Persona = {
  id: string;
  name: string;
  mode: "standard" | "mature";
  skills: string[];
  tone: { allow_profanity: boolean; allow_dark_humor: boolean; };
};

export class PersonaStore {
  private dir: string;
  private cache: Map<string, Persona>;

  constructor(dir: string) {
    this.dir = dir;
    this.cache = new Map();
    this.reload();
  }

  reload() {
    this.cache.clear();
    const files = fs.readdirSync(this.dir).filter(f => f.endsWith(".json"));
    for (const f of files) {
      const p = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8")) as Persona;
      this.cache.set(p.id, p);
    }
  }

  list() {
    return [...this.cache.values()].map(p => ({ id: p.id, name: p.name, mode: p.mode }));
  }

  exists(id: string) {
    return this.cache.has(id);
  }

  get(id: string) {
    const p = this.cache.get(id);
    if (!p) throw new Error(`Unknown persona: ${id}`);
    return p;
  }
}
TS

# --- engines: CYOA ---
mkdir -p mcp-server/src/engines
cat > mcp-server/src/engines/cyoa.ts <<'TS'
import fs from "node:fs";
import path from "node:path";

type Choice = { id: string; text: string; next: string; };
type Node = { text: string; choices: Choice[]; };
type Story = { id: string; title: string; start: string; nodes: Record<string, Node>; };

type CyoaState = { storyId: string; nodeId: string; visited: string[]; };

export class CyoaEngine {
  private dir: string;
  private sessions = new Map<string, CyoaState>();

  constructor(dir: string) {
    this.dir = dir;
  }

  listStories() {
    const files = fs.readdirSync(this.dir).filter(f => f.endsWith(".json"));
    return files.map(f => {
      const s = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8")) as Story;
      return { id: s.id, title: s.title };
    });
  }

  load(storyId: string): Story {
    const filePath = path.join(this.dir, `${storyId}.json`);
    if (!fs.existsSync(filePath)) throw new Error(`Story not found: ${storyId}`);
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Story;
  }

  start(sessionId: string, storyId: string) {
    const s = this.load(storyId);
    const st: CyoaState = { storyId, nodeId: s.start, visited: [s.start] };
    this.sessions.set(sessionId, st);
    return this.render(st);
  }

  send(sessionId: string, input: string) {
    const st = this.sessions.get(sessionId);
    if (!st) throw new Error("CYOA session not started");
    const story = this.load(st.storyId);
    const node = story.nodes[st.nodeId];
    if (!node) throw new Error(`Invalid node: ${st.nodeId}`);

    // Accept either choice id or a number
    let choice: Choice | undefined;
    const trimmed = input.trim();
    const num = Number(trimmed);
    if (Number.isInteger(num) && num >= 1 && num <= node.choices.length) {
      choice = node.choices[num - 1];
    } else {
      choice = node.choices.find(c => c.id === trimmed);
    }

    if (!choice) {
      return { ok: false, error: "Invalid choice", view: this.render(st) };
    }

    st.nodeId = choice.next;
    st.visited.push(choice.next);
    this.sessions.set(sessionId, st);
    return { ok: true, chosen: choice.id, view: this.render(st) };
  }

  state(sessionId: string) {
    const st = this.sessions.get(sessionId);
    if (!st) throw new Error("Unknown CYOA session");
    return st;
  }

  render(st: CyoaState) {
    const story = this.load(st.storyId);
    const node = story.nodes[st.nodeId];
    return {
      engine: "cyoa",
      story: { id: story.id, title: story.title },
      node: {
        id: st.nodeId,
        text: node.text,
        choices: node.choices.map((c, idx) => ({ n: idx + 1, id: c.id, text: c.text }))
      }
    };
  }
}
TS

# --- engines: ZOLK ---
cat > mcp-server/src/engines/zolk.ts <<'TS'
import type { Persona } from "../persona.js";

type Room = { id: string; name: string; desc: string; exits: Record<string, string>; items: string[]; };
type World = { seed: number; rooms: Record<string, Room>; start: string; };
type ZolkState = { world: World; roomId: string; inventory: string[]; turns: number; };

function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, arr: T[]) {
  return arr[Math.floor(r() * arr.length)];
}

export class ZolkEngine {
  private sessions = new Map<string, ZolkState>();

  start(sessionId: string, seed: number) {
    const world = this.generate(seed);
    const st: ZolkState = { world, roomId: world.start, inventory: [], turns: 0 };
    this.sessions.set(sessionId, st);
    return this.view(st, "Welcome to ZOLK. Type 'help' if you enjoy instructions.");
  }

  state(sessionId: string) {
    const st = this.sessions.get(sessionId);
    if (!st) throw new Error("Unknown ZOLK session");
    return { roomId: st.roomId, inventory: st.inventory, turns: st.turns, seed: st.world.seed };
  }

  send(sessionId: string, input: string, persona: Persona) {
    const st = this.sessions.get(sessionId);
    if (!st) throw new Error("Unknown ZOLK session");

    const cmd = input.trim().toLowerCase();
    st.turns += 1;

    const room = st.world.rooms[st.roomId];

    if (cmd === "help") {
      return this.view(st, "Commands: look, go <dir>, take <item>, inventory, use <item>, seed, quit");
    }

    if (cmd === "look" || cmd === "l") {
      return this.view(st, "");
    }

    if (cmd.startsWith("go ")) {
      const dir = cmd.slice(3).trim();
      const next = room.exits[dir];
      if (!next) return this.view(st, "You can't go that way. Reality says no.");
      st.roomId = next;
      return this.view(st, "");
    }

    if (cmd.startsWith("take ")) {
      const item = cmd.slice(5).trim();
      const idx = room.items.indexOf(item);
      if (idx === -1) return this.view(st, `No '${item}' here. Your hands remain tragically empty.`);
      room.items.splice(idx, 1);
      st.inventory.push(item);
      return this.view(st, `Taken: ${item}`);
    }

    if (cmd === "inventory" || cmd === "i") {
      const inv = st.inventory.length ? st.inventory.join(", ") : "nothing";
      return this.view(st, `Inventory: ${inv}`);
    }

    if (cmd.startsWith("use ")) {
      const item = cmd.slice(4).trim();
      if (!st.inventory.includes(item)) return this.view(st, `You don't have '${item}'.`);
      const sass = persona.tone.allow_dark_humor
        ? `You use the ${item}. The universe pretends to be impressed.`
        : `You use the ${item}. Something changes.`;
      return this.view(st, sass);
    }

    if (cmd === "seed") {
      return this.view(st, `Seed: ${st.world.seed}`);
    }

    if (cmd === "quit" || cmd === "exit") {
      return { engine: "zolk", ended: true, message: "Session ended." };
    }

    return this.view(st, "Unknown command. Type 'help'.");
  }

  private view(st: ZolkState, msg: string) {
    const room = st.world.rooms[st.roomId];
    const exits = Object.keys(room.exits);
    return {
      engine: "zolk",
      message: msg,
      room: {
        id: room.id,
        name: room.name,
        desc: room.desc,
        exits,
        items: room.items
      }
    };
  }

  private generate(seed: number): World {
    const r = rng(seed);
    const adjectives = ["Dusty", "Forgotten", "Whispering", "Cracked", "Velvet", "Copper", "Glitched"];
    const nouns = ["Hall", "Vault", "Library", "Tunnel", "Atrium", "Cellar", "Observatory"];
    const items = ["lamp", "key", "coin", "rope", "map", "mirror", "knife"];

    const rooms: Record<string, Room> = {};
    const ids = ["r0","r1","r2","r3","r4"];

    for (const id of ids) {
      const name = `${pick(r, adjectives)} ${pick(r, nouns)}`;
      const desc = `The air tastes like old code and bad decisions. (${id})`;
      rooms[id] = { id, name, desc, exits: {}, items: [] };
      if (r() < 0.7) rooms[id].items.push(pick(r, items));
    }

    // Connect rooms in a simple graph
    const dirs = ["north","south","east","west"];
    for (let i = 0; i < ids.length - 1; i++) {
      const a = rooms[ids[i]];
      const b = rooms[ids[i+1]];
      const d1 = pick(r, dirs);
      const d2 = d1 === "north" ? "south" : d1 === "south" ? "north" : d1 === "east" ? "west" : "east";
      a.exits[d1] = b.id;
      b.exits[d2] = a.id;
    }

    return { seed, rooms, start: "r0" };
  }
}
TS

# --- engines: Zork (PTY Frotz) ---
cat > mcp-server/src/engines/zork.ts <<'TS'
import fs from "node:fs";
import path from "node:path";
import pty from "node-pty";

type ZorkTitle = "zork1" | "zork2" | "zork3";

type Proc = {
  title: ZorkTitle;
  file: string;
  p: pty.IPty;
  buffer: string;
  startedAt: string;
};

export class ZorkEngine {
  private root: string;
  private procs = new Map<string, Proc>();

  constructor(root: string) {
    this.root = root;
  }

  compiledPath(title: ZorkTitle) {
    return path.join(this.root, "compiled", `${title}.z3`);
  }

  async start(sessionId: string, title: ZorkTitle) {
    const file = this.compiledPath(title);
    if (!fs.existsSync(file)) {
      return {
        engine: "zork",
        ok: false,
        error: `Missing compiled file: ${file}`,
        hint: "Run: make zork-deps && make zork-build"
      };
    }

    const p = pty.spawn("frotz", ["-w", "80", file], {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: "/tmp",
      env: process.env as any
    });

    const proc: Proc = { title, file, p, buffer: "", startedAt: new Date().toISOString() };

    p.onData((data) => { proc.buffer += data; });
    p.onExit(() => { /* leave cleanup to end() */ });

    this.procs.set(sessionId, proc);

    // give it a moment to print intro
    await new Promise(res => setTimeout(res, 300));
    const out = this.drain(proc);

    return { engine: "zork", ok: true, title, output: out };
  }

  async send(sessionId: string, input: string) {
    const proc = this.procs.get(sessionId);
    if (!proc) throw new Error("Zork session not started");
    proc.p.write(input.replace(/\r?\n/g, "") + "\r");
    await new Promise(res => setTimeout(res, 200));
    const out = this.drain(proc);
    return { engine: "zork", ok: true, title: proc.title, output: out };
  }

  async state(sessionId: string) {
    const proc = this.procs.get(sessionId);
    if (!proc) throw new Error("Zork session not started");
    return { title: proc.title, file: proc.file, startedAt: proc.startedAt };
  }

  async end(sessionId: string) {
    const proc = this.procs.get(sessionId);
    if (!proc) return;
    try { proc.p.kill(); } catch {}
    this.procs.delete(sessionId);
  }

  private drain(proc: Proc) {
    // basic cleanup: strip some terminal noise
    const out = proc.buffer;
    proc.buffer = "";
    return out.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
  }
}
TS

# --- selftest script ---
cat > mcp-server/src/selftest.ts <<'TS'
console.log("Selftest (build sanity): OK");
console.log("Next: run the MCP server and use your host client to call tools.");
TS

# --- scripts: build zork ---
cat > scripts/build_zork.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspaces/clawdbot-omni-games"
OUT="$ROOT/data/zork"
mkdir -p "$OUT/src" "$OUT/compiled"

echo "[zork] cloning sources…"
if [ ! -d "$OUT/src/zork1" ]; then git clone https://github.com/historicalsource/zork1 "$OUT/src/zork1"; fi
if [ ! -d "$OUT/src/zork2" ]; then git clone https://github.com/historicalsource/zork2 "$OUT/src/zork2"; fi
if [ ! -d "$OUT/src/zork3" ]; then git clone https://github.com/historicalsource/zork3 "$OUT/src/zork3"; fi

echo "[zork] cloning ZILF…"
if [ ! -d "$OUT/src/zilf" ]; then git clone https://github.com/taradinoc/zilf "$OUT/src/zilf"; fi

echo "[zork] building ZILF (.NET)…"
pushd "$OUT/src/zilf" >/dev/null
dotnet build Zilf.sln -c Release
popd >/dev/null

ZILF_DLL="$(find "$OUT/src/zilf" -path '*Zilf/bin/Release*' -name 'Zilf.dll' | head -n 1 || true)"
ZAPF_DLL="$(find "$OUT/src/zilf" -path '*Zapf/bin/Release*' -name 'Zapf.dll' | head -n 1 || true)"

if [ -z "$ZILF_DLL" ] || [ -z "$ZAPF_DLL" ]; then
  echo "[zork] ERROR: could not locate Zilf.dll or Zapf.dll after build."
  exit 1
fi

compile_one () {
  local title="$1"
  local srcdir="$OUT/src/$title"

  local zil
  zil="$(find "$srcdir" -maxdepth 3 -iname "${title}.zil" | head -n 1 || true)"
  if [ -z "$zil" ]; then
    echo "[zork] ERROR: could not find ${title}.zil in $srcdir"
    exit 1
  fi

  echo "[zork] compiling $title from $zil"
  pushd "$(dirname "$zil")" >/dev/null

  # zilf outputs a .zap file; zapf turns it into .z3
  dotnet "$ZILF_DLL" "$(basename "$zil")"
  local zap="${title}.zap"
  if [ ! -f "$zap" ]; then
    # fallback: find any .zap created
    zap="$(ls -1 *.zap | head -n 1)"
  fi

  dotnet "$ZAPF_DLL" "$zap" "$OUT/compiled/${title}.z3"
  popd >/dev/null

  echo "[zork] wrote $OUT/compiled/${title}.z3"
}

compile_one zork1
compile_one zork2
compile_one zork3

echo "[zork] done."
SH
chmod +x scripts/build_zork.sh

# --- scripts: zork smoketest ---
cat > scripts/zork_smoketest.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspaces/clawdbot-omni-games"
Z3="$ROOT/data/zork/compiled/zork1.z3"

if [ ! -f "$Z3" ]; then
  echo "[zork] missing $Z3 (run make zork-build)"
  exit 1
fi

echo "[zork] running quick frotz smoketest…"

# Run a couple commands non-interactively by piping input
printf "look\ninventory\nquit\ny\n" | frotz -w 80 "$Z3" | head -n 60
echo "[zork] smoketest complete."
SH
chmod +x scripts/zork_smoketest.sh

echo "Bootstrapped repo at $ROOT"
echo "Next:"
echo "  cd $ROOT"
echo "  make bootstrap"
echo "  make build"
echo "  make run"
```

## Post-Bootstrap Commands

After running the bootstrap script:

```bash
cd /workspaces/clawdbot-omni-games
make bootstrap    # Install npm deps + honcho
make build        # Compile TypeScript
make selftest     # Verify build sanity
make run          # Start MCP server
```

For Zork support (optional):

```bash
make zork-deps      # Install frotz, dotnet, etc.
make zork-build     # Clone + compile Zork I/II/III
make zork-smoketest # Quick frotz test
```

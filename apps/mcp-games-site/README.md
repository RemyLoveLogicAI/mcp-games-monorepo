# MCP Games Flagship

The playable flagship surface for MCP Games. It ships a complete browser-native
run of **The Morning Decision**, a command console for the NOVA agent, reactive
player stats, rewards, keyboard controls, and an optional live connection to the
MCP connector service.

## Run

```bash
npm install
npm run dev
```

The site remains fully playable with its embedded agent core. To connect it to a
running super server, set:

```bash
NEXT_PUBLIC_MCP_CONNECTOR_URL=http://localhost:3001
```

Then launch `apps/mcp-connector`. The console's `connect` command and the
**Connect Super Server** control use its `/health` endpoint.

## Player controls

- Tap a story choice or press its number key.
- Use `help`, `status`, `scan`, `choose 1`, `boost`, `connect`, and `reset` in
  the NOVA console.
- Sound can be disabled from the header.

The biofeedback values are fictional game metrics, not medical measurements or
medical guidance.

# Quick Start Guide: Clawdbot Omni Games

Zero philosophy, just execution.

## Prerequisites

- Linux environment (Codespaces recommended)
- Node.js >= 18.0.0
- npm or pnpm
- Python 3.x (for voice gateway stub)

## Step 1: Bootstrap the Repository

```bash
# Run the bootstrap script (creates entire scaffold)
# See BOOTSTRAP.md for the full script
cd /workspaces/clawdbot-omni-games
make bootstrap
make build
```

## Step 2: Run the MCP Server

```bash
make run
```

The server starts in stdio mode (designed for MCP host integration).

## Step 3: Verify It Works

In another terminal:

```bash
make selftest
```

Expected output:
```
Selftest (build sanity): OK
Next: run the MCP server and use your host client to call tools.
```

## Step 4: Test with MCP Tools

### List Available Engines

Call `engines.list` via your MCP client:

```json
{
  "engines": [
    { "id": "cyoa", "title": "CYOA (JSON story engine)" },
    { "id": "zolk", "title": "ZOLK (procedural Zork-like engine)" },
    { "id": "zork", "title": "Zork I/II/III (ZIL -> Z3 -> Frotz)" }
  ]
}
```

### Start a CYOA Session

```json
// Call session.start
{
  "engine": "cyoa",
  "storyId": "sample"
}

// Response includes sessionId + initial story node
```

### Play ZOLK

```json
// Start session
{ "engine": "zolk", "seed": 42 }

// Send commands
{ "sessionId": "sess_xxx", "input": "look" }
{ "sessionId": "sess_xxx", "input": "go north" }
{ "sessionId": "sess_xxx", "input": "inventory" }
```

## Step 5: Add Zork Support (Optional)

```bash
make zork-deps      # Install frotz, .NET, etc.
make zork-build     # Clone and compile Zork I/II/III
make zork-smoketest # Verify it works
```

Then start a Zork session:

```json
{
  "engine": "zork",
  "zorkTitle": "zork1"
}
```

## Step 6: Always-On Mode

```bash
make supervise
```

This runs both the MCP server and voice gateway stub via honcho.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `npm install` fails | Ensure Node.js >= 18 |
| TypeScript errors | Run `make build` again |
| Zork not working | Run `make zork-deps && make zork-build` |
| Missing honcho | `pip install --user honcho` |

## What's Next?

1. **Create custom CYOA stories**: Add JSON files to `data/cyoa/`
2. **Customize personas**: Edit files in `persona/packs/`
3. **Integrate with your agent**: Connect via MCP stdio transport
4. **Add voice**: Implement the PersonaPlex adapter in `voice/gateway.py`

## Related Documentation

- [KiloCode Prompt](./KILOCODE-PROMPT.md) - The original prompt specification
- [Bootstrap Script](./BOOTSTRAP.md) - Full scaffold generator

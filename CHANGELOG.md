# Changelog

## Unreleased

### Added

- Added the `@mcp-games/execution-ledger` workspace with RFC 8785
  canonicalization, versioned SHA-256 proposal and receipt-event hashing, a
  PostgreSQL ledger migration, and a public package entry point.
- Added deterministic execution-ledger tests covering canonical ordering,
  unsupported JSON values, proposal hashes, and receipt-chain inputs.
- Added the execution-ledger dependency graph to the pnpm lockfile.

### Fixed

- Made Sites metadata and migration packaging single-flight across vinext's
  concurrent Vite environments, eliminating intermittent `EEXIST` failures.

### Verified

- `pnpm test`: 21/21 Turborepo tasks passed.
- `pnpm typecheck`: 13/13 tasks passed.
- `pnpm lint`: 5/5 tasks passed.
- `pnpm build:flagship`: 7/7 tasks passed.
- Forced uncached flagship build and rendered-page test: passed.

### Operations

- TestChimp skill preflight passed at version `1.0.5`; repository-level
  TestChimp execution remains pending `/testchimp init` because the project
  markers, MCP configuration, and test instructions are not present.
- Added repository governance and security metadata.

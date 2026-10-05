# Contributing

Thanks for looking. This is a small, opinionated project and the bar for a change is that it stays true to a few commitments.

## The commitments

1. **Every control does real work.** A button that calls a route, mutates or reads persisted state, and shows a truthful loading, success, empty or failure state. No dead controls, no `console.log` actions, no local-storage persistence dressed up as a backend.
2. **The product is honest about provenance.** `live`, `curated` and `fallback` are distinct everywhere they appear, and fallback data is never presented as current.
3. **The engine is deterministic.** No clock, no randomness, no network inside `gradeVolume`. If your change makes the same input produce different output, it will fail a test.
4. **Deleting keeps the evidence.** Retiring a volume or removing a sheet writes a tombstone so an audit chain stays replayable. Erasing rows is not an option.

## Getting set up

```bash
npm install
npm run dev
```

No environment variables, no database, no API keys. Local development uses an embedded Postgres (PGlite) and both live sources are keyless.

## Before you open a pull request

```bash
npm run check      # typecheck, lint, test, build
npm run test:e2e   # the primary journey in a real browser
```

If your change touches data sources, also run:

```bash
npm run verify:live   # against a running deployment
```

## Where things live

| Path | Responsibility |
| --- | --- |
| `src/lib/taxonomy.ts` | The ten risk classes and the weighted lexicons. Changing these changes every score. |
| `src/lib/engine.ts` | `gradeVolume`. Pure, versioned, documented. Add tests for any new factor. |
| `src/lib/canonical.ts` | Canonical JSON and the SHA-384 seal chain. Known-answer tests live beside it. |
| `src/lib/service.ts` | Every mutation and every read. Routes, pages and MCP tools all call this. |
| `src/lib/sources/` | arXiv, OpenAlex, the open-access bookshelf and the sealed snapshot. |
| `src/lib/mcp.ts`, `src/lib/mcp-handler.ts` | The JSON-RPC transport and tool dispatch. |
| `src/app/api/` | Typed REST. One envelope, correct status codes. |
| `e2e/journey.spec.ts` | The primary journey, through visible controls only. |

## Adding a risk class

It is deliberately a bit of work, because the class is a shared contract:

1. Add the id to `CLASS_IDS` in `src/lib/types.ts`.
2. Add the class and a weighted lexicon to `RISK_CLASSES` in `src/lib/taxonomy.ts`.
3. Add it to the `mounted_class` check constraint in `src/lib/db/schema.ts`.
4. Update `engine.test.ts`: the class count assertions and the gap ranking.

## Adding an MCP tool

Tools call the same service functions the interface uses. If a tool needs logic the UI does not have, that is a signal the logic belongs in `src/lib/service.ts` and the UI should grow it too.

Add a schema to `TOOLS` in `src/lib/mcp.ts`, a case to `runTool`, and a test that exercises the mutation and reads it back through the service.

## Style

Match the surrounding code. The comments explain *why* a decision was made, not what the next line does. Do not add rules to silence a lint warning; fix the code.

## Reporting a security issue

Please do not open a public issue. See [SECURITY.md](SECURITY.md).
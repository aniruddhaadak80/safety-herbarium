# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Email **aniruddhaadak80@users.noreply.github.com** with:

- what the issue is, in one paragraph
- the route or component involved
- steps to reproduce
- what an attacker gains

You can expect an acknowledgement within 72 hours and a fix or mitigation plan within two weeks. If a fix is not possible in that window you will get an explanation and a date.

## What this project is and is not exposed to

There are no accounts and no passwords. A visitor owns their volumes through an unguessable 128-bit token in an HTTP-only cookie, or through an `x-herbarium-scope` header when acting as an agent. Anyone holding a token can see and change only what that token owns.

### Deliberate, accepted properties

- **Clearing cookies loses access.** Ownership is the token. There is no recovery, by design: a recovery path would be an account system with an attack surface. Export a volume before clearing.
- **Anyone with a share link can read that volume.** The token is 18 random bytes. Revoke it from the volume page; revocation is a sealed audit event, not a silent deletion.
- **Rate limiting is best-effort.** Counters live in the database, so a cold start cannot reset them, but two concurrent requests for a brand-new bucket can both insert and the count can briefly under-report. It reliably stops one misbehaving client. A hard guarantee needs a hosted limiter in front of these routes.

### What is enforced

- Every read and write is filtered by scope. Cross-session reads return 404 for volumes and 403 for sheets.
- SQL is parameterised throughout; no string interpolation of user input into queries.
- All external input is length-bounded and shape-checked before it reaches SQL, a URL or a page (`src/lib/validation.ts`).
- Only `https` URLs on a fixed host allowlist can be ingested or embedded.
- Upstream fetches are time-bounded with a single retry, and a visitor's search string is sanitised to letters, digits and spaces before it goes upstream.
- Non-finite numbers are rejected by canonical JSON rather than silently dropped, so a seal cannot verify against a lossy encoding.
- Error responses never include stack traces, SQL or environment values.
- No secret is required to run the core experience, and none is embedded in the client bundle.

## Disclosure

We ask for 90 days before public disclosure, or until a fix ships, whichever comes first. Credit is yours.
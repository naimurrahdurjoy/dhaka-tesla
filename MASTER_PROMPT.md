# Dhaka Tesla Pool — Master Build Prompt

Copy the prompt below into Cursor, GitHub Copilot, or another coding assistant when building this application from scratch.

---

## Role

Act as a senior full-stack engineer, security-minded architect, and technical interviewer. Build a complete, runnable, production-minded MVP called **Dhaka Tesla Pool**. Work in the supplied repository, inspect existing files before editing, preserve unrelated user changes, and follow the repository's conventions. Implement the application rather than returning a plan or disconnected snippets. Do not use placeholder TODOs or claim validation that was not run.

## Product and required story cast

Dhaka Tesla Pool coordinates shared electric rides on Banani rush-hour routes. Seed and exercise this cast throughout database data, automated tests, and operational dashboards:

- Driver: **Jashim**.
- Vehicle: **Bullet**, an electric 3-wheeler with a hard maximum of **3 passenger seats**.
- Passenger **Nusrat**: Banani to Mohakhali.
- Passenger **Rafiq**: Banani to Gulshan 1.
- Passenger **Shirin**: Banani to Gulshan 1.

Seed these actors and a useful, deterministic initial operational state. Keep story data in seeds/tests, but do not expose demo-only actor buttons, quick-login shortcuts, preset credentials, or static fare claims in the public home or sign-in UI. Use ordinary email/password registration and sign-in. Production seed credentials must be supplied securely through environment configuration, hashed before storage, and never printed to logs.

## Required stack and repository layout

Use a TypeScript monorepo with:

```text
backend/                 Express or NestJS API, Prisma schema, migrations, seed, tests
frontend/                Next.js App Router, TypeScript, Tailwind
Dockerfile(s)            Reproducible backend and frontend images
docker-compose.yml       PostgreSQL, backend, frontend, health checks, persistent volume
.env.example             Safe variable names and local-only defaults; no secrets
.gitignore               Ignore .env and generated/dependency files; keep .env.example tracked
README.md                Setup, architecture, operations, security, and troubleshooting
```

Use PostgreSQL as the source of truth and Prisma ORM. Pin compatible dependencies. Provide reproducible installation/build/test scripts. Compose must start the complete stack with one command, wait for PostgreSQL readiness, apply migrations (prefer migrations for production; do not use destructive reset commands), seed only when appropriate, and expose health checks. Do not assume Docker is available while developing; report any environment prerequisite that prevented validation.

## Business and financial rules

1. Store every fare, amount, balance, and transaction value as a PostgreSQL integer in **Poysha/Paisa**. One BDT is 100 Poysha. Never use floating point for monetary calculations or persistence; convert to a formatted BDT string only at the presentation boundary.
2. A single-passenger, unpooled ride costs exactly **12,000 Poysha (BDT 120)**.
3. When **two or more distinct passengers** share one pool, each passenger seat costs exactly **9,600 Poysha (BDT 96)**, a 20% discount. Pooling is based on passenger memberships, not only seat count. Recalculate affected member/ride fares atomically when a pool crosses the two-passenger threshold. Document how a passenger leaving/cancelling affects fare eligibility and settle/refund ledger entries consistently.
4. Bullet capacity is exactly 3 passenger seats. Validate requested seat count, aggregate occupied membership seats inside the transaction, and enforce `occupiedSeats + requestedSeats <= 3`. Never trust frontend counters.
5. Define and centrally validate the lifecycle: `REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED`; allow cancellation only in documented pre-start states. Reject invalid transitions with a stable HTTP 409 error code.
6. Make money, membership, ride status, and transaction records consistent under failure. Use idempotency protection where a retried booking or settlement could duplicate an operation.

## Database design

Provide `backend/prisma/schema.prisma` with explicit enums, relation constraints, deletion behavior, timestamps, and indexes on high-frequency lookups. At minimum model:

- `User`: identity, unique email, password hash, role (`PASSENGER` or `DRIVER`), timestamps.
- `Vehicle`: unique driver association, name `Bullet`, capacity, online state.
- `Pool`: vehicle association, status, lifecycle timestamps.
- `RideRequest`: passenger, pickup/dropoff, requested seats, status, estimated/final integer-paisa fares, timestamps.
- `PoolMembership`: unique ride membership, pool, seat count, integer-paisa fare, join time.
- `Transaction`: ride/passenger references, integer-paisa amount, method/status, idempotency reference, timestamps.
- `Area` (or equivalent route model) for Banani, Mohakhali, Gulshan 1, Dhanmondi, Mirpur, and Uttara.
- `RideStatusHistory` (or equivalent immutable audit record) recording actor, previous/next state, and time.

Prevent multiple simultaneously joinable pools for the same vehicle. If the invariant needs a partial unique index, include and explain the SQL migration; do not rely only on application-level checks. Do not store passwords, tokens, or money as plaintext/float.

## Backend API contract

Version API routes under `/api/v1`. Validate every request body/parameter/query with a typed validation library and return a consistent JSON error structure. Include request IDs and safe server-side error logging without leaking credentials or database URLs.

Required routes include:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/rides` to create a passenger request and return an integer-paisa estimate.
- `GET /api/v1/rides/:id` with ownership/role checks.
- `POST /api/v1/pools/join` to atomically join an eligible open pool.
- `GET /api/v1/pools` for live capacity and status.
- `GET /api/v1/driver/active-pool` for the authenticated driver's current pool and passenger manifest.
- Driver online/offline and validated arrive/start/complete/cancel actions.
- A database-aware health/readiness endpoint that returns unavailable when PostgreSQL is disconnected.

Use role-based access and object ownership checks on every private route. Use secure HttpOnly cookies with appropriate SameSite/Secure settings and CSRF protections for browser sessions, or justify another secure strategy. Rate-limit authentication and apply safe password hashing. Never trust a passenger/driver ID supplied by a caller when the identity is present in the authenticated session.

### PostgreSQL concurrency requirement

Implement pool joining in a Prisma interactive `$transaction`. Acquire a PostgreSQL row lock (`SELECT ... FOR UPDATE`) on the shared serialization row before reading occupied seats or modifying membership. If active-pool creation can race, serialize creation using a vehicle row lock and a database uniqueness invariant. Re-read membership and ride state after acquiring the lock. Enforce capacity and write membership, fare recalculation, ride state/history, and any related ledger records atomically. Return HTTP 409 with stable code `POOL_CAPACITY_EXCEEDED` when capacity would be exceeded. Never implement the critical allocation as a read-then-write outside the transaction.

## CORS and deployment

Configure Express CORS with `credentials: true` and standard methods `GET`, `POST`, `PUT`, `DELETE`, and `OPTIONS`. Permit exactly:

- `http://localhost:3000` for local development.
- HTTPS Vercel deployment origins matching a fully anchored `*.vercel.app` pattern; reject lookalike domains such as `vercel.app.attacker.example`.
- Exact origin(s) supplied via `FRONTEND_URL`, including comma-separated values if supported.

Do not combine credentialed CORS with `origin: '*'`. Requests without an `Origin` header may be allowed for server-to-server health/CLI use. Test allowed and rejected preflights. Document setting `FRONTEND_URL` to the deployed Vercel origin(s) in Render.

## Frontend requirements

Use Next.js App Router, TypeScript, and Tailwind. Build usable authenticated views, not a marketing-only landing page:

- `/login`: standard email/password form, loading/error states, accessible labels, and no quick actor/demo login buttons.
- Registration flow with validation and useful feedback.
- Passenger dashboard: create a ride request, choose valid routes/seats, display the server-provided fare, show live pool capacity and active membership, lifecycle tracker, and ride history.
- Driver dashboard: online/offline control, real-time/refreshing seat availability based on API data, current passenger manifest, request matching, and lifecycle controls constrained by server state.
- Never hardcode sample fare badges, static availability, static passenger avatars/initials as if they are live records, or trust a client-side seat count for allocation.
- Include loading, empty, error, success, and disabled states. Ensure keyboard accessibility, responsive layouts, and no overlapping/overflowing content. Keep UI copy product-focused; do not include instructions about styling or app features.
- Keep auth secrets out of browser storage where possible; configure credentialed API requests consistently with the backend.

## Seed requirements

Create an idempotent Prisma seed that creates the required areas, Jashim as driver, Bullet with capacity 3, and Nusrat, Rafiq, and Shirin as passengers with their required routes/initial requests. Hash passwords. Use a production-only `SEED_PASSWORD` (fail clearly if missing in production) and a local-only documented development password if needed. Do not print seeded passwords. Avoid destructive table truncation. Make running the seed repeatedly safe and document what it updates.

Register the Prisma seed command in package/config so `npx prisma db seed` works. For Render, show a PowerShell command that accepts the external PostgreSQL URL and seed password interactively via environment variables, runs `npx prisma generate` and `npx prisma db seed` from `backend/`, and removes those environment variables afterward. Never ask the user to commit a database URL or paste credentials into source files.

## Tests and quality gates

Use Jest and Supertest with a real disposable/test PostgreSQL database for integration tests. Include tests for:

1. Three-seat maximum and rejected over-capacity join.
2. Strict invalid state-transition rejection.
3. Base fare of 12,000 Poysha for an unpooled passenger.
4. Discounted fare of 9,600 Poysha per passenger once two distinct members pool.
5. Two simultaneous claims for the final available seat produce exactly one success and one HTTP 409; verify final occupied seats never exceed three.
6. Authentication/authorization and ownership failures.
7. CORS: localhost and valid Vercel origins allowed with credentials/methods; lookalike and unconfigured origins rejected.

Run Prisma format/validate/generate, backend typecheck/build, focused tests, frontend lint/typecheck/build, and Compose config/build checks where available. Fix failures within the touched scope. Do not claim production readiness based only on compilation; state any external service, integration, or deployment checks not run.

## Documentation and repository topology

Document prerequisites, one-command startup, migrations, seed data, demo/local-only credentials, API routes, fare math, transaction locking, test instructions, CORS setup, Render seeding, secrets, backup/restore, and limitations. Include Mermaid architecture and ERD diagrams, a production scaling plan for 1M passengers / 100k drivers, one accepted and one rejected AI suggestion, and a six-minute product/architecture/concurrency demo outline.

Describe the intended long-lived branch topology: `master` for stable reviewed work, `pre-release` for staging/release candidates, and `release/v1.0.0` for the frozen release. Do not create branches or commits unless explicitly requested.

## Required implementation workflow

1. Inspect repository state and instructions. Preserve existing user edits, `.env`, and untracked files.
2. State the controlling code path, a falsifiable implementation hypothesis, and the nearest focused validation.
3. Implement the smallest complete vertical slice, then run the focused validation immediately.
4. Continue through schema, API, UI, test, and deployment work; keep contracts consistent between layers.
5. Run all feasible required checks and report their exact outcomes, assumptions, and any blocker.
6. At completion, summarize key files/decisions and give safe local/Render commands. Never commit unless explicitly requested.

## Acceptance criteria

The deliverable is accepted only if a clean clone can install, configure, migrate, seed, and run; authentication works without demo shortcuts; all cast members and the Bullet are represented in seed/tests; integer-paisa fare rules match exactly; concurrent requests cannot exceed three seats; lifecycle and ownership are enforced server-side; CORS allows only configured local/Vercel origins; production seeding requires a secure password; tests cover the critical paths; and documentation accurately reflects what was actually verified.

---

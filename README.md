# Family Tree Management System

A full-stack application for recording multigenerational family history: people,
relationships (parents, spouses, guardians), life events, photos, and an
interactive family tree - with per-family access control.

This is a monorepo with two independently deployable apps:

```
family_tree/
  frontend/   Angular app (UI)
  backend/    Node.js + Express REST API (Prisma + PostgreSQL)
  docker-compose.yml   PostgreSQL for local development
```

Status: **Phase 1 complete** (architecture, database schema, migrations, seed
data). See [Implementation phases](#implementation-phases) below for what's
built and what's next.

## 1. Architecture overview

- **Frontend**: Angular (standalone components, lazy-loaded feature routes,
  Angular Material, Reactive Forms) talks to the backend only through typed
  API services - no direct database or storage access.
- **Backend**: Express REST API. Each feature module (`auth`, `families`,
  `persons`, `relationships`, `photos`, `events`, `permissions`) is split into
  routes -> controllers -> services, with Zod schemas validating every
  request. Controllers stay thin; business rules and transactions live in
  services.
- **Database**: PostgreSQL, accessed through Prisma. All primary keys are
  UUIDs. Prisma's query API handles ordinary CRUD; ancestor/descendant tree
  traversal uses a hand-written, parameterized `WITH RECURSIVE` SQL query
  (via `prisma.$queryRaw` with tagged-template parameters, never string
  concatenation) because Prisma cannot express recursive queries natively.
- **Auth & authorization**: JWT access/refresh tokens (bcrypt-hashed
  passwords). Every family-scoped endpoint re-checks the caller's
  `FamilyUserPermission` role (OWNER/EDITOR/VIEWER) server-side - the Angular
  route guards are a UX convenience only, never the real security boundary.
- **File storage**: a small storage abstraction (`StorageProvider` interface)
  with a local-disk implementation for development and an S3-compatible
  implementation for production, selected by `STORAGE_DRIVER`. Only
  `storageKey` + metadata are persisted in Postgres; binaries never go in an
  ordinary table row.
- **One relationship table, not one per type**: `person_relationships` is a
  single directed-edge table (`relationshipType` enum: `PARENT`, `SPOUSE`,
  `GUARDIAN`). Siblings are derived at query time from shared `PARENT` edges
  rather than stored. A "former spouse" is a `SPOUSE` row with `validTo` set
  - no extra table or flag needed. See the schema comments in
  [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) for the full
  reasoning, including how adoption/step-parent types will be added later.

### Why Prisma 7's connection setup looks different

Prisma 7 removed the `url` field from `datasource` in `schema.prisma`.
Connection info now lives in two places:

- [`backend/prisma.config.ts`](backend/prisma.config.ts) - read by the
  **Prisma CLI** (`migrate`, `studio`, `db pull`) only.
- [`backend/src/config/prisma.ts`](backend/src/config/prisma.ts) - the
  **app's own `PrismaClient`**, constructed with an explicit `@prisma/adapter-pg`
  driver adapter (required by Prisma 7 at runtime). Import `prisma` from this
  module everywhere in backend code instead of constructing a new client.

## 2. Technology stack (versions pinned and verified compatible)

| Layer | Choice | Version |
|---|---|---|
| Frontend framework | Angular | 22.2.x |
| Frontend language | TypeScript | ~6.0.3 |
| Frontend test runner | Vitest | ^5.0.0 (Angular CLI default) |
| Backend runtime | Node.js | >=24.0.0 (developed on 24.21.0) |
| Backend language | TypeScript | 6.0.3 |
| Backend framework | Express | 5.3.0 |
| ORM | Prisma / @prisma/client | 7.10.0 |
| Postgres driver adapter | @prisma/adapter-pg + pg | 7.10.0 / 8.23.1 |
| Validation | Zod | 4.6.5 |
| Auth | jsonwebtoken + bcrypt | 9.0.3 / 6.0.0 |
| Logging | pino + pino-http | 10.4.0 / 11.0.0 |
| Security middleware | helmet, cors, express-rate-limit | 8.3.0 / 2.8.6 / 8.7.1 |
| Uploads / images | multer + sharp | 2.4.0 / 0.35.5 |
| Backend tests | vitest + supertest | 5.0.3 / 7.3.1 |
| Database | PostgreSQL (Docker) | 18-alpine |
| DB admin client | DBeaver | any recent version (external desktop app) |

All exact versions are pinned (no `^`/`~` ranges) in
[`backend/package.json`](backend/package.json) so installs are reproducible.

**Note on `prisma` CLI's own dependency tree**: `npm audit` reports 4 high
severity advisories (`deepmerge-ts`, `mysql2`) that come from the `prisma`
CLI's internal multi-database tooling, not from `@prisma/client` or any
runtime code path. `prisma` is a devDependency; `npm audit fix --force` would
downgrade it to an older major (6.19.3), which we deliberately avoided. Treat
this as a known, low-risk, dev-tool-only advisory - re-check it when
upgrading Prisma.

## 3. Entity-relationship diagram

```mermaid
erDiagram
    USER_ACCOUNT ||--o{ FAMILY : "creates"
    USER_ACCOUNT ||--o{ PERSON : "creates"
    USER_ACCOUNT ||--o{ FAMILY_USER_PERMISSION : "holds"
    FAMILY ||--o{ FAMILY_USER_PERMISSION : "grants"
    FAMILY ||--o{ FAMILY_MEMBERSHIP : "contains"
    FAMILY ||--o{ PERSON_RELATIONSHIP : "scopes"
    FAMILY }o--o| PERSON : "root person (optional)"
    PERSON ||--o{ FAMILY_MEMBERSHIP : "belongs to"
    PERSON ||--o{ PERSON_PHOTO : "has"
    PERSON ||--o{ PERSON_EVENT : "has"
    PERSON ||--o{ PERSON_RELATIONSHIP : "is personId (subject) in"
    PERSON ||--o{ PERSON_RELATIONSHIP : "is relatedPersonId (object) in"

    USER_ACCOUNT {
        uuid id PK
        string fullName
        string email UK
        string passwordHash "nullable"
        boolean isActive
        enum role "SUPER_ADMIN | ADMIN | USER"
    }
    FAMILY {
        uuid id PK
        string familyName
        string description "nullable"
        uuid rootPersonId FK "nullable"
        uuid createdBy FK
    }
    PERSON {
        uuid id PK
        string firstName
        string lastName "nullable"
        enum gender
        date dateOfBirth "nullable"
        date dateOfDeath "nullable"
        boolean isLiving
        uuid createdBy FK
    }
    FAMILY_MEMBERSHIP {
        uuid id PK
        uuid familyId FK
        uuid personId FK
        string membershipRole "nullable"
    }
    PERSON_RELATIONSHIP {
        uuid id PK
        uuid familyId FK
        uuid personId FK "subject"
        uuid relatedPersonId FK "object"
        enum relationshipType "PARENT | SPOUSE | GUARDIAN"
        date validFrom "nullable"
        date validTo "nullable"
    }
    PERSON_PHOTO {
        uuid id PK
        uuid personId FK
        string storageKey
        boolean isPrimary
    }
    PERSON_EVENT {
        uuid id PK
        uuid personId FK
        enum eventType
        date eventDate "nullable"
    }
    FAMILY_USER_PERMISSION {
        uuid id PK
        uuid familyId FK
        uuid userId FK
        enum role "OWNER | EDITOR | VIEWER"
    }
```

### Relationship and cardinality notes

- **UserAccount 1 -> N Family / Person (`createdBy`)**: every family and
  person record tracks its creator. `onDelete: Restrict` - a user cannot be
  hard-deleted while they still own records (deactivate via `isActive`
  instead).
- **Family 1 -> N FamilyMembership <- N 1 Person** (many-to-many through
  `FamilyMembership`): a person can belong to multiple family trees; a family
  has many members. Unique on `(familyId, personId)`.
- **Family 0..1 -> 1 Person (`rootPersonId`)**: optional "anchor" person a
  tree is drawn from. `onDelete: SetNull` - deleting that person doesn't
  delete the family, just clears the pointer.
- **Family 1 -> N PersonRelationship**: every relationship edge is scoped to
  one family tree (the same two people could have a different-looking
  relationship recorded in a different tree, e.g. adoptive vs. biological
  trees).
- **Person 1 -> N PersonRelationship (twice)**: a person can appear as the
  *subject* (`personId`) of many edges and as the *object*
  (`relatedPersonId`) of many others. Two distinct Prisma relation names
  (`RelationshipAsPerson` / `RelationshipAsRelatedPerson`) because both FKs
  point at the same `Person` table.
- **Person 1 -> N PersonPhoto, Person 1 -> N PersonEvent**: standard
  one-to-many, cascade-deleted with the person.
- **Family 1 -> N FamilyUserPermission <- N 1 UserAccount**: per-family
  access control, unique on `(familyId, userId)`.

Constraints that aren't expressible in the Prisma schema language are added
by hand in
[`backend/prisma/migrations/20261011120100_add_check_constraints/migration.sql`](backend/prisma/migrations/20261011120100_add_check_constraints/migration.sql):

- A person's death date can't precede their birth date.
- A living person can't have a death date.
- A relationship row can't point a person at themselves.
- `validTo` can't precede `validFrom`.
- **Spouse de-duplication**: `SPOUSE` rows must have `personId < relatedPersonId`
  (UUIDs compared lexically) - enforced by both the relationship service
  (Phase 2) and this DB CHECK constraint, so "A married to B" can never be
  stored as two different rows.
- **One primary photo per person**: a partial unique index on
  `person_photos(person_id) WHERE is_primary = true`.

Two invariants are **not** DB constraints because they require graph
traversal, not a row-local check - they belong in the Phase 2 relationship
service, inside a transaction:
- Preventing parent/child cycles (nobody can be their own ancestor).
- Verifying both people in a relationship belong to the stated family.

### System roles vs. family roles

There are **two independent authorization axes** - don't conflate them:

| | `UserRole` (`user_accounts.role`) | `PermissionRole` (`family_user_permissions.role`) |
|---|---|---|
| Scope | Global, one per account | Per family tree, one row per (family, user) |
| Question it answers | "Can this account administer other *accounts*?" | "Can this account edit *this specific family tree*?" |
| Values | `SUPER_ADMIN`, `ADMIN`, `USER` | `OWNER`, `EDITOR`, `VIEWER` |

`UserRole` permission matrix (enforced server-side in the Phase 2 `users`
module, not just hidden in the UI):

| Caller role | Can create | Can view |
|---|---|---|
| `SUPER_ADMIN` | `ADMIN`, `USER` accounts | all accounts |
| `ADMIN` | `USER` accounts only | `USER` accounts only |
| `USER` | nothing (403) | other `USER` accounts only |

Notes:
- **No API endpoint ever creates a `SUPER_ADMIN`** - not even another
  `SUPER_ADMIN` can do it through the API. The first (and any further)
  super-admin is provisioned via the seed script or direct database access.
  This is deliberate: it removes privilege escalation to the top role as an
  API attack surface entirely.
- Public self-registration (`POST /api/auth/register`) always creates a
  `USER`-role account. `ADMIN`/`SUPER_ADMIN` accounts are only ever
  provisioned by an existing admin through the protected `users` endpoints.
- Holding `ADMIN` or `SUPER_ADMIN` grants **no** implicit access to any
  family's data. Seeing someone's family tree still always goes through
  `FamilyUserPermission` - the two systems never short-circuit each other.

## 4. Project folder structure

```
family_tree/
  docker-compose.yml          PostgreSQL for local dev
  .gitignore
  README.md                   This file

  frontend/                   Angular app
    src/app/
      core/                   auth, guards, interceptors, services (Phase 3)
      shared/                 components, pipes, validators (Phase 3)
      features/
        dashboard/
        families/
        persons/
        relationships/
        family-tree/
        photos/
        events/
        permissions/
        settings/

  backend/                    Express REST API
    prisma/
      schema.prisma            Data model (source of truth)
      migrations/               Versioned, committed SQL migrations
      seed.ts                   Sample 3-generation family
    prisma.config.ts            Prisma CLI config (Prisma 7)
    src/
      config/                   env/config loading, Prisma client (adapter-based)
      middleware/                auth, error handling, rate limiting (Phase 2)
      modules/
        auth/
        families/
        persons/
        relationships/
        photos/
        events/
        permissions/
      common/
        errors/
        validators/
        utils/
      app.ts, server.ts         Phase 2
    tests/                      Phase 2+
    uploads/                    Local file storage (dev only, gitignored contents)
    .env.example
    .env                        Local dev secrets (gitignored, generated for you)
```

Folders for Phase 2+ code already exist (with `.gitkeep`) so the structure is
confirmed up front, per the project's phased build plan.

## 5. Prerequisites

- Node.js >= 24 and npm (already verified in this environment: Node 24.21.0,
  npm 11.19.0).
- **Docker Desktop** (for PostgreSQL via `docker-compose.yml`). **Not
  installed in this environment** - install it to run the database steps
  below, or point `DATABASE_URL` at any PostgreSQL 14+ instance you already
  have.
- [DBeaver](https://dbeaver.io/) (optional, for browsing/querying the
  database with a GUI).

## 6. Environment configuration

```bash
cd backend
cp .env.example .env   # a working .env with generated secrets already exists; .env.example documents it
```

Key variables (see `.env.example` for the full list and comments):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string, matches `docker-compose.yml` defaults |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets (generate your own for anything beyond local dev) |
| `CORS_ORIGIN` | Allowed frontend origin (`http://localhost:4200`) |
| `STORAGE_DRIVER` | `local` (dev) or `s3` (production) |
| `RATE_LIMIT_*` | Rate limiting thresholds |

Never commit a real `.env`. The repo's `.gitignore` already excludes it; only
`.env.example` is tracked.

## 7. Database setup (Docker Compose)

```bash
# from the repo root
docker compose up -d
docker compose ps        # wait for postgres to report "healthy"
```

This starts PostgreSQL 18 on `localhost:5432` with:
- database: `family_tree_db`
- user: `family_tree_app`
- password: `changeme` (dev only - matches `backend/.env`)

## 8. Prisma migrations

The migration history already exists and is committed:

```
backend/prisma/migrations/
  migration_lock.toml
  20261011120000_init/migration.sql                 generated schema (tables, enums, FKs, indexes)
  20261011120100_add_check_constraints/migration.sql  CHECK constraints + partial unique index
  20261011130000_add_user_role/migration.sql          UserRole enum + user_accounts.role column
```

**How `20261011120000_init` was produced**: this sandbox has no Docker/Postgres
available, so instead of `prisma migrate dev` (which needs a live database),
the SQL was generated offline and deterministically from the schema with:

```bash
cd backend
npx prisma migrate diff --from-empty --to-schema=prisma/schema.prisma --script
```

This has **not yet been executed against a real database** - only validated
with `prisma validate` and reviewed by hand against the schema. Once Docker
(or any reachable Postgres) is available, apply it with:

```bash
cd backend
npx prisma migrate deploy      # applies both migrations in order
# or, if you plan to keep evolving the schema interactively:
npx prisma migrate dev
```

`prisma migrate dev` will detect the existing migration folders and apply
them, then keep the schema and migration history in sync for any further
changes you make to `schema.prisma`.

Generate the Prisma client any time after changing the schema:

```bash
npm run prisma:generate
```

## 9. Seeding sample data

```bash
cd backend
npm run db:seed
```

Creates three demo accounts (one per `UserRole`), one family ("The Reddy
Family"), and 10 people across three generations - including a divorced
"former spouse" example and siblings derived from shared parents - so the
relationship model, the role hierarchy, the future tree view, and API work
all have realistic data immediately.

All demo accounts use password `Passw0rd!2026` (local dev only):

| Email | `UserRole` | Notes |
|---|---|---|
| `demo.owner@familytree.local` | `SUPER_ADMIN` | Also owns the seeded family (`PermissionRole.OWNER`) |
| `demo.admin@familytree.local` | `ADMIN` | Can create/view `USER` accounts |
| `demo.user@familytree.local` | `USER` | Can view other `USER` accounts only |

`prisma migrate reset` (drops the DB, reapplies all migrations, then seeds
automatically) is the fastest way to get back to a clean state:

```bash
npm run prisma:migrate:reset
```

## 10. DBeaver connection

1. **Database > New Database Connection > PostgreSQL**.
2. Host: `localhost`, Port: `5432`, Database: `family_tree_db`.
3. Username: `family_tree_app`, Password: `changeme`.
4. Test Connection -> Finish.
5. DBeaver is a client only; it talks to the same Postgres container the
   backend uses. No separate setup is needed on the database side.

## 11. Running the apps

Not available until Phase 2 (backend) and Phase 3 (frontend). This section
will be filled in as those phases land; for now:

```bash
# Frontend only (static scaffold, no backend wired up yet)
cd frontend
npm install
npm start   # http://localhost:4200
```

## 12. Testing

Backend: `npm test` (vitest + supertest) - test suite lands in Phase 2
alongside the Express app.
Frontend: `npm test` (vitest, Angular CLI default) - component/service tests
land in Phase 3.

## 13. Security considerations (so far)

- Passwords are never stored in plaintext; `passwordHash` is bcrypt-hashed
  (cost factor 12 in the seed script).
- Secrets live in `.env` (gitignored); `.env.example` documents the shape
  without real values.
- Every family-scoped record is reachable only through
  `FamilyUserPermission` checks enforced server-side (Phase 2) - UUIDs alone
  are not treated as a capability token.
- File uploads will be validated by content (via `sharp`), not by trusting
  the client-supplied extension (Phase 5).

This section expands with each phase (CORS, rate limiting, auth token
handling, upload validation, structured logging without secrets, data
export/deletion policy).

## 14. Troubleshooting

| Problem | Fix |
|---|---|
| `docker compose up` fails / `docker` not found | Install Docker Desktop and ensure it's running |
| `prisma migrate deploy` can't reach the database | Confirm `docker compose ps` shows postgres as healthy and `DATABASE_URL` in `backend/.env` matches |
| `npm install` blocks on install scripts | This repo's `backend/package.json` already has `allowScripts` entries for `bcrypt`, `prisma`, and `@prisma/engines`; run `npm rebuild` if native bindings didn't build |
| Prisma Client out of date after a schema change | `npm run prisma:generate` |

## Implementation phases

- [x] **Phase 1 - Architecture and database**: project structure, ER diagram,
      Prisma schema, Docker Compose, initial + constraints migrations, seed
      data, DBeaver instructions. *(this document)*
- [ ] **Phase 2 - Backend**: Express app, auth, family/person CRUD,
      memberships, relationships (incl. recursive ancestor/descendant
      queries), validation, permissions, error handling, automated tests.
- [ ] **Phase 3 - Frontend**: Angular auth screens, dashboard, family
      management, member directory/profiles, forms, API services.
- [ ] **Phase 4 - Family tree**: visualization, search/zoom/pan, relationship
      editing UI, complex-structure testing.
- [ ] **Phase 5 - Additional features**: photo upload/gallery (storage
      abstraction), life events UI, permissions UI, optional audit history.
- [ ] **Phase 6 - Finalization**: full test run, security review, performance
      pass, deployment docs.

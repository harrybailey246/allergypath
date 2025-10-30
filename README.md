# EHR Monorepo

A TypeScript monorepo that groups together the EHR front-end (Next.js), API (NestJS + Prisma), and the legacy Create React App client.

## Repository layout

```
apps/
  api/   NestJS REST API with Prisma ORM
  web/   Next.js 14 front-end with Tailwind CSS
  cra/   Archived CRA project history (read-only)
```

Additional tooling:

- `docker-compose.yml` spins up PostgreSQL 16 and pgAdmin 4.
- `.github/workflows/ci.yml` validates builds and runs Prisma migrations in CI.

## Prerequisites

- Node.js 18+
- npm 9+
- Docker Desktop or Docker Engine (for the database)

## Quick start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Provision the database**

   ```bash
   docker compose up -d
   ```

   PostgreSQL will listen on `localhost:5432` with credentials `ehr:ehr`. pgAdmin is available at `http://localhost:5050` (username `admin@local.test`, password `admin`).

3. **Configure API environment**

   Copy the sample Prisma configuration and adjust if necessary:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

4. **Apply database migrations**

   ```bash
   npm run prisma:migrate --workspace api
   ```

   This runs `prisma migrate deploy` so the Postgres schema matches `schema.prisma`.

5. **Run the dev servers**

   ```bash
   npm run dev
   ```

   - Next.js serves the web app on [http://localhost:3000](http://localhost:3000)
   - NestJS serves the API on [http://localhost:4000](http://localhost:4000)

6. **Verify the API**

   With the stack running, calling the patients endpoint returns an empty array while the database is empty:

   ```bash
   curl http://localhost:4000/patients
   ```

## Prisma workflow

After adjusting the schema in `apps/api/prisma/schema.prisma`, run the migration commands:

```bash
npm run prisma:migrate --workspace api
```

This executes `prisma migrate deploy` and is also run automatically in CI.

## Legacy CRA client

The original Create React App project now lives in `apps/cra/`. Its history is preserved via `git mv`. The project is no longer wired into the development workflow but can still be built or served with its own npm scripts.

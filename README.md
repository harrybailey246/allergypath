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

4. **Configure web environment**

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

   Update both `.env` files with your Auth0 domain, application client credentials, audience, and a strong `AUTH0_SECRET` used by Next.js.

5. **Apply database migrations**

   ```bash
   npm run prisma:migrate --workspace api
   ```

   This runs `prisma migrate deploy` so the Postgres schema matches `schema.prisma`.

6. **Run the dev servers**

   ```bash
   npm run dev
   ```

   - Next.js serves the web app on [http://localhost:3000](http://localhost:3000)
   - NestJS serves the API on [http://localhost:4000](http://localhost:4000)

7. **Verify the API**

   With the stack running, calling the patients endpoint returns an empty array while the database is empty:

   ```bash
   curl http://localhost:4000/patients
   ```

## Auth0 configuration

1. Create a **Regular Web Application** in Auth0 for the Next.js client and note the domain, client ID, and client secret.
2. Under **APIs**, create a new API (identifier such as `https://YOUR_AUTH0_DOMAIN/api`) and enable the "Authorization" feature to manage RBAC roles (`ADMIN`, `CLINICIAN`, `NURSE`, `STAFF`). Assign at least one of these roles to test users.
3. In the application's **Settings**:
   - Allowed Callback URLs: `http://localhost:3000/api/auth/callback`
   - Allowed Logout URLs: `http://localhost:3000`
   - Allowed Web Origins: `http://localhost:3000`
4. Populate the `.env` files:
   - `apps/web/.env`: `AUTH0_SECRET`, `AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`, `NEXT_PUBLIC_API_URL`.
   - `apps/api/.env`: `AUTH0_ISSUER_BASE_URL`, `AUTH0_AUDIENCE`, optional `AUTH0_ROLE_CLAIM`, plus `DEFAULT_CLINIC_ID`/`DEFAULT_CLINIC_NAME` to control user provisioning.
5. Restart both dev servers so the new environment variables are picked up. The Next.js navbar now renders "Sign in"/"Sign out" links, displays the signed-in email, and all API calls automatically include the `Authorization: Bearer <jwt>` header.

## Prisma workflow

After adjusting the schema in `apps/api/prisma/schema.prisma`, run the migration commands:

```bash
npm run prisma:migrate --workspace api
```

This executes `prisma migrate deploy` and is also run automatically in CI.

## Legacy CRA client

The original Create React App project now lives in `apps/cra/`. Its history is preserved via `git mv`. The project is no longer wired into the development workflow but can still be built or served with its own npm scripts.

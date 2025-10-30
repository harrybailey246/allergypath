# Practice Management Service

This package contains a NestJS service powered by Prisma and PostgreSQL for managing practice operations such as appointments, inventory, and partner interactions.

## Getting started

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Set the `DATABASE_URL` environment variable to point at a PostgreSQL database before running Prisma commands.

## Project structure

- `src/`: NestJS application code entrypoints.
- `prisma/schema.prisma`: Prisma data model definition.
- `prisma/migrations/`: Versioned SQL migrations managed by Prisma Migrate.
- `docs/schema.md`: Entity relationships, CDC topics, and legacy mapping.

## Docker

Use the provided `Dockerfile` to build a production image.

```bash
docker build -t practice-management .
```

Pass the `DATABASE_URL` environment variable when running the container.

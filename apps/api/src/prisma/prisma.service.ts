import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { RequestContextService } from "../common/request-context.service";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://ehr:ehr@localhost:5432/ehr";

const MODELS_WITH_CLINIC_ID = new Set<Prisma.ModelName>(["Patient", "Encounter", "User"]);

const mergeWithClinicFilter = (where: Record<string, unknown> | undefined, clinicId: string) => {
  if (!where || Object.keys(where).length === 0) {
    return { clinicId };
  }

  if (typeof where.clinicId === "string") {
    return { ...where, clinicId };
  }

  return {
    AND: [where, { clinicId }],
  };
};

const ensureClinicId = (data: unknown, clinicId: string): unknown => {
  if (Array.isArray(data)) {
    return data.map((entry) => ensureClinicId(entry, clinicId));
  }

  if (typeof data === "object" && data !== null) {
    const record = { ...(data as Record<string, unknown>) };

    if (typeof record.clinicId !== "string" || record.clinicId.length === 0) {
      record.clinicId = clinicId;
    }

    return record;
  }

  return data;
};

export const createClinicIsolationMiddleware = (
  getClinicId: () => string | undefined,
): Prisma.Middleware => {
  return (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Prisma.PrismaPromise<unknown>,
  ) => {
    const clinicId = getClinicId();

    if (!clinicId || !params.model || !MODELS_WITH_CLINIC_ID.has(params.model)) {
      return next(params);
    }

    const args = (params.args ?? {}) as Record<string, unknown>;

    switch (params.action) {
      case "findUnique":
        params.action = "findFirst";
        params.args = {
          ...args,
          where: mergeWithClinicFilter(args.where as Record<string, unknown> | undefined, clinicId),
        };
        break;
      case "findFirst":
      case "findMany":
      case "count":
      case "aggregate":
      case "groupBy":
      case "delete":
      case "deleteMany":
        params.args = {
          ...args,
          where: mergeWithClinicFilter(args.where as Record<string, unknown> | undefined, clinicId),
        };
        break;
      case "update":
      case "updateMany":
        params.args = {
          ...args,
          where: mergeWithClinicFilter(args.where as Record<string, unknown> | undefined, clinicId),
          data: ensureClinicId(args.data, clinicId),
        };
        break;
      case "upsert":
        params.args = {
          ...args,
          where: mergeWithClinicFilter(args.where as Record<string, unknown> | undefined, clinicId),
          update: ensureClinicId(args.update, clinicId),
          create: ensureClinicId(args.create, clinicId),
        };
        break;
      case "create":
      case "createMany":
        params.args = {
          ...args,
          data: ensureClinicId(args.data, clinicId),
        };
        break;
      default:
        break;
    }

    return next(params);
  };
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly requestContext: RequestContextService) {
    super({
      datasources: {
        db: { url: databaseUrl },
      },
    });

    this.$use(createClinicIsolationMiddleware(() => this.requestContext.getClinicId()));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    await app.enableShutdownHooks();

    process.once("beforeExit", async () => {
      await app.close();
    });
  }
}

import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { RequestContextService } from "../common/request-context.service";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://ehr:ehr@localhost:5432/ehr";

const MODELS_WITH_CLINIC_ID = new Set<Prisma.ModelName>(["Patient", "Encounter", "User"]);

const addClinicFilter = (where: Record<string, unknown> | undefined, clinicId: string) => ({
  ...(where ?? {}),
  clinicId,
});

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
  return async (
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
          where: addClinicFilter(args.where as Record<string, unknown> | undefined, clinicId),
        };
        break;
      case "findFirst":
      case "findMany":
        params.args = {
          ...args,
          where: addClinicFilter(args.where as Record<string, unknown> | undefined, clinicId),
        };
        break;
      case "create":
        params.args = {
          ...args,
          data: ensureClinicId(args.data, clinicId),
        };
        break;
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

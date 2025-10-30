import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { RequestContextService } from "../common/request-context.service";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://ehr:ehr@localhost:5432/ehr";

const MODELS_WITH_CLINIC_ID = new Set(["Patient", "Encounter", "User"]);

const addClinicFilter = (where: Record<string, unknown> | undefined, clinicId: string) => ({
  ...(where ?? {}),
  clinicId,
});

export const createClinicIsolationMiddleware = (
  getClinicId: () => string | undefined,
): Prisma.Middleware => {
  return async (params, next) => {
    const clinicId = getClinicId();

    if (!clinicId || !params.model || !MODELS_WITH_CLINIC_ID.has(params.model)) {
      return next(params);
    }

    const args = params.args ?? {};

    switch (params.action) {
      case "findUnique":
        params.action = "findFirst";
        params.args = {
          ...args,
          where: addClinicFilter(args.where, clinicId),
        };
        break;
      case "findFirst":
      case "findMany":
        params.args = {
          ...args,
          where: addClinicFilter(args.where, clinicId),
        };
        break;
      case "create":
        params.args = {
          ...args,
          data: {
            ...args.data,
            clinicId: args?.data?.clinicId ?? clinicId,
          },
        };
        break;
      case "createMany":
        if (Array.isArray(args.data)) {
          params.args = {
            ...args,
            data: args.data.map((data) => ({
              ...data,
              clinicId: data?.clinicId ?? clinicId,
            })),
          };
        } else {
          params.args = {
            ...args,
            data: {
              ...args.data,
              clinicId: args?.data?.clinicId ?? clinicId,
            },
          };
        }
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

import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { PrismaService } from "../prisma/prisma.service";
import { USER_ROLES, type AuthenticatedUser, type UserRole } from "./types";

interface AuthValidationResult {
  user: AuthenticatedUser;
  tokenPayload: JWTPayload;
}

function ensureEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

@Injectable()
export class AuthService {
  private readonly issuerBaseUrl = ensureEnv("AUTH0_ISSUER_BASE_URL");
  private readonly audience = ensureEnv("AUTH0_AUDIENCE");
  private readonly roleClaim = process.env.AUTH0_ROLE_CLAIM ?? "https://example.com/roles";
  private readonly defaultClinicId = process.env.DEFAULT_CLINIC_ID ?? "default-clinic";
  private readonly defaultClinicName = process.env.DEFAULT_CLINIC_NAME ?? "Default Clinic";
  private readonly jwks = createRemoteJWKSet(new URL(`${this.issuerBaseUrl}/.well-known/jwks.json`));

  constructor(private readonly prisma: PrismaService) {}

  async validateToken(token: string): Promise<AuthValidationResult> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuerBaseUrl,
      audience: this.audience,
    });

    const email = this.extractEmail(payload);
    const role = this.extractRole(payload);

    const clinic = await this.prisma.clinic.upsert({
      where: { id: this.defaultClinicId },
      update: { name: this.defaultClinicName },
      create: {
        id: this.defaultClinicId,
        name: this.defaultClinicName,
      },
    });

    const userRecord = await this.prisma.user.upsert({
      where: { email },
      update: {
        role,
        name: typeof payload.name === "string" ? payload.name : undefined,
      },
      create: {
        email,
        role,
        name: typeof payload.name === "string" ? payload.name : undefined,
        clinicId: clinic.id,
      },
    });

    const user: AuthenticatedUser = {
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role as UserRole,
      clinicId: userRecord.clinicId,
    };

    return { user, tokenPayload: payload };
  }

  private extractEmail(payload: JWTPayload): string {
    const email = payload.email ?? payload["https://example.com/email"];

    if (typeof email !== "string") {
      throw new UnauthorizedException("JWT is missing the email claim");
    }

    return email.toLowerCase();
  }

  private extractRole(payload: JWTPayload): UserRole {
    const rawRoles = payload[this.roleClaim];
    let roles: string[] = [];

    if (Array.isArray(rawRoles)) {
      roles = rawRoles.filter((value): value is string => typeof value === "string");
    } else if (typeof rawRoles === "string") {
      roles = [rawRoles];
    }

    const validRoles = roles.filter((role): role is UserRole => USER_ROLES.includes(role as UserRole));

    if (validRoles.length > 0) {
      return validRoles[0];
    }

    if (USER_ROLES.includes("STAFF")) {
      return "STAFF";
    }

    throw new ForbiddenException("User does not have a valid role");
  }
}

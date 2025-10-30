import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { RequestContextService } from "../common/request-context.service";
import { AuthService } from "./auth.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    const { user } = await this.authService.validateToken(token);

    request.user = user;
    this.requestContext.setAuthContext({
      userId: user.id,
      clinicId: user.clinicId,
      role: user.role,
      email: user.email,
    });

    return true;
  }

  private extractToken(request: Request): string {
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid Authorization header");
    }

    return authorization.slice("Bearer ".length);
  }
}

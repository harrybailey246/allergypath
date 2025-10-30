import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { RequestContextService } from "./request-context.service";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.context.run(() => next());
  }
}

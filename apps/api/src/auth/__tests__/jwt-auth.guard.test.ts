import test from "node:test";
import assert from "node:assert/strict";
import type { ExecutionContext } from "@nestjs/common";
import { JwtAuthGuard } from "../jwt-auth.guard";
import { RequestContextService } from "../../common/request-context.service";
import type { AuthenticatedUser } from "../types";

const createExecutionContext = (request: Record<string, unknown>): ExecutionContext => {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
};

test("JwtAuthGuard throws when the Authorization header is missing", async () => {
  const requestContext = new RequestContextService();
  let validateTokenImpl = async () => ({ user: undefined as unknown as AuthenticatedUser });

  const authService = {
    validateToken: (token: string) => validateTokenImpl(token),
  };

  const guard = new JwtAuthGuard(authService as any, requestContext);
  const request: Record<string, unknown> = { headers: {} };
  const context = createExecutionContext(request);

  await assert.rejects(() => guard.canActivate(context), /Missing or invalid Authorization header/);
});

test("JwtAuthGuard attaches the authenticated user to the request and context", async () => {
  const requestContext = new RequestContextService();
  const user: AuthenticatedUser = {
    id: "user-1",
    email: "user@example.com",
    role: "ADMIN",
    clinicId: "clinic-1",
  };

  const authService = {
    validateToken: async () => ({ user }),
  };

  const guard = new JwtAuthGuard(authService as any, requestContext);
  const request: Record<string, any> = {
    headers: { authorization: "Bearer token" },
  };
  const context = createExecutionContext(request);

  await requestContext.run(async () => {
    assert.equal(await guard.canActivate(context), true);
    assert.deepEqual(request.user, user);
    assert.equal(requestContext.getClinicId(), user.clinicId);
    assert.equal(requestContext.getUserId(), user.id);
    assert.equal(requestContext.getEmail(), user.email);
  });
});

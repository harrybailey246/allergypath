import test from "node:test";
import assert from "node:assert/strict";
import { createClinicIsolationMiddleware } from "../prisma.service";

test("clinic isolation middleware passes through when no clinicId is set", async () => {
  const middleware = createClinicIsolationMiddleware(() => undefined);
  const params = { model: "Patient", action: "findMany", args: {} } as any;
  const response = { success: true };
  const next = async () => response;

  const result = await middleware(params, next);

  assert.equal(result, response);
  assert.equal(params.args.where?.clinicId, undefined);
});

test("clinic isolation middleware adds clinicId to findMany queries", async () => {
  const middleware = createClinicIsolationMiddleware(() => "clinic-1");
  const params = { model: "Patient", action: "findMany", args: {} } as any;
  const next = async () => params;

  await middleware(params, next);

  assert.equal(params.args.where.clinicId, "clinic-1");
});

test("clinic isolation middleware injects clinicId on create", async () => {
  const middleware = createClinicIsolationMiddleware(() => "clinic-2");
  const params = { model: "Patient", action: "create", args: { data: { firstName: "Ada" } } } as any;
  const next = async () => params;

  await middleware(params, next);

  assert.equal(params.args.data.clinicId, "clinic-2");
  assert.equal(params.args.data.firstName, "Ada");
});

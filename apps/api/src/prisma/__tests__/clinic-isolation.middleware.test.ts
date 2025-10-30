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

test("clinic isolation middleware adds a clinic filter to read queries", async () => {
  const middleware = createClinicIsolationMiddleware(() => "clinic-1");
  const params = { model: "Patient", action: "findMany", args: { where: { lastName: "Doe" } } } as any;
  const next = async () => params;

  await middleware(params, next);

  assert.deepEqual(params.args.where, {
    AND: [{ lastName: "Doe" }, { clinicId: "clinic-1" }],
  });
});

test("clinic isolation middleware injects clinicId on create and update operations", async () => {
  const middleware = createClinicIsolationMiddleware(() => "clinic-2");
  const createParams = { model: "Patient", action: "create", args: { data: { firstName: "Ada" } } } as any;
  const updateParams = {
    model: "Patient",
    action: "update",
    args: { where: { id: "patient-1" }, data: { firstName: "Grace" } },
  } as any;
  const next = async (value: unknown) => value;

  await middleware(createParams, next);
  await middleware(updateParams, next);

  assert.equal(createParams.args.data.clinicId, "clinic-2");
  assert.equal(createParams.args.data.firstName, "Ada");
  assert.equal(updateParams.action, "update");
  assert.deepEqual(updateParams.args.where, {
    AND: [{ id: "patient-1" }, { clinicId: "clinic-2" }],
  });
  assert.equal(updateParams.args.data.clinicId, "clinic-2");
  assert.equal(updateParams.args.data.firstName, "Grace");
});

test("clinic isolation middleware scopes destructive operations", async () => {
  const middleware = createClinicIsolationMiddleware(() => "clinic-3");
  const params = {
    model: "Patient",
    action: "deleteMany",
    args: { where: { status: "INACTIVE" } },
  } as any;
  const next = async () => params;

  await middleware(params, next);

  assert.deepEqual(params.args.where, {
    AND: [{ status: "INACTIVE" }, { clinicId: "clinic-3" }],
  });
});

test("clinic isolation middleware protects upsert operations", async () => {
  const middleware = createClinicIsolationMiddleware(() => "clinic-4");
  const params = {
    model: "User",
    action: "upsert",
    args: {
      where: { email: "user@example.com" },
      update: { role: "ADMIN" },
      create: { email: "user@example.com", role: "ADMIN" },
    },
  } as any;
  const next = async () => params;

  await middleware(params, next);

  assert.deepEqual(params.args.where, {
    AND: [{ email: "user@example.com" }, { clinicId: "clinic-4" }],
  });
  assert.equal(params.args.create.clinicId, "clinic-4");
  assert.equal(params.args.update.clinicId, "clinic-4");
});

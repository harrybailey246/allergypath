// supabase/functions/compliance-reminders/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type TaskAction = "list" | "refresh" | "resolve";

type RequestBody = {
  action?: TaskAction;
  includeClosed?: boolean;
  thresholdDays?: number;
  taskId?: string;
  resolutionNotes?: string | null;
  resolvedBy?: string | null;
};

type SubmissionRow = {
  id: string;
  first_name: string | null;
  surname: string | null;
  email: string | null;
  consent_expires_at: string | null;
  safeguarding_follow_up_at: string | null;
  safeguarding_notes: string | null;
};

type ComplianceTask = {
  id: string;
  submission_id: string | null;
  task_type: string;
  title: string;
  details: string | null;
  due_at: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
}

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const DEFAULT_THRESHOLD_DAYS = 30;
const DUE_SOON_DAYS = 7;

function severityForDue(due: Date, now: Date) {
  if (due.getTime() <= now.getTime()) return "overdue";
  const soon = new Date(now.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000);
  return due.getTime() <= soon.getTime() ? "due_soon" : "upcoming";
}

async function ensureComplianceTasks(thresholdDays: number) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const now = new Date();
  const thresholdDate = new Date(now.getTime() + thresholdDays * 24 * 60 * 60 * 1000);

  const { data: submissions, error: subErr } = await supabase
    .from<SubmissionRow>("submissions")
    .select(
      "id, first_name, surname, email, consent_expires_at, safeguarding_follow_up_at, safeguarding_notes"
    );
  if (subErr) throw subErr;

  const submissionMap = new Map<string, SubmissionRow>();
  (submissions || []).forEach((s) => {
    if (s && s.id) submissionMap.set(s.id, s);
  });

  const { data: openTasks, error: taskErr } = await supabase
    .from<ComplianceTask>("compliance_tasks")
    .select("id, submission_id, task_type, due_at, metadata")
    .eq("status", "open");
  if (taskErr) throw taskErr;

  const tasksByKey = new Map<string, ComplianceTask>();
  (openTasks || []).forEach((task) => {
    if (task.submission_id) tasksByKey.set(`${task.submission_id}:${task.task_type}`, task);
  });

  const toInsert: Partial<ComplianceTask>[] = [];
  const toUpdate: { id: string; patch: Partial<ComplianceTask> }[] = [];
  const toResolve: string[] = [];

  const ensureTask = (
    submission: SubmissionRow,
    taskType: string,
    dueDate: Date | null,
    shouldExist: boolean,
    detailsBuilder: (date: Date | null) => string,
  ) => {
    const key = `${submission.id}:${taskType}`;
    const existing = tasksByKey.get(key);

    if (!shouldExist) {
      if (existing) toResolve.push(existing.id);
      return;
    }

    const dueIso = dueDate ? dueDate.toISOString() : null;
    const severity = dueDate ? severityForDue(dueDate, now) : "upcoming";
    const nextMetadata = { ...(existing?.metadata || {}), severity };
    const titleBase = `${submission.first_name ?? ""} ${submission.surname ?? ""}`.trim() || "Patient";
    const title =
      taskType === "consent_expiry"
        ? `Consent expiring: ${titleBase}`
        : `Safeguarding follow-up: ${titleBase}`;

    if (!existing) {
      toInsert.push({
        submission_id: submission.id,
        task_type: taskType,
        title,
        details: detailsBuilder(dueDate),
        due_at: dueIso,
        status: "open",
        metadata: nextMetadata,
      });
      return;
    }

    const patch: Partial<ComplianceTask> = {};
    if (existing.due_at !== dueIso) patch.due_at = dueIso;
    const existingSeverity = (existing.metadata as { severity?: string } | null)?.severity;
    if (existingSeverity !== severity) patch.metadata = nextMetadata;
    const newDetails = detailsBuilder(dueDate);
    if (existing.details !== newDetails) patch.details = newDetails;
    if (Object.keys(patch).length > 0) {
      toUpdate.push({ id: existing.id, patch });
    }
  };

  submissionMap.forEach((submission) => {
    const consentDate = submission.consent_expires_at ? new Date(submission.consent_expires_at) : null;
    const consentValid = consentDate && !Number.isNaN(consentDate.getTime());
    const consentDue = consentValid ? consentDate! : null;
    const consentShouldExist = !!consentDue && (consentDue.getTime() <= thresholdDate.getTime() || consentDue.getTime() <= Date.now());

    ensureTask(
      submission,
      "consent_expiry",
      consentDue,
      consentShouldExist,
      (date) => (date ? `Consent expires on ${date.toISOString()}` : "Consent expiry pending"),
    );

    const followUpDate = submission.safeguarding_follow_up_at ? new Date(submission.safeguarding_follow_up_at) : null;
    const followUpValid = followUpDate && !Number.isNaN(followUpDate.getTime());
    const followUpDue = followUpValid ? followUpDate! : null;
    const followUpShouldExist = !!followUpDue && (followUpDue.getTime() <= thresholdDate.getTime() || followUpDue.getTime() <= Date.now());

    ensureTask(
      submission,
      "safeguarding_follow_up",
      followUpDue,
      followUpShouldExist,
      (date) => {
        const note = submission.safeguarding_notes ? `Notes: ${submission.safeguarding_notes}` : "Safeguarding follow-up due";
        return date ? `${note} (due ${date.toISOString()})` : note;
      },
    );
  });

  if (toInsert.length > 0) {
    await supabase.from("compliance_tasks").insert(toInsert);
  }

  for (const update of toUpdate) {
    await supabase
      .from("compliance_tasks")
      .update({ ...update.patch, updated_at: new Date().toISOString() })
      .eq("id", update.id);
  }

  if (toResolve.length > 0) {
    await supabase
      .from("compliance_tasks")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolution_notes: "Automatically resolved after data update",
      })
      .in("id", toResolve);
  }
}

async function fetchTasks(includeClosed: boolean) {
  if (!supabase) throw new Error("Supabase client is not configured");
  let query = supabase
    .from("compliance_tasks")
    .select(
      `id, submission_id, task_type, title, details, due_at, status, metadata, resolution_notes, resolved_at, created_at,
       submission:submissions(id, first_name, surname, email, consent_expires_at, safeguarding_follow_up_at)`
    )
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!includeClosed) {
    query = query.eq("status", "open");
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const action: TaskAction = body.action ?? "list";
  const includeClosed = !!body.includeClosed;
  const thresholdDays = typeof body.thresholdDays === "number" && body.thresholdDays > 0
    ? Math.floor(body.thresholdDays)
    : DEFAULT_THRESHOLD_DAYS;

  try {
    if (action === "resolve") {
      if (!body.taskId) {
        return new Response(JSON.stringify({ error: "taskId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      await supabase
        .from("compliance_tasks")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolution_notes: body.resolutionNotes ?? null,
          resolved_by: body.resolvedBy ?? null,
        })
        .eq("id", body.taskId);
    } else {
      await ensureComplianceTasks(thresholdDays);
    }

    const tasks = await fetchTasks(includeClosed);
    return new Response(JSON.stringify({ tasks }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("compliance-reminders error", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

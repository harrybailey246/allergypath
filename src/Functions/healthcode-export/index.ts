// @ts-nocheck
// supabase/functions/healthcode-export/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AUDIT_BUCKET = "healthcode-audits";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase environment variables");
}

type SubmissionRecord = {
  id: string;
  first_name: string | null;
  surname: string | null;
  email: string | null;
  date_of_birth: string | null;
  clinician_notes: string | null;
  patient_notes: string | null;
  payer_name: string | null;
  payer_reference: string | null;
  payer_phone: string | null;
  payer_email: string | null;
  policy_holder: string | null;
  policy_number: string | null;
  policy_group: string | null;
  policy_effective_date: string | null;
  policy_expiration_date: string | null;
  pre_auth_status: string | null;
  pre_auth_reference: string | null;
  pre_auth_last_checked: string | null;
};

type ClaimNote = {
  submission_id: string;
  note: string;
  template_key: string | null;
  created_at: string;
  author_email: string | null;
};

type PreAuthRequest = {
  id: string;
  submission_id: string;
  request_type: string;
  requested_at: string;
  requested_by_email: string | null;
  status: string;
  status_notes: string | null;
  payer_reference: string | null;
  response_notes: string | null;
  response_received_at: string | null;
  updated_at: string | null;
};

type RequestPayload = {
  submissionIds: string[];
  actorEmail?: string | null;
  actorId?: string | null;
};

type HealthcodeSubmissionPayload = {
  submission_id: string;
  exported_at: string;
  patient: {
    name: string;
    email: string | null;
    date_of_birth: string | null;
  };
  payer: {
    name: string | null;
    reference: string | null;
    phone: string | null;
    email: string | null;
    policy_holder: string | null;
    policy_number: string | null;
    policy_group: string | null;
    effective_date: string | null;
    expiration_date: string | null;
  };
  pre_auth: {
    status: string | null;
    reference: string | null;
    last_checked: string | null;
    requests: PreAuthRequest[];
  };
  clinician_notes: string | null;
  patient_notes: string | null;
  claim_notes: ClaimNote[];
};

function buildPayload(
  submission: SubmissionRecord,
  claimNotes: ClaimNote[] = [],
  preAuthRequests: PreAuthRequest[] = []
): HealthcodeSubmissionPayload {
  const name = `${submission.first_name || ""} ${submission.surname || ""}`.trim();
  return {
    submission_id: submission.id,
    exported_at: new Date().toISOString(),
    patient: {
      name: name || submission.email || "Patient",
      email: submission.email,
      date_of_birth: submission.date_of_birth,
    },
    payer: {
      name: submission.payer_name,
      reference: submission.payer_reference,
      phone: submission.payer_phone,
      email: submission.payer_email,
      policy_holder: submission.policy_holder,
      policy_number: submission.policy_number,
      policy_group: submission.policy_group,
      effective_date: submission.policy_effective_date,
      expiration_date: submission.policy_expiration_date,
    },
    pre_auth: {
      status: submission.pre_auth_status,
      reference: submission.pre_auth_reference,
      last_checked: submission.pre_auth_last_checked,
      requests: preAuthRequests,
    },
    clinician_notes: submission.clinician_notes,
    patient_notes: submission.patient_notes,
    claim_notes: claimNotes,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let supabase = null;
  let batchId: string | null = null;

  try {
    const body: RequestPayload = await req.json();
    const submissionIds = Array.isArray(body.submissionIds) ? body.submissionIds : [];
    if (!submissionIds.length) {
      return new Response(JSON.stringify({ error: "submissionIds required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Supabase environment not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .select(
        "id,first_name,surname,email,date_of_birth,clinician_notes,patient_notes,payer_name,payer_reference,payer_phone,payer_email,policy_holder,policy_number,policy_group,policy_effective_date,policy_expiration_date,pre_auth_status,pre_auth_reference,pre_auth_last_checked"
      )
      .in("id", submissionIds);
    if (submissionsError) throw submissionsError;

    if (!submissions || submissions.length === 0) {
      return new Response(JSON.stringify({ error: "No submissions found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: claimNotesData, error: claimNotesError } = await supabase
      .from("submission_claim_notes")
      .select("submission_id,note,template_key,created_at,author_email")
      .in("submission_id", submissionIds);
    if (claimNotesError) throw claimNotesError;

    const { data: preAuthData, error: preAuthError } = await supabase
      .from("submission_pre_auth_requests")
      .select(
        "id,submission_id,request_type,requested_at,requested_by_email,status,status_notes,payer_reference,response_notes,response_received_at,updated_at"
      )
      .in("submission_id", submissionIds)
      .order("requested_at", { ascending: true });
    if (preAuthError) throw preAuthError;

    const claimNotesBySubmission = new Map<string, ClaimNote[]>();
    (claimNotesData || []).forEach((note) => {
      const list = claimNotesBySubmission.get(note.submission_id) ?? [];
      list.push(note);
      claimNotesBySubmission.set(note.submission_id, list);
    });

    const preAuthBySubmission = new Map<string, PreAuthRequest[]>();
    (preAuthData || []).forEach((req) => {
      const list = preAuthBySubmission.get(req.submission_id) ?? [];
      list.push(req);
      preAuthBySubmission.set(req.submission_id, list);
    });

    const payloads = submissions.map((submission) =>
      buildPayload(
        submission,
        claimNotesBySubmission.get(submission.id) || [],
        preAuthBySubmission.get(submission.id) || []
      )
    );

    const { data: batch, error: batchError } = await supabase
      .from("healthcode_export_batches")
      .insert({
        exported_by: body.actorId || null,
        exported_by_email: body.actorEmail || null,
        status: "pending",
        submission_count: submissionIds.length,
        metadata: { submissionIds },
      })
      .select("id")
      .single();
    if (batchError) throw batchError;
    batchId = batch.id;

    const nowIso = new Date().toISOString();
    const exportRows = payloads.map((payload) => ({
      batch_id: batch.id,
      submission_id: payload.submission_id,
      payload,
      export_status: "exported",
      exported_at: nowIso,
      response: null,
      audit_reference: null,
      error: null,
    }));

    const { error: exportInsertError } = await supabase
      .from("submission_healthcode_exports")
      .insert(exportRows);
    if (exportInsertError) throw exportInsertError;

    const auditDocument = {
      batchId: batch.id,
      exportedAt: nowIso,
      actorEmail: body.actorEmail || null,
      count: payloads.length,
      submissions: payloads,
    };

    const auditPath = `${batch.id}/batch-${nowIso.replace(/[:.]/g, "-")}.json`;
    const auditBlob = new Blob([JSON.stringify(auditDocument, null, 2)], {
      type: "application/json",
    });
    const uploadResult = await supabase.storage
      .from(AUDIT_BUCKET)
      .upload(auditPath, auditBlob, { upsert: true, contentType: "application/json" });
    if (uploadResult.error) throw uploadResult.error;

    const signed = await supabase.storage
      .from(AUDIT_BUCKET)
      .createSignedUrl(auditPath, 60 * 60 * 24 * 7);
    if (signed.error) throw signed.error;

    const signedUrl = signed.data?.signedUrl ?? null;

    const { error: updateBatchError } = await supabase
      .from("healthcode_export_batches")
      .update({
        status: "exported",
        exported_at: nowIso,
        submission_count: payloads.length,
        audit_file_path: auditPath,
        audit_signed_url: signedUrl,
      })
      .eq("id", batch.id);
    if (updateBatchError) throw updateBatchError;

    const { error: updateRowsError } = await supabase
      .from("submission_healthcode_exports")
      .update({ audit_reference: auditPath })
      .eq("batch_id", batch.id);
    if (updateRowsError) throw updateRowsError;

    const { error: updateSubmissionsError } = await supabase
      .from("submissions")
      .update({ pre_auth_last_checked: nowIso })
      .in("id", submissionIds);
    if (updateSubmissionsError) {
      console.error("Failed to stamp submissions", updateSubmissionsError);
    }

    return new Response(JSON.stringify({ batchId: batch.id, count: payloads.length, auditUrl: signedUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("healthcode-export", error);
    if (supabase && batchId) {
      try {
        await supabase
          .from("healthcode_export_batches")
          .update({
            status: "failed",
            error: error?.message ?? "Unknown error",
            exported_at: new Date().toISOString(),
          })
          .eq("id", batchId);
      } catch (batchUpdateError) {
        console.error("Failed to flag batch as failed", batchUpdateError);
      }
    }
    return new Response(JSON.stringify({ error: error?.message ?? "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

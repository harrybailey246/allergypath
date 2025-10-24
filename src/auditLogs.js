import { supabase } from "./supabaseClient";

async function resolveActor(explicitActorId) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const user = data?.user;
    return {
      id: explicitActorId ?? user?.id ?? null,
      email: user?.email ?? null,
    };
  } catch (err) {
    console.error("auditLogs: failed to resolve actor", err);
    return {
      id: explicitActorId ?? null,
      email: null,
    };
  }
}

export async function logAuditEvent({ submissionId, action, payload = {}, actorId }) {
  const occurredAt = new Date().toISOString();
  const actor = await resolveActor(actorId);
  const enrichedPayload = {
    ...payload,
    actor_email: payload.actor_email ?? actor.email ?? null,
  };

  try {
    const { error } = await supabase.functions.invoke("append-audit-log", {
      body: {
        submission_id: submissionId,
        actor_id: actor.id,
        action,
        payload: enrichedPayload,
        occurred_at: occurredAt,
      },
    });

    if (error) {
      throw error;
    }
    return true;
  } catch (err) {
    console.error("auditLogs: failed to record event", err);
    return false;
  }
}

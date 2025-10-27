// src/storage.js
import { supabase } from "./supabaseClient";

/**
 * Upload a single File to the 'attachments' bucket.
 * Optionally provide a { folder } to nest uploads, e.g. a submission id.
 * Returns the storage path (string) you can save in the DB.
 */
export async function uploadAttachment(file, { folder } = {}) {
  const path = buildStoragePath(file, { folder });
  const ext = file.name.split(".").pop() || "bin";

  const { error } = await supabase.storage
    .from("attachments")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false, // don't overwrite accidentally
      contentType: file.type || `application/${ext}`,
    });

  if (error) throw error;
  return path; // store this in submissions.attachments (text[])
}

/**
 * Create a 1-hour signed URL for a given storage path.
 */
export async function getSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, 60 * 60); // 1 hour

  if (error) throw error;
  return data.signedUrl;
}

function buildStoragePath(file, { folder } = {}) {
  const safeBase = file.name.replace(/[^a-z0-9_\.\-]+/gi, "_").slice(0, 60);
  const base = folder ? folder.replace(/^\/+|\/+$/g, "") : "uploads";
  const prefix = base ? `${base}/` : "";
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBase}`;
}

async function uploadToBucket(bucket, file, { folder } = {}) {
  const path = buildStoragePath(file, { folder });
  const ext = file.name.split(".").pop() || "bin";
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || `application/${ext}`,
  });
  if (error) throw error;
  return path;
}

async function signedUrlFromBucket(bucket, path, ttlSeconds = 60 * 60) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadActionPlan(file, { submissionId, category } = {}) {
  if (!submissionId) throw new Error("submissionId is required");
  const path = await uploadToBucket("action-plans", file, { folder: `submissions/${submissionId}` });
  return { path, category: category || "general" };
}

export async function getActionPlanUrl(path) {
  return signedUrlFromBucket("action-plans", path);
}

export async function deleteActionPlan(path) {
  const { error } = await supabase.storage.from("action-plans").remove([path]);
  if (error) throw error;
}

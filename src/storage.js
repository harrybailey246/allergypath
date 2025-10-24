// src/storage.js
import { supabase } from "./supabaseClient";

function sanitizeFilename(name = "upload") {
  return name.replace(/[^a-z0-9_\.\-]+/gi, "_").slice(0, 80) || "file";
}

function buildPath(folder, base) {
  const cleanedFolder = (folder || "").replace(/^\/+|\/+$/g, "");
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${base}`;
  return cleanedFolder ? `${cleanedFolder}/${unique}` : unique;
}

async function attemptUpload(path, file) {
  return supabase.storage.from("attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
}

/**
 * Upload a single File to the 'attachments' bucket.
 * Returns the storage path (string) you can save in the DB.
 * A light retry is included to gracefully handle "pick is not assigned" storage glitches.
 */
export async function uploadAttachment(file, options = {}) {
  if (!file) throw new Error("No file provided for upload.");

  const { folder = "uploads" } = options;
  const safeBase = sanitizeFilename(file.name);

  let path = buildPath(folder, safeBase);
  let { error } = await attemptUpload(path, file);

  if (error && /pick is not assigned/i.test(error.message || "")) {
    path = buildPath(folder, safeBase);
    ({ error } = await attemptUpload(path, file));
  }

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

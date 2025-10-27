// src/utils/measurementIngestion.js
// High-level helpers that parse files then insert rows into Supabase tables.
import { supabase } from "../supabaseClient";
import { parseDeviceReadings, parseLabResults, parseSkinTests } from "./measurementParsers";

export async function ingestLabResults(file, submissionId, options = {}) {
  if (!submissionId) throw new Error("submissionId is required for lab ingestion");
  const parsed = await parseLabResults(file, options);
  if (!parsed.length) {
    return { inserted: 0, entries: [], error: null };
  }
  const payload = parsed.map((row) => ({
    ...row,
    metadata: row.metadata || {},
    submission_id: submissionId,
  }));
  const { error } = await supabase.from("lab_results").insert(payload);
  return {
    inserted: error ? 0 : payload.length,
    entries: payload,
    error,
  };
}

export async function ingestDeviceReadings(file, submissionId, options = {}) {
  if (!submissionId) throw new Error("submissionId is required for device ingestion");
  const parsed = await parseDeviceReadings(file, options);
  if (!parsed.length) {
    return { inserted: 0, entries: [], error: null };
  }
  const payload = parsed.map((row) => ({
    ...row,
    metadata: row.metadata || {},
    submission_id: submissionId,
  }));
  const { error } = await supabase.from("device_readings").insert(payload);
  return {
    inserted: error ? 0 : payload.length,
    entries: payload,
    error,
  };
}

export async function ingestSkinTests(file, submissionId) {
  if (!submissionId) throw new Error("submissionId is required for skin test ingestion");
  const parsed = await parseSkinTests(file);
  if (!parsed.length) {
    return { inserted: 0, entries: [], error: null };
  }
  const payload = parsed.map((row) => ({
    ...row,
    metadata: row.metadata || {},
    submission_id: submissionId,
  }));
  const { error } = await supabase.from("skin_tests").insert(payload);
  return {
    inserted: error ? 0 : payload.length,
    entries: payload,
    error,
  };
}

export default {
  ingestLabResults,
  ingestDeviceReadings,
  ingestSkinTests,
};

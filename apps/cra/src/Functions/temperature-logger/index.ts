// supabase/functions/temperature-logger/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import { fromUint8Array } from "jsr:@std/encoding/base64";
import { parse } from "jsr:@std/csv/parse";
import { PDFDocument, StandardFonts } from "npm:pdf-lib";

type ImportRequest = {
  action: "import";
  content: string;
  contentType?: string | null;
  fileName?: string | null;
  stockId?: string | null;
  storageLocation?: string | null;
};

type ReportRequest = {
  action: "report";
  format?: "csv" | "pdf";
  stockId?: string | null;
};

type RequestPayload = ImportRequest | ReportRequest;

type StockRecord = {
  id: string;
  item_name: string;
  lot_number: string | null;
  manufacturer: string | null;
  expiry_date: string | null;
  storage_location: string | null;
  min_temp: number | null;
  max_temp: number | null;
  quantity: number | null;
};

type TemperatureLogRow = {
  recorded_at?: string;
  timestamp?: string;
  time?: string;
  temperature_c?: string | number;
  temperature?: string | number;
  temp_c?: string | number;
  temp?: string | number;
  storage_location?: string;
  location?: string;
  is_excursion?: string | boolean;
  excursion?: string | boolean;
  status?: string;
  excursion_reason?: string;
  reason?: string;
  notes?: string;
  [key: string]: unknown;
};

type PreparedLog = {
  stock_id: string | null;
  storage_location: string;
  recorded_at: string;
  temperature_c: number;
  is_excursion: boolean;
  excursion_reason: string | null;
  notes: string | null;
};

type PreparedReportRow = {
  itemName: string;
  lotNumber: string;
  manufacturer: string;
  expiryDate: string;
  storageLocation: string;
  quantity: string;
  temperatureRange: string;
  lastReadingAt: string;
  lastTemperature: string;
  excursions: string;
  unresolvedExcursions: string;
  unresolvedNotes: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Supabase service role configuration missing for temperature-logger function");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const CSV_HEADERS = [
  "Item",
  "Lot Number",
  "Manufacturer",
  "Expiry Date",
  "Storage Location",
  "Quantity",
  "Temperature Range",
  "Last Reading At",
  "Last Temperature (°C)",
  "Excursions",
  "Unresolved Excursions",
  "Unresolved Notes",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return buildResponse("", 200, "text/plain");
  }

  if (req.method !== "POST") {
    return buildResponse({ error: "Method not allowed" }, 405);
  }

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch (_err) {
    return buildResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (!payload || typeof payload !== "object" || !("action" in payload)) {
    return buildResponse({ error: "Missing action" }, 400);
  }

  if (payload.action === "import") {
    return await handleImport(payload as ImportRequest);
  }

  if (payload.action === "report") {
    return await handleReport(payload as ReportRequest);
  }

  return buildResponse({ error: `Unsupported action: ${(payload as { action?: string }).action}` }, 400);
});

async function handleImport(payload: ImportRequest): Promise<Response> {
  if (!payload.content || payload.content.trim().length === 0) {
    return buildResponse({ error: "Missing file contents" }, 400);
  }

  const targetStock = payload.stockId
    ? await loadStock(payload.stockId)
    : null;

  if (payload.stockId && !targetStock) {
    return buildResponse({ error: "Unknown stock item" }, 404);
  }

  const fallbackLocation = (payload.storageLocation ?? targetStock?.storage_location ?? "Unspecified").trim() || "Unspecified";
  const rows = await parseRows(payload, fallbackLocation, targetStock);

  if (rows.length === 0) {
    return buildResponse({ error: "No valid temperature rows found" }, 422);
  }

  const { data: inserted, error } = await supabase
    .from("partner_temperature_logs")
    .insert(rows)
    .select("id");

  if (error) {
    return buildResponse({ error: error.message }, 500);
  }

  return buildResponse({
    message: "Temperature logs imported",
    inserted: Array.isArray(inserted) ? inserted.length : rows.length,
    stockId: payload.stockId ?? null,
  });
}

async function handleReport(payload: ReportRequest): Promise<Response> {
  const format = payload.format === "pdf" ? "pdf" : "csv";

  let query = supabase
    .from("partner_stock_levels")
    .select(
      "id,item_name,lot_number,manufacturer,expiry_date,storage_location,min_temp,max_temp,quantity,partner_temperature_logs(recorded_at,temperature_c,is_excursion,excursion_reason,resolved_at,storage_location)"
    )
    .order("item_name", { ascending: true });

  if (payload.stockId) {
    query = query.eq("id", payload.stockId);
  }

  const { data, error } = await query;
  if (error) {
    return buildResponse({ error: error.message }, 500);
  }

  if (!data || data.length === 0) {
    return buildResponse({ error: "No stock records found" }, 404);
  }

  const rows = buildReportRows(
    data as unknown as Array<StockRecord & { partner_temperature_logs: TemperatureLogRow[] | null }>
  );

  if (rows.length === 0) {
    return buildResponse({ error: "No data available for report" }, 404);
  }

  if (format === "csv") {
    const csv = serialiseCsv(rows);
    const fileName = buildFileName("csv");
    return buildResponse({
      file: {
        fileName,
        contentType: "text/csv",
        base64: fromUint8Array(new TextEncoder().encode(csv)),
      },
    });
  }

  const pdfBytes = await serialisePdf(rows);
  const fileName = buildFileName("pdf");
  return buildResponse({
    file: {
      fileName,
      contentType: "application/pdf",
      base64: fromUint8Array(pdfBytes),
    },
  });
}

async function loadStock(id: string): Promise<StockRecord | null> {
  const { data, error } = await supabase
    .from("partner_stock_levels")
    .select("id,item_name,lot_number,manufacturer,expiry_date,storage_location,min_temp,max_temp,quantity")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load stock", error);
    return null;
  }

  return (data as StockRecord | null) ?? null;
}

async function parseRows(
  payload: ImportRequest,
  fallbackLocation: string,
  stock: StockRecord | null,
): Promise<PreparedLog[]> {
  const { content, contentType } = payload;
  const isJson = (contentType ?? payload.fileName ?? "").toLowerCase().includes("json");

  let rawRows: TemperatureLogRow[] = [];
  try {
    if (isJson) {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        rawRows = parsed as TemperatureLogRow[];
      } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown[] }).rows)) {
        rawRows = (parsed as { rows: TemperatureLogRow[] }).rows;
      }
    } else {
      const parsed = parse(content, { header: true }) as TemperatureLogRow[] | Record<string, unknown>[];
      if (Array.isArray(parsed)) {
        rawRows = parsed as TemperatureLogRow[];
      } else {
        rawRows = Array.from(parsed) as TemperatureLogRow[];
      }
    }
  } catch (err) {
    console.error("Unable to parse temperature file", err);
    return [];
  }

  const prepared: PreparedLog[] = [];
  for (const row of rawRows) {
    const preparedRow = normaliseRow(row, fallbackLocation, stock, payload.stockId ?? null);
    if (preparedRow) {
      prepared.push(preparedRow);
    }
  }

  return prepared;
}

function normaliseRow(
  row: TemperatureLogRow,
  fallbackLocation: string,
  stock: StockRecord | null,
  stockId: string | null,
): PreparedLog | null {
  const recordedAtRaw = firstDefined(
    row.recorded_at,
    row.timestamp,
    row.time,
    (row as { RecordedAt?: string }).RecordedAt,
  );
  const recordedAt = parseDate(recordedAtRaw);
  if (!recordedAt) {
    return null;
  }

  const temperatureRaw = firstDefined(
    row.temperature_c,
    row.temperature,
    row.temp_c,
    row.temp,
    (row as { Temperature?: string | number }).Temperature,
  );
  const temperature = parseNumber(temperatureRaw);
  if (!Number.isFinite(temperature)) {
    return null;
  }

  const location = String(
    firstDefined(
      row.storage_location,
      row.location,
      (row as { Location?: string }).Location,
      fallbackLocation,
    ) ?? fallbackLocation,
  ).trim() || fallbackLocation;

  const booleanRaw = firstDefined(
    row.is_excursion,
    row.excursion,
    row.status,
    (row as { Excursion?: string | boolean }).Excursion,
  );
  let isExcursion = parseBoolean(booleanRaw);
  let excursionReason = firstDefined(
    row.excursion_reason,
    row.reason,
    (row as { Reason?: string }).Reason,
  );

  if ((isExcursion === null || !isExcursion) && stock) {
    const min = toNumberOrNull(stock.min_temp);
    const max = toNumberOrNull(stock.max_temp);
    if (min !== null && temperature < min) {
      isExcursion = true;
      excursionReason = excursionReason || `Temperature ${temperature.toFixed(1)}°C below minimum ${min.toFixed(1)}°C`;
    }
    if (max !== null && temperature > max) {
      isExcursion = true;
      excursionReason = excursionReason || `Temperature ${temperature.toFixed(1)}°C above maximum ${max.toFixed(1)}°C`;
    }
  }

  return {
    stock_id: stockId,
    storage_location: location,
    recorded_at: new Date(recordedAt).toISOString(),
    temperature_c: Number(temperature.toFixed(3)),
    is_excursion: Boolean(isExcursion),
    excursion_reason: valueOrNull(excursionReason),
    notes: valueOrNull(firstDefined(row.notes, (row as { Notes?: string }).Notes)),
  };
}

function buildReportRows(
  stocks: Array<StockRecord & { partner_temperature_logs: TemperatureLogRow[] | null }>,
): PreparedReportRow[] {
  return stocks.map((stock) => {
    const logs = Array.isArray(stock.partner_temperature_logs)
      ? stock.partner_temperature_logs as Array<TemperatureLogRow & { recorded_at: string; temperature_c: number; is_excursion: boolean; resolved_at?: string | null; excursion_reason?: string | null; storage_location?: string | null }>
      : [];

    const sortedLogs = [...logs].sort((a, b) => {
      const aDate = new Date((a as { recorded_at: string }).recorded_at).valueOf();
      const bDate = new Date((b as { recorded_at: string }).recorded_at).valueOf();
      return bDate - aDate;
    });

    const last = sortedLogs[0];
    const excursionCount = logs.filter((log) => Boolean((log as { is_excursion: boolean }).is_excursion)).length;
    const unresolved = logs.filter(
      (log) => Boolean((log as { is_excursion: boolean }).is_excursion) && !(log as { resolved_at?: string | null }).resolved_at,
    );

    const unresolvedReasons = unresolved
      .map((log) => (log as { excursion_reason?: string | null }).excursion_reason)
      .filter((reason): reason is string => Boolean(reason))
      .join("; ");

    return {
      itemName: stock.item_name,
      lotNumber: stock.lot_number ?? "",
      manufacturer: stock.manufacturer ?? "",
      expiryDate: formatDate(stock.expiry_date),
      storageLocation: stock.storage_location ?? "",
      quantity: stock.quantity != null ? String(stock.quantity) : "",
      temperatureRange: buildRange(stock.min_temp, stock.max_temp),
      lastReadingAt: last ? formatDate((last as { recorded_at: string }).recorded_at) : "",
      lastTemperature: last && (last as { temperature_c: number }).temperature_c != null
        ? `${(last as { temperature_c: number }).temperature_c.toFixed(1)}`
        : "",
      excursions: excursionCount ? String(excursionCount) : "0",
      unresolvedExcursions: unresolved.length ? String(unresolved.length) : "0",
      unresolvedNotes: unresolvedReasons,
    };
  });
}

function serialiseCsv(rows: PreparedReportRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    const values = [
      row.itemName,
      row.lotNumber,
      row.manufacturer,
      row.expiryDate,
      row.storageLocation,
      row.quantity,
      row.temperatureRange,
      row.lastReadingAt,
      row.lastTemperature,
      row.excursions,
      row.unresolvedExcursions,
      row.unresolvedNotes,
    ].map(csvEscape);
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

async function serialisePdf(rows: PreparedReportRow[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);

  const margin = 48;
  let page = pdf.addPage();
  let cursorY = page.getHeight() - margin;

  const drawText = (text: string, opts: { bold?: boolean; size?: number } = {}) => {
    const fontSize = opts.size ?? 12;
    const font = opts.bold ? boldFont : regularFont;
    const lineHeight = fontSize + 4;

    if (cursorY - lineHeight < margin) {
      page = pdf.addPage();
      cursorY = page.getHeight() - margin;
    }

    page.drawText(text, {
      x: margin,
      y: cursorY,
      size: fontSize,
      font,
    });
    cursorY -= lineHeight;
  };

  drawText("Partner Recall Readiness Report", { bold: true, size: 18 });
  drawText(new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }));
  cursorY -= 8;

  rows.forEach((row, index) => {
    drawText(`${index + 1}. ${row.itemName}`, { bold: true });
    drawText(`Lot: ${row.lotNumber || "—"}`);
    drawText(`Manufacturer: ${row.manufacturer || "—"}`);
    drawText(`Expiry: ${row.expiryDate || "—"}`);
    drawText(`Storage: ${row.storageLocation || "—"}`);
    drawText(`Quantity: ${row.quantity || "—"}`);
    drawText(`Temperature Range: ${row.temperatureRange || "—"}`);
    drawText(`Last Reading: ${row.lastReadingAt || "—"}`);
    drawText(`Last Temperature: ${row.lastTemperature ? `${row.lastTemperature}°C` : "—"}`);
    drawText(`Excursions: ${row.excursions}`);
    drawText(`Unresolved Excursions: ${row.unresolvedExcursions}`);
    drawText(`Unresolved Notes: ${row.unresolvedNotes || "—"}`);
    cursorY -= 6;
  });

  return await pdf.save();
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.valueOf())) {
      return null;
    }
    return parsed.toISOString();
  }
  return null;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9+\-.,]/g, "").replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "excursion", "alert"].includes(normalised)) return true;
    if (["false", "0", "no", "n", "ok", "normal"].includes(normalised)) return false;
  }
  return null;
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function valueOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function buildRange(min: number | null, max: number | null): string {
  const minVal = toNumberOrNull(min);
  const maxVal = toNumberOrNull(max);
  if (minVal === null && maxVal === null) return "";
  if (minVal !== null && maxVal !== null) {
    return `${minVal.toFixed(1)}°C – ${maxVal.toFixed(1)}°C`;
  }
  if (minVal !== null) return `≥ ${minVal.toFixed(1)}°C`;
  return `≤ ${maxVal!.toFixed(1)}°C`;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function csvEscape(value: string): string {
  const text = value ?? "";
  const escaped = text.replace(/"/g, '""');
  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function buildResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": contentType,
  });

  const payload = contentType === "application/json" ? JSON.stringify(body ?? {}) : String(body ?? "");
  return new Response(payload, { status, headers });
}

function buildFileName(ext: "csv" | "pdf"): string {
  const date = new Date().toISOString().split("T")[0];
  return `partner-recall-report-${date}.${ext}`;
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

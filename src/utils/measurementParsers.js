// src/utils/measurementParsers.js
// Utilities that normalise CSV/PDF clinical data into structured rows.

const CSV_DELIMS = [",", ";", "\t", "|"];

export async function parseLabResults(input, options = {}) {
  const text = await readFileAsTabularText(input);
  const records = parseTabularRecords(text);
  const out = [];
  records.forEach((record) => {
    const analyte = pick(record, ["analyte", "test", "marker", "analyte_name", "allergen"]);
    const value = toNumber(pick(record, ["result_value", "result", "value", "measurement", "level"]));
    if (!analyte || value == null) return;
    const unit = pick(record, ["unit", "units", "result_unit", "measurement_unit"]);
    let referenceText = pick(record, ["reference_range", "reference", "range", "reference_text"]);
    const refLow = toNumber(pick(record, ["reference_low", "low", "lower", "lower_limit"]));
    const refHigh = toNumber(pick(record, ["reference_high", "high", "upper", "upper_limit"]));
    if (!referenceText && (refLow != null || refHigh != null)) {
      referenceText = buildReferenceText(refLow, refHigh);
    }
    const parsedRange = parseReference(referenceText);
    const collectedAt = toIsoDate(
      pick(record, ["collected_at", "collection_date", "collected_on", "drawn", "sample_date", "date"])
    );
    const resultedAt = toIsoDate(pick(record, ["resulted_at", "result_date", "reported", "reported_date"]));
    const labName = pick(record, ["lab_name", "lab", "laboratory"]);
    const method = pick(record, ["method", "assay", "platform"]);
    const notes = pick(record, ["notes", "comment", "comments", "interpretation"]);
    const panelName = options.panelName || pick(record, ["panel", "panel_name", "order"]);

    out.push({
      panel_name: panelName || null,
      analyte,
      result_value: value,
      result_unit: unit || null,
      reference_low: parsedRange.low ?? refLow,
      reference_high: parsedRange.high ?? refHigh,
      reference_text: referenceText || parsedRange.text || null,
      collected_at: collectedAt,
      resulted_at: resultedAt,
      method: method || null,
      lab_name: labName || null,
      notes: notes || null,
      metadata: sanitizeMetadata(record),
    });
  });
  return out;
}

export async function parseDeviceReadings(input, options = {}) {
  const text = await readFileAsTabularText(input);
  const records = parseTabularRecords(text);
  const out = [];
  records.forEach((record) => {
    const measurementType = pick(record, ["measurement_type", "metric", "parameter", "type", "name"]);
    const value = toNumber(
      pick(record, ["measurement_value", "value", "result", "reading", "score", "fev", "feno"])
    );
    if (!measurementType || value == null) return;
    const unit = pick(record, ["measurement_unit", "unit", "units"]);
    const deviceType = options.deviceType || pick(record, ["device_type", "device", "source"]);
    const measurementTime = toIsoDate(
      pick(record, ["measurement_time", "recorded_at", "time", "timestamp", "date"])
    );
    const referencePredicted = toNumber(
      pick(record, ["reference_predicted", "predicted", "expected", "predicted_value"])
    );
    const referencePercent = toNumber(pick(record, ["reference_percent", "percent", "%pred"]));

    out.push({
      device_type: deviceType || null,
      measurement_type: measurementType,
      measurement_value: value,
      measurement_unit: unit || null,
      measurement_time: measurementTime,
      reference_predicted: referencePredicted,
      reference_percent: referencePercent,
      metadata: sanitizeMetadata(record),
    });
  });
  return out;
}

export async function parseSkinTests(input) {
  const text = await readFileAsTabularText(input);
  const records = parseTabularRecords(text);
  const out = [];
  records.forEach((record) => {
    const allergen = pick(record, ["allergen", "antigen", "trigger", "name"]);
    if (!allergen) return;
    const wheal = toNumber(pick(record, ["wheal_mm", "wheal", "wheal_size", "size"]));
    const flare = toNumber(pick(record, ["flare_mm", "flare", "flare_size"]));
    const control = toNumber(pick(record, ["control_wheal_mm", "control", "histamine", "saline"]));
    const measurementTime = toIsoDate(
      pick(record, ["measurement_time", "measured_at", "time", "timestamp", "date"])
    );
    const method = pick(record, ["method", "technique"]);
    const notes = pick(record, ["notes", "comment", "comments", "reaction"]);

    out.push({
      allergen,
      wheal_mm: wheal,
      flare_mm: flare,
      control_wheal_mm: control,
      measurement_time: measurementTime,
      method: method || null,
      notes: notes || null,
      metadata: sanitizeMetadata(record),
    });
  });
  return out;
}

async function readFileAsTabularText(input) {
  if (typeof input === "string") return input;
  if (!input) return "";
  const name = typeof input.name === "string" ? input.name.toLowerCase() : "";
  const mime = typeof input.type === "string" ? input.type : "";
  if (name.endsWith(".pdf") || mime === "application/pdf") {
    return extractPdfText(input);
  }
  if (typeof input.text === "function") {
    return await input.text();
  }
  if (typeof input.arrayBuffer === "function") {
    const buffer = await input.arrayBuffer();
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8").decode(buffer);
    }
    return String.fromCharCode(...new Uint8Array(buffer));
  }
  throw new Error("Unsupported file input for ingestion");
}

async function extractPdfText(file) {
  const pdfjs = await import("pdfjs-dist");
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = worker?.default || worker;
    } catch (err) {
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", import.meta.url).toString();
      } catch (_) {
        // noop – pdfjs can inline worker in most bundlers.
      }
    }
  }
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const lines = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(" ");
    lines.push(text);
  }
  return lines
    .join("\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s{2,}/g, ",").replace(/\t+/g, ",").trim())
    .filter(Boolean)
    .join("\n");
}

function parseTabularRecords(text) {
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const { header, rows } = splitHeaderAndRows(lines);
  if (!header.length) return [];
  const normalizedHeader = header.map((cell) => normalizeKey(cell));
  return rows
    .map((cells) => {
      const record = {};
      normalizedHeader.forEach((key, idx) => {
        if (!key) return;
        record[key] = cells[idx] != null ? cells[idx] : "";
      });
      return record;
    })
    .filter((record) => Object.keys(record).length > 0);
}

function splitHeaderAndRows(lines) {
  let delimiter = detectDelimiter(lines[0]);
  let table = [];
  if (delimiter) {
    table = lines.map((line) => splitLine(line, delimiter));
  } else {
    table = lines.map((line) => line.split(/\s{2,}/).map((cell) => cell.trim()));
    const maxCols = Math.max(...table.map((row) => row.length));
    table = table.map((row) => {
      const next = row.slice();
      while (next.length < maxCols) next.push("");
      return next;
    });
  }
  const [header = [], ...rows] = table;
  return { header, rows };
}

function detectDelimiter(line) {
  let best = { delim: null, hits: 0 };
  CSV_DELIMS.forEach((delim) => {
    const hits = line.split(delim).length - 1;
    if (hits > best.hits) best = { delim, hits };
  });
  return best.hits > 0 ? best.delim : null;
}

function splitLine(line, delimiter) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function normalizeKey(key) {
  return key
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function pick(record, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (record[key] != null && String(record[key]).trim() !== "") return String(record[key]).trim();
  }
  return null;
}

function toNumber(value) {
  if (value == null) return null;
  const numeric = String(value).replace(/[^0-9.+-]/g, "");
  if (!numeric) return null;
  const num = Number(numeric);
  return Number.isFinite(num) ? num : null;
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseReference(input) {
  if (!input) return { low: null, high: null, text: null };
  const match = String(input).match(/-?\d+(?:\.\d+)?/g) || [];
  if (match.length >= 2) {
    return {
      low: Number(match[0]),
      high: Number(match[1]),
      text: String(input),
    };
  }
  if (match.length === 1) {
    return { low: null, high: Number(match[0]), text: String(input) };
  }
  return { low: null, high: null, text: String(input) };
}

function buildReferenceText(low, high) {
  if (low == null && high == null) return null;
  if (low != null && high != null) return `${low} - ${high}`;
  if (low == null) return `≤ ${high}`;
  return `≥ ${low}`;
}

function sanitizeMetadata(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value != null && value !== "" ? value : null])
  );
}

// Placeholder default export for environments expecting an object.
export default {
  parseLabResults,
  parseDeviceReadings,
  parseSkinTests,
};

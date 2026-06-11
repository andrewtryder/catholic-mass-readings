import {
  MassType,
  type OutputFormat,
  massToDict,
  parseMassType,
} from "../src/models.js";
import { USCCB } from "../src/usccb.js";
import { parseIsoDate } from "../src/utils.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const API_DOCS = {
  name: "catholic-mass-readings",
  description: "Public API for USCCB daily mass readings",
  endpoints: {
    "GET /": "API documentation",
    "GET /health": "Health check",
    "GET /mass?date=YYYY-MM-DD&type=DEFAULT&citations=true":
      "Get mass for a date (citations=true omits reading text)",
    "GET /mass/types?date=YYYY-MM-DD": "List available mass types for a date",
    "GET /mass/range?start=YYYY-MM-DD&end=YYYY-MM-DD&step=7&type=DEFAULT&citations=true":
      "Get masses across a date range",
    "GET /mass/sundays?start=YYYY-MM-DD&end=YYYY-MM-DD&type=DEFAULT&citations=true":
      "Get Sunday masses across a date range",
  },
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/") {
        return jsonResponse(API_DOCS);
      }

      if (url.pathname === "/health") {
        return jsonResponse({ status: "ok" });
      }

      if (url.pathname === "/mass/types") {
        return handleMassTypes(url);
      }

      if (url.pathname === "/mass/range") {
        return handleMassRange(url);
      }

      if (url.pathname === "/mass/sundays") {
        return handleSundayMassRange(url);
      }

      if (url.pathname === "/mass") {
        return handleMass(url);
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = message.startsWith("Invalid") ? 400 : 500;
      return jsonResponse({ error: message }, status);
    }
  },
};

async function handleMass(url: URL): Promise<Response> {
  const date = parseRequiredDate(url.searchParams.get("date"));
  const typeParam = url.searchParams.get("type");
  const types = typeParam ? [parseMassType(typeParam)] : undefined;
  const format = parseOutputFormat(url);
  const usccb = new USCCB();
  const mass = await usccb.getMassFromDate(date, types);
  if (!mass) {
    return jsonResponse({ error: "Mass not found for date" }, 404);
  }
  return jsonResponse(massToDict(mass, format));
}

async function handleMassTypes(url: URL): Promise<Response> {
  const date = parseRequiredDate(url.searchParams.get("date"));
  const usccb = new USCCB();
  const massTypes = await usccb.getMassTypes(date);
  return jsonResponse({
    date: formatIsoDate(date),
    types: massTypes.map((type) => massTypeName(type)),
  });
}

async function handleMassRange(url: URL): Promise<Response> {
  const start = parseRequiredDate(url.searchParams.get("start"));
  const end = parseRequiredDate(url.searchParams.get("end"));
  const step = Number(url.searchParams.get("step") ?? "7");
  const typeParam = url.searchParams.get("type");
  const types = typeParam ? [parseMassType(typeParam)] : undefined;
  const format = parseOutputFormat(url);
  const dates = USCCB.getMassDates(start, end, step);
  const masses = await fetchMasses(dates, types);
  return jsonResponse(masses.map((mass) => massToDict(mass, format)));
}

async function handleSundayMassRange(url: URL): Promise<Response> {
  const start = parseRequiredDate(url.searchParams.get("start"));
  const end = parseRequiredDate(url.searchParams.get("end"));
  const typeParam = url.searchParams.get("type");
  const types = typeParam ? [parseMassType(typeParam)] : undefined;
  const format = parseOutputFormat(url);
  const dates = USCCB.getSundayMassDates(start, end);
  const masses = await fetchMasses(dates, types);
  return jsonResponse(masses.map((mass) => massToDict(mass, format)));
}

async function fetchMasses(dates: Date[], types?: MassType[]) {
  const usccb = new USCCB();
  const responses = await Promise.all(
    dates.map((date) => usccb.getMassFromDate(date, types))
  );
  return responses
    .filter((mass): mass is NonNullable<typeof mass> => mass !== null)
    .sort((a, b) => {
      const aTime = a.date ? a.date.getTime() : -1;
      const bTime = b.date ? b.date.getTime() : -1;
      return aTime - bTime;
    });
}

function parseOutputFormat(url: URL): OutputFormat {
  const citations = url.searchParams.get("citations");
  if (citations === null) {
    return "full";
  }
  if (citations === "true" || citations === "1" || citations === "yes") {
    return "citations";
  }
  if (citations === "false" || citations === "0" || citations === "no") {
    return "full";
  }
  throw new Error("Invalid citations parameter. Expected true or false.");
}

function parseRequiredDate(value: string | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid or missing date. Expected YYYY-MM-DD");
  }
  return parseIsoDate(value);
}

function massTypeName(type: MassType): string {
  return (
    Object.entries(MassType).find(([, value]) => value === type)?.[0] ?? type
  );
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

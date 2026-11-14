import type { HttpClient, HttpRequestOptions, HttpResponse } from "./http.js";
import { createFetchClient } from "./http.js";
import { USCCBArgumentError, USCCBError, USCCBNetworkError } from "./errors.js";
import { MassType, type Mass, massTypeToUrl, parseMassType } from "./models.js";
import { cleanText, parseMassHtml } from "./parser.js";
import {
  addDays,
  assertUsccbReadingsUrl,
  assertValidDate,
  formatIsoDate,
  parseUrl,
  todayInNewYork,
} from "./utils.js";

export { cleanText };

const MAX_RETRIES = 2;
const MASS_TYPE_PROBE_CONCURRENCY = 4;
const RETRYABLE_STATUS_CODES = new Set([403, 429, 502, 503, 504]);
const HEAD_UNSUPPORTED_STATUS_CODES = new Set([405, 501]);

/** Default mass types tried in order when resolving a date without an explicit type. */
export const DEFAULT_MASS_TYPES: MassType[] = [
  MassType.DAY,
  MassType.YEARA,
  MassType.YEARB,
  MassType.YEARC,
  MassType.DEFAULT,
];

/** Detailed result of probing available {@link MassType} variants for a date. */
export interface MassTypesResult {
  /** Mass types that were confirmed available (HTTP 2xx), sorted alphabetically. */
  types: MassType[];
  /** True when every MassType probe returned a definitive 2xx or 404 response. */
  complete: boolean;
  /** Mass types whose probes failed due to network errors or non-404 HTTP errors. */
  failedTypes: MassType[];
  /** Error details keyed by failed MassType. */
  errors: Partial<Record<MassType, USCCBError>>;
}

/**
 * Client for fetching and parsing USCCB daily mass readings.
 *
 * @example
 * ```ts
 * import { USCCB, MassType } from "catholic-mass-readings";
 *
 * const usccb = new USCCB();
 * const mass = await usccb.getMass(new Date(2024, 11, 25), MassType.VIGIL);
 * ```
 */
export class USCCB {
  private readonly client: HttpClient;

  /** @param client - HTTP client for fetching pages (defaults to `fetch`). */
  constructor(client: HttpClient = createFetchClient()) {
    this.client = client;
  }

  /** Today's date in America/New_York (USCCB liturgical calendar). */
  static today(): Date {
    return todayInNewYork();
  }

  /** Latest date for which USCCB publishes readings (roughly end of next liturgical year). */
  static maxQueryDate(): Date {
    const today = USCCB.today();
    const dt = addDays(
      new Date(today.getFullYear() + 1, today.getMonth(), 1),
      31
    );
    return new Date(dt.getFullYear(), dt.getMonth(), 1);
  }

  /** Generate Sunday dates between `start` and `end` (inclusive start, exclusive end). */
  static getSundayMassDates(start: Date, end?: Date): Date[] {
    assertValidDate(start, "start");
    if (end !== undefined) {
      assertValidDate(end, "end");
      if (start >= end) {
        throw new USCCBArgumentError(
          `Invalid range (${formatIsoDate(start)} >= ${formatIsoDate(end)})`
        );
      }
    }

    const firstSunday = addDays(start, (7 - start.getDay()) % 7);

    if (end !== undefined && firstSunday >= end) {
      return [];
    }

    return USCCB.getMassDates(firstSunday, end, 7);
  }

  /** Generate dates stepping by `stepDays` from `start` until `end` (capped at {@link maxQueryDate}). */
  static getMassDates(start: Date, end?: Date, stepDays = 7): Date[] {
    assertValidDate(start, "start");
    if (end !== undefined) {
      assertValidDate(end, "end");
    }
    if (!Number.isInteger(stepDays) || stepDays <= 0) {
      throw new USCCBArgumentError(
        `stepDays must be a positive integer; received ${stepDays}`
      );
    }

    const maxDate = USCCB.maxQueryDate();
    const effectiveEnd =
      end === undefined
        ? maxDate
        : new Date(Math.min(end.getTime(), maxDate.getTime()));

    if (start >= effectiveEnd) {
      throw new USCCBArgumentError(
        `Invalid range (${formatIsoDate(start)} >= ${formatIsoDate(effectiveEnd)})`
      );
    }

    const dates: Date[] = [];
    let current = new Date(start);
    while (current < effectiveEnd) {
      dates.push(new Date(current));
      current = addDays(current, stepDays);
    }
    return dates;
  }

  /** Fetch today's mass, optionally for a specific {@link MassType}. */
  async getTodayMass(
    typeOrOptions?: MassType | (HttpRequestOptions & { type?: MassType }),
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    const today = USCCB.today();
    let type: MassType | undefined;
    let opts: HttpRequestOptions | undefined = options;
    if (typeof typeOrOptions === "string") {
      type = typeOrOptions as MassType;
    } else if (typeOrOptions && typeof typeOrOptions === "object") {
      type = typeOrOptions.type;
      opts = { ...typeOrOptions, ...options };
    }
    if (type !== undefined) {
      return this.getMass(today, type, opts);
    }
    return this.getMassFromDate(today, undefined, opts);
  }

  /** Fetch mass for a date and explicit mass type. */
  async getMass(
    date: Date,
    type: MassType,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    assertValidDate(date, "date");
    const url = massTypeToUrl(type, date);
    return this.fetchMass(url, date, type, options);
  }

  /**
   * Fetch mass for a date, trying each type in `types` until one succeeds.
   * @param types - Mass types to try in order (defaults to {@link DEFAULT_MASS_TYPES}).
   */
  async getMassFromDate(
    date: Date,
    typesOrOptions:
      | MassType[]
      | (HttpRequestOptions & { types?: MassType[] }) = DEFAULT_MASS_TYPES,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    assertValidDate(date, "date");
    let types: MassType[] = DEFAULT_MASS_TYPES;
    let opts: HttpRequestOptions | undefined = options;
    if (Array.isArray(typesOrOptions)) {
      types = typesOrOptions;
    } else if (typesOrOptions && typeof typesOrOptions === "object") {
      if (typesOrOptions.types) types = typesOrOptions.types;
      opts = { ...typesOrOptions, ...options };
    }
    for (let recovery = 0; recovery < MAX_RETRIES; recovery++) {
      if (recovery > 0) {
        this.client.reset?.();
      }

      let hitRetryableError = false;
      let lastRetryableError: USCCBNetworkError | null = null;
      for (const type of types) {
        if (opts?.signal?.aborted) {
          opts.signal.throwIfAborted();
        }
        const url = massTypeToUrl(type, date);
        try {
          return await this.fetchMass(url, date, type, opts);
        } catch (err) {
          if (opts?.signal?.aborted) {
            throw err;
          }
          if (err instanceof USCCBNetworkError) {
            if (err.status === 404) {
              continue;
            }
            if (err.retryable) {
              lastRetryableError = err;
              if (recovery < MAX_RETRIES - 1) {
                hitRetryableError = true;
                break;
              }
              continue;
            }
          }
          throw err;
        }
      }
      if (hitRetryableError) {
        continue;
      }
      if (lastRetryableError) {
        throw lastRetryableError;
      }
      return null;
    }
    return null;
  }

  /** Fetch and parse mass from a USCCB readings URL (`https://bible.usccb.org/bible/readings/`). */
  async getMassFromUrl(
    url: string,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    assertUsccbReadingsUrl(url);
    return this.getMassFromTrustedUrl(url, options);
  }

  /**
   * Fetch and parse mass from any trusted URL without USCCB origin and path enforcement.
   *
   * @remarks
   * **Security Warning:** This method bypasses the `https://bible.usccb.org/bible/readings/`
   * origin allowlist. Do NOT pass untrusted user-supplied URLs directly to this method, as
   * doing so can expose your application to Server-Side Request Forgery (SSRF). Use
   * {@link getMassFromUrl} for untrusted USCCB URLs, or validate the URL host against your
   * own allowlist before calling this method.
   */
  async getMassFromTrustedUrl(
    url: string,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    if (hasControlOrWhitespace(url)) {
      throw new USCCBArgumentError(
        "URL must not contain whitespace or control characters"
      );
    }
    let validUrl: URL;
    try {
      validUrl = new URL(url);
    } catch {
      throw new USCCBArgumentError("URL must be valid");
    }
    if (validUrl.protocol !== "https:" && validUrl.protocol !== "http:") {
      throw new USCCBArgumentError("URL must use HTTP or HTTPS");
    }
    if (validUrl.username || validUrl.password) {
      throw new USCCBArgumentError("URL must not contain credentials");
    }
    let date: Date | null = null;
    let type: MassType | string | null = null;
    const parsed = parseUrl(url);
    if (parsed) {
      [date, type] = parsed;
      try {
        type = parseMassType(type);
      } catch {
        type = parsed[1];
      }
    }
    return this.fetchMass(url, date, type, options);
  }

  /**
   * Probe available mass types for a date with completeness metadata.
   * Falls back to bounded GET requests if HEAD is rejected (HTTP 405 or 501).
   */
  async getMassTypesDetailed(
    date: Date,
    options?: HttpRequestOptions
  ): Promise<MassTypesResult> {
    assertValidDate(date, "date");
    const allTypes = Object.values(MassType);
    const results = await mapLimited(
      allTypes,
      MASS_TYPE_PROBE_CONCURRENCY,
      async (
        type
      ): Promise<{
        type: MassType;
        response?: HttpResponse;
        error?: unknown;
      }> => {
        if (options?.signal?.aborted) {
          options.signal.throwIfAborted();
        }
        const url = massTypeToUrl(type, date);
        try {
          let response = await this.client.head(url, options);
          if (HEAD_UNSUPPORTED_STATUS_CODES.has(response.status)) {
            response = await this.client.get(url, options);
          }
          return { type, response };
        } catch (error) {
          return { type, error };
        }
      }
    );

    const types: MassType[] = [];
    const failedTypes: MassType[] = [];
    const errors: Partial<Record<MassType, USCCBError>> = {};

    for (const item of results) {
      if (item.response) {
        if (item.response.ok) {
          types.push(item.type);
        } else if (item.response.status !== 404) {
          failedTypes.push(item.type);
          const retryable = RETRYABLE_STATUS_CODES.has(item.response.status);
          errors[item.type] = new USCCBNetworkError(
            `Failed to probe mass type ${item.type}: HTTP ${item.response.status}`,
            {
              status: item.response.status,
              url: item.response.url || massTypeToUrl(item.type, date),
              retryable,
            }
          );
        }
      } else if (item.error !== undefined) {
        if (options?.signal?.aborted) {
          throw item.error;
        }
        failedTypes.push(item.type);
        if (item.error instanceof USCCBError) {
          errors[item.type] = item.error;
        } else {
          const message =
            item.error instanceof Error
              ? item.error.message
              : String(item.error);
          errors[item.type] = new USCCBNetworkError(
            `Failed to determine available Mass types: ${message}`,
            { cause: item.error, retryable: false }
          );
        }
      }
    }

    types.sort((a, b) => a.localeCompare(b));
    return {
      types,
      complete: failedTypes.length === 0,
      failedTypes,
      errors,
    };
  }

  /** List mass types available for a date (via HEAD requests with bounded GET fallback). */
  async getMassTypes(
    date: Date,
    options?: HttpRequestOptions
  ): Promise<MassType[]> {
    const detailed = await this.getMassTypesDetailed(date, options);
    if (detailed.types.length > 0 || detailed.complete) {
      return detailed.types;
    }

    const firstError = detailed.failedTypes
      .map((t) => detailed.errors[t])
      .find((e): e is USCCBError => e !== undefined);

    if (firstError) {
      throw firstError;
    }

    throw new USCCBNetworkError("Failed to determine available Mass types", {
      retryable: false,
    });
  }

  private async fetchMass(
    url: string,
    date: Date | null,
    type: MassType | string | null,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    let response: HttpResponse;
    try {
      response = await this.client.get(url, options);
    } catch (error) {
      if (error instanceof USCCBError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new USCCBNetworkError(
        `Failed to fetch mass from ${url}: ${message}`,
        { cause: error, url }
      );
    }
    if (!response.ok) {
      const retryable = RETRYABLE_STATUS_CODES.has(response.status);
      throw new USCCBNetworkError(
        `Failed to fetch mass from ${url}: ${response.status}`,
        { status: response.status, url, retryable }
      );
    }
    return this.parseMass(response.text, url, date, type);
  }

  /**
   * Parse USCCB HTML into a {@link Mass} object.
   * Useful for testing with fixture HTML without network requests.
   */
  parseMass(
    html: string,
    url: string,
    date: Date | null,
    type: MassType | string | null
  ): Mass {
    return parseMassHtml(html, url, date, type);
  }
}

function hasControlOrWhitespace(value: string): boolean {
  if (/\s/.test(value)) return true;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  workerFn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await workerFn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

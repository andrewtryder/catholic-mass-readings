import { USCCB_ORIGIN } from "./constants.js";
import { USCCBArgumentError } from "./errors.js";
import { isObolusChallenge, solveObolusChallenge } from "./obolus.js";
import { readBoundedText } from "./http-body.js";

const PROOF_COOKIE_NAME = "X_Obolus_Proof";
const MAX_OBOLUS_ATTEMPTS = 2;

export type FetchResult = Pick<Response, "text" | "ok" | "status" | "url"> & {
  headers?: Headers;
  body?: unknown;
};

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<FetchResult>;

class ObolusStore {
  private cookies = new Map<string, string>();
  private solvers = new Map<string, Promise<void>>();

  getCookie(origin: string): string | null {
    return this.cookies.get(origin) ?? null;
  }

  setCookie(origin: string, cookie: string): void {
    this.cookies.set(origin, cookie);
  }

  getSolver(origin: string): Promise<void> | null {
    return this.solvers.get(origin) ?? null;
  }

  setSolver(origin: string, solver: Promise<void>): void {
    this.solvers.set(origin, solver);
  }

  clearSolver(origin: string): void {
    this.solvers.delete(origin);
  }

  reset(origin?: string): void {
    if (origin) {
      if (!this.solvers.has(origin)) {
        this.cookies.delete(origin);
      }
    } else {
      for (const key of Array.from(this.cookies.keys())) {
        if (!this.solvers.has(key)) {
          this.cookies.delete(key);
        }
      }
    }
  }

  forceReset(origin?: string): void {
    if (origin) {
      this.cookies.delete(origin);
      this.solvers.delete(origin);
    } else {
      this.cookies.clear();
      this.solvers.clear();
    }
  }
}

export interface WrapObolusOptions {
  maxResponseSizeBytes?: number;
}

export type ObolusFetchLike = FetchLike & {
  reset(origin?: string): void;
  forceReset(origin?: string): void;
};

const activeStores = new Set<WeakRef<ObolusStore>>();

/** Wrap a fetch implementation with USCCB-specific retry handling for live requests. */
export function wrapFetchWithObolus(
  fetchImpl: FetchLike,
  options: WrapObolusOptions = {}
): ObolusFetchLike {
  if (
    options.maxResponseSizeBytes !== undefined &&
    (!Number.isFinite(options.maxResponseSizeBytes) ||
      options.maxResponseSizeBytes < 0 ||
      !Number.isInteger(options.maxResponseSizeBytes))
  ) {
    throw new USCCBArgumentError(
      `maxResponseSizeBytes must be a non-negative integer; received '${options.maxResponseSizeBytes}'`
    );
  }
  const store = new ObolusStore();
  activeStores.add(new WeakRef(store));
  const maxBytes = options.maxResponseSizeBytes ?? 3 * 1024 * 1024;

  const wrapped: FetchLike = async (input, init) => {
    let url: URL;
    try {
      url = getRequestUrl(input);
    } catch {
      return fetchImpl(input, init);
    }

    if (url.origin !== USCCB_ORIGIN) {
      return fetchImpl(input, init);
    }

    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      return fetchHeadWithObolus(
        fetchImpl,
        input,
        init,
        store,
        url.origin,
        maxBytes
      );
    }
    return fetchGetWithObolus(
      fetchImpl,
      input,
      init,
      store,
      url.origin,
      maxBytes
    );
  };

  return Object.assign(wrapped, {
    reset: (origin?: string) => store.reset(origin),
    forceReset: (origin?: string) => store.forceReset(origin),
  });
}

/** Reset cached proof state (for tests and recovery retries). */
export function resetObolusState(origin?: string): void {
  for (const ref of activeStores) {
    const store = ref.deref();
    if (store) {
      store.forceReset(origin);
    } else {
      activeStores.delete(ref);
    }
  }
}

function getRequestUrl(input: string | URL | Request): URL {
  if (typeof input === "string") {
    return new URL(input);
  }
  if (input instanceof URL) {
    return new URL(input.href);
  }
  return new URL((input as { url: string }).url);
}

async function fetchGetWithObolus(
  fetchImpl: FetchLike,
  input: string | URL | Request,
  init: RequestInit | undefined,
  store: ObolusStore,
  origin: string,
  maxBytes: number
): Promise<FetchResult> {
  let fallback: { response: FetchResult; text: string } | null = null;

  for (let attempt = 0; attempt < MAX_OBOLUS_ATTEMPTS; attempt++) {
    if (init?.signal?.aborted) {
      init.signal.throwIfAborted();
    }
    if (attempt > 0) {
      store.reset(origin);
    }

    const proofCookie = store.getCookie(origin);
    const response = await fetchImpl(input, withCookie(init, proofCookie));
    if (response.status >= 300 && response.status < 400) {
      return response;
    }
    const text = await readBoundedText(response, maxBytes);

    if (!isObolusChallenge(text)) {
      return createTextResponse(response, text);
    }

    await solveChallengeAndCache(text, store, origin, init?.signal);

    if (init?.signal?.aborted) {
      init.signal.throwIfAborted();
    }
    const retryProofCookie = store.getCookie(origin);
    const retry = await fetchImpl(input, withCookie(init, retryProofCookie));
    if (retry.status >= 300 && retry.status < 400) {
      return retry;
    }
    const retryText = await readBoundedText(retry, maxBytes);

    if (!isObolusChallenge(retryText)) {
      return createTextResponse(retry, retryText);
    }

    fallback = { response: retry, text: retryText };
  }

  return createTextResponse(fallback!.response, fallback!.text);
}

async function fetchHeadWithObolus(
  fetchImpl: FetchLike,
  input: string | URL | Request,
  init: RequestInit | undefined,
  store: ObolusStore,
  origin: string,
  maxBytes: number
): Promise<FetchResult> {
  const urlStr = typeof input === "string" ? input : input.toString();
  let lastResponse: FetchResult | null = null;

  for (let attempt = 0; attempt < MAX_OBOLUS_ATTEMPTS; attempt++) {
    if (init?.signal?.aborted) {
      init.signal.throwIfAborted();
    }
    if (attempt > 0) {
      store.reset(origin);
    }

    const proofCookie = store.getCookie(origin);
    const response = await fetchImpl(input, withCookie(init, proofCookie));
    if (response.status >= 300 && response.status < 400) {
      return response;
    }
    if (response.ok || response.status !== 403) {
      return response;
    }

    const challengeResponse = await fetchImpl(
      urlStr,
      withCookie({ method: "GET", signal: init?.signal }, proofCookie)
    );
    if (challengeResponse.status >= 300 && challengeResponse.status < 400) {
      return challengeResponse;
    }
    const challengeBody = await readBoundedText(challengeResponse, maxBytes);
    if (!isObolusChallenge(challengeBody)) {
      return response;
    }

    await solveChallengeAndCache(challengeBody, store, origin, init?.signal);

    if (init?.signal?.aborted) {
      init.signal.throwIfAborted();
    }
    const retryProofCookie = store.getCookie(origin);
    const retry = await fetchImpl(input, withCookie(init, retryProofCookie));
    if (retry.status >= 300 && retry.status < 400) {
      return retry;
    }
    if (retry.ok) {
      return retry;
    }
    if (retry.status !== 403) {
      return retry;
    }

    const verifyResponse = await fetchImpl(
      urlStr,
      withCookie({ method: "GET", signal: init?.signal }, retryProofCookie)
    );
    if (verifyResponse.status >= 300 && verifyResponse.status < 400) {
      return verifyResponse;
    }
    const verifyBody = await readBoundedText(verifyResponse, maxBytes);
    if (!isObolusChallenge(verifyBody)) {
      return retry;
    }

    lastResponse = retry;
  }

  return lastResponse!;
}

async function solveChallengeAndCache(
  challengeHtml: string,
  store: ObolusStore,
  origin: string,
  signal?: AbortSignal | null
): Promise<void> {
  if (store.getCookie(origin)) {
    return;
  }
  if (signal?.aborted) {
    signal.throwIfAborted();
  }

  let inFlight = store.getSolver(origin);
  if (!inFlight) {
    inFlight = (async () => {
      const cookie = await solveObolusChallenge(challengeHtml, { signal });
      store.setCookie(origin, cookie);
    })().finally(() => {
      store.clearSolver(origin);
    });
    store.setSolver(origin, inFlight);
  }

  await inFlight;
}

function createTextResponse(
  response: Pick<Response, "ok" | "status" | "url"> & { headers?: Headers },
  text: string
): FetchResult {
  return {
    ok: response.ok,
    status: response.status,
    url: response.url,
    headers: response.headers,
    text: async () => text,
  };
}

function withCookie(
  init: RequestInit | undefined,
  cookie: string | null
): RequestInit {
  if (!cookie) {
    return init ?? {};
  }

  const headers = new Headers(init?.headers);
  const existing = headers.get("Cookie");
  const proof = `${PROOF_COOKIE_NAME}=${cookie}`;
  headers.set("Cookie", existing ? `${existing}; ${proof}` : proof);
  return { ...init, headers, redirect: init?.redirect ?? "manual" };
}

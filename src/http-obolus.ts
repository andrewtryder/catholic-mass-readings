import { USCCB_ORIGIN } from "./constants.js";
import { isObolusChallenge, solveObolusChallenge } from "./obolus.js";

const PROOF_COOKIE_NAME = "X_Obolus_Proof";
const MAX_OBOLUS_ATTEMPTS = 2;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<
  Pick<Response, "text" | "ok" | "status" | "url"> & { headers?: Headers }
>;

type FetchResult = Pick<Response, "text" | "ok" | "status" | "url"> & {
  headers?: Headers;
};

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
      this.cookies.delete(origin);
      this.solvers.delete(origin);
    } else {
      this.cookies.clear();
      this.solvers.clear();
    }
  }
}

const activeStores = new Set<ObolusStore>();

/** Wrap a fetch implementation with USCCB-specific retry handling for live requests. */
export function wrapFetchWithObolus(fetchImpl: FetchLike): FetchLike {
  const store = new ObolusStore();
  activeStores.add(store);

  return async (input, init) => {
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
      return fetchHeadWithObolus(fetchImpl, input, init, store, url.origin);
    }
    return fetchGetWithObolus(fetchImpl, input, init, store, url.origin);
  };
}

/** Reset cached proof state (for tests and recovery retries). */
export function resetObolusState(origin?: string): void {
  for (const store of activeStores) {
    store.reset(origin);
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

async function fetchWithRedirectHandling(
  fetchImpl: FetchLike,
  input: string | URL | Request,
  init: RequestInit | undefined,
  store: ObolusStore,
  currentOrigin: string,
  method: string
): Promise<FetchResult> {
  const response = await fetchImpl(input, init);
  const status = response.status;
  if (status >= 300 && status < 400 && response.headers) {
    const location = response.headers.get("location");
    if (location) {
      const currentUrl = getRequestUrl(input);
      const targetUrl = new URL(location, currentUrl);
      if (targetUrl.origin !== currentOrigin) {
        const cleanInit = stripObolusCookie(init);
        return fetchImpl(targetUrl, cleanInit);
      } else {
        if (method === "HEAD") {
          return fetchHeadWithObolus(
            fetchImpl,
            targetUrl,
            init,
            store,
            currentOrigin
          );
        }
        return fetchGetWithObolus(
          fetchImpl,
          targetUrl,
          init,
          store,
          currentOrigin
        );
      }
    }
  }
  return response;
}

async function fetchGetWithObolus(
  fetchImpl: FetchLike,
  input: string | URL | Request,
  init: RequestInit | undefined,
  store: ObolusStore,
  origin: string
): Promise<FetchResult> {
  let fallback: { response: FetchResult; text: string } | null = null;

  for (let attempt = 0; attempt < MAX_OBOLUS_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      store.reset(origin);
    }

    const proofCookie = store.getCookie(origin);
    const response = await fetchWithRedirectHandling(
      fetchImpl,
      input,
      withCookie(init, proofCookie),
      store,
      origin,
      "GET"
    );
    const text = await response.text();

    if (!isObolusChallenge(text)) {
      return createTextResponse(response, text);
    }

    await solveChallengeAndCache(text, store, origin);

    const retryProofCookie = store.getCookie(origin);
    const retry = await fetchWithRedirectHandling(
      fetchImpl,
      input,
      withCookie(init, retryProofCookie),
      store,
      origin,
      "GET"
    );
    const retryText = await retry.text();

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
  origin: string
): Promise<FetchResult> {
  const urlStr = typeof input === "string" ? input : input.toString();
  let lastResponse: FetchResult | null = null;

  for (let attempt = 0; attempt < MAX_OBOLUS_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      store.reset(origin);
    }

    const proofCookie = store.getCookie(origin);
    const response = await fetchWithRedirectHandling(
      fetchImpl,
      input,
      withCookie(init, proofCookie),
      store,
      origin,
      "HEAD"
    );
    if (response.ok || response.status !== 403) {
      return response;
    }

    const challengeResponse = await fetchWithRedirectHandling(
      fetchImpl,
      urlStr,
      withCookie({ method: "GET" }, proofCookie),
      store,
      origin,
      "GET"
    );
    const challengeBody = await challengeResponse.text();
    if (!isObolusChallenge(challengeBody)) {
      return response;
    }

    await solveChallengeAndCache(challengeBody, store, origin);

    const retryProofCookie = store.getCookie(origin);
    const retry = await fetchWithRedirectHandling(
      fetchImpl,
      input,
      withCookie(init, retryProofCookie),
      store,
      origin,
      "HEAD"
    );
    if (retry.ok) {
      return retry;
    }
    if (retry.status !== 403) {
      return retry;
    }

    const verifyResponse = await fetchWithRedirectHandling(
      fetchImpl,
      urlStr,
      withCookie({ method: "GET" }, retryProofCookie),
      store,
      origin,
      "GET"
    );
    const verifyBody = await verifyResponse.text();
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
  origin: string
): Promise<void> {
  if (store.getCookie(origin)) {
    return;
  }

  let inFlight = store.getSolver(origin);
  if (!inFlight) {
    inFlight = (async () => {
      const cookie = await solveObolusChallenge(challengeHtml);
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

function stripObolusCookie(init: RequestInit | undefined): RequestInit {
  if (!init?.headers) {
    return init ?? {};
  }
  const headers = new Headers(init.headers);
  const existing = headers.get("Cookie");
  if (existing) {
    const cleaned = existing
      .split(";")
      .map((part) => part.trim())
      .filter((part) => !part.startsWith(`${PROOF_COOKIE_NAME}=`))
      .join("; ");
    if (cleaned) {
      headers.set("Cookie", cleaned);
    } else {
      headers.delete("Cookie");
    }
  }
  return { ...init, headers };
}

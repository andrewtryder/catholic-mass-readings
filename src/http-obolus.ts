import { isObolusChallenge, solveObolusChallenge } from "./obolus.js";

const PROOF_COOKIE_NAME = "X_Obolus_Proof";
const MAX_OBOLUS_ATTEMPTS = 2;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Pick<Response, "text" | "ok" | "status" | "url">>;

let proofCookie: string | null = null;
let solveInFlight: Promise<void> | null = null;

/** Wrap a fetch implementation with USCCB-specific retry handling for live requests. */
export function wrapFetchWithObolus(fetchImpl: FetchLike): FetchLike {
  return async (input, init) => {
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      return fetchHeadWithObolus(fetchImpl, input, init);
    }
    return fetchGetWithObolus(fetchImpl, input, init);
  };
}

/** Reset cached proof state (for tests and recovery retries). */
export function resetObolusState(): void {
  proofCookie = null;
  solveInFlight = null;
}

async function fetchGetWithObolus(
  fetchImpl: FetchLike,
  input: string | URL | Request,
  init?: RequestInit
): Promise<Pick<Response, "text" | "ok" | "status" | "url">> {
  let lastResponse: Pick<Response, "text" | "ok" | "status" | "url"> | null =
    null;
  let lastText = "";

  for (let attempt = 0; attempt < MAX_OBOLUS_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      resetObolusState();
    }

    const response = await fetchImpl(input, withCookie(init, proofCookie));
    const text = await response.text();
    lastResponse = response;
    lastText = text;

    if (!isObolusChallenge(text)) {
      return createTextResponse(response, text);
    }

    await solveChallengeAndCache(text);

    const retry = await fetchImpl(input, withCookie(init, proofCookie));
    const retryText = await retry.text();
    lastResponse = retry;
    lastText = retryText;

    if (!isObolusChallenge(retryText)) {
      return createTextResponse(retry, retryText);
    }
  }

  return createTextResponse(lastResponse!, lastText);
}

async function fetchHeadWithObolus(
  fetchImpl: FetchLike,
  input: string | URL | Request,
  init?: RequestInit
): Promise<Pick<Response, "text" | "ok" | "status" | "url">> {
  const url = typeof input === "string" ? input : input.toString();
  let lastResponse: Pick<Response, "text" | "ok" | "status" | "url"> | null =
    null;

  for (let attempt = 0; attempt < MAX_OBOLUS_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      resetObolusState();
    }

    const response = await fetchImpl(input, withCookie(init, proofCookie));
    lastResponse = response;
    if (response.ok || response.status !== 403) {
      return response;
    }

    const challengeResponse = await fetchImpl(
      url,
      withCookie({ method: "GET" }, proofCookie)
    );
    const challengeBody = await challengeResponse.text();
    if (!isObolusChallenge(challengeBody)) {
      return response;
    }

    await solveChallengeAndCache(challengeBody);

    const retry = await fetchImpl(input, withCookie(init, proofCookie));
    lastResponse = retry;
    if (retry.ok) {
      return retry;
    }
    if (retry.status !== 403) {
      return retry;
    }

    const verifyResponse = await fetchImpl(
      url,
      withCookie({ method: "GET" }, proofCookie)
    );
    const verifyBody = await verifyResponse.text();
    if (!isObolusChallenge(verifyBody)) {
      return retry;
    }
  }

  return lastResponse!;
}

async function solveChallengeAndCache(challengeHtml: string): Promise<void> {
  if (proofCookie) {
    return;
  }

  if (!solveInFlight) {
    solveInFlight = (async () => {
      proofCookie = await solveObolusChallenge(challengeHtml);
    })().finally(() => {
      solveInFlight = null;
    });
  }

  await solveInFlight;
}

function createTextResponse(
  response: Pick<Response, "ok" | "status" | "url">,
  text: string
): Pick<Response, "text" | "ok" | "status" | "url"> {
  return {
    ok: response.ok,
    status: response.status,
    url: response.url,
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
  return { ...init, headers };
}

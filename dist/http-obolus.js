import { isObolusChallenge, solveObolusChallenge } from "./obolus.js";
const PROOF_COOKIE_NAME = "X_Obolus_Proof";
const MAX_OBOLUS_ATTEMPTS = 2;
let proofCookie = null;
let solveInFlight = null;
/** Wrap a fetch implementation with USCCB-specific retry handling for live requests. */
export function wrapFetchWithObolus(fetchImpl) {
    return async (input, init) => {
        const method = init?.method ?? "GET";
        if (method === "HEAD") {
            return fetchHeadWithObolus(fetchImpl, input, init);
        }
        return fetchGetWithObolus(fetchImpl, input, init);
    };
}
/** Reset cached proof state (for tests and recovery retries). */
export function resetObolusState() {
    proofCookie = null;
    solveInFlight = null;
}
async function fetchGetWithObolus(fetchImpl, input, init) {
    let fallback = null;
    for (let attempt = 0; attempt < MAX_OBOLUS_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            resetObolusState();
        }
        const response = await fetchImpl(input, withCookie(init, proofCookie));
        const text = await response.text();
        if (!isObolusChallenge(text)) {
            return createTextResponse(response, text);
        }
        await solveChallengeAndCache(text);
        const retry = await fetchImpl(input, withCookie(init, proofCookie));
        const retryText = await retry.text();
        if (!isObolusChallenge(retryText)) {
            return createTextResponse(retry, retryText);
        }
        fallback = { response: retry, text: retryText };
    }
    return createTextResponse(fallback.response, fallback.text);
}
async function fetchHeadWithObolus(fetchImpl, input, init) {
    const url = typeof input === "string" ? input : input.toString();
    let lastResponse = null;
    for (let attempt = 0; attempt < MAX_OBOLUS_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            resetObolusState();
        }
        const response = await fetchImpl(input, withCookie(init, proofCookie));
        if (response.ok || response.status !== 403) {
            return response;
        }
        const challengeResponse = await fetchImpl(url, withCookie({ method: "GET" }, proofCookie));
        const challengeBody = await challengeResponse.text();
        if (!isObolusChallenge(challengeBody)) {
            return response;
        }
        await solveChallengeAndCache(challengeBody);
        const retry = await fetchImpl(input, withCookie(init, proofCookie));
        if (retry.ok) {
            return retry;
        }
        if (retry.status !== 403) {
            return retry;
        }
        const verifyResponse = await fetchImpl(url, withCookie({ method: "GET" }, proofCookie));
        const verifyBody = await verifyResponse.text();
        if (!isObolusChallenge(verifyBody)) {
            return retry;
        }
        lastResponse = retry;
    }
    return lastResponse;
}
async function solveChallengeAndCache(challengeHtml) {
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
function createTextResponse(response, text) {
    return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        text: async () => text,
    };
}
function withCookie(init, cookie) {
    if (!cookie) {
        return init ?? {};
    }
    const headers = new Headers(init?.headers);
    const existing = headers.get("Cookie");
    const proof = `${PROOF_COOKIE_NAME}=${cookie}`;
    headers.set("Cookie", existing ? `${existing}; ${proof}` : proof);
    return { ...init, headers };
}
//# sourceMappingURL=http-obolus.js.map
import { isObolusChallenge, solveObolusChallenge } from "./obolus.js";
const PROOF_COOKIE_NAME = "X_Obolus_Proof";
/**
 * Wrap a fetch implementation to automatically solve USCCB Obolus bot-check
 * challenges and retry with the proof cookie.
 *
 * After solving, subsequent requests use plain `fetch` because `impit` does not
 * reliably forward proof cookies.
 */
export function wrapFetchWithObolus(fetchImpl) {
    let proofCookie = null;
    return async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        const initialFetch = proofCookie ? fetch : fetchImpl;
        const response = await initialFetch(input, withCookie(init, proofCookie));
        if (response.status !== 403) {
            return response;
        }
        if (method === "HEAD") {
            const challengeResponse = await fetchImpl(url, withCookie({ method: "GET" }, proofCookie));
            const challengeBody = await challengeResponse.text();
            if (!isObolusChallenge(challengeBody)) {
                return response;
            }
            proofCookie = await solveObolusChallenge(challengeBody);
            return fetch(input, withCookie(init, proofCookie));
        }
        const text = await response.text();
        if (!isObolusChallenge(text)) {
            return createTextResponse(response, text);
        }
        proofCookie = await solveObolusChallenge(text);
        return fetch(input, withCookie(init, proofCookie));
    };
}
function createTextResponse(response, text) {
    return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        text: async () => text,
    };
}
function withCookie(init, proofCookie) {
    if (!proofCookie) {
        return init ?? {};
    }
    const headers = new Headers(init?.headers);
    const existing = headers.get("Cookie");
    const cookie = `${PROOF_COOKIE_NAME}=${proofCookie}`;
    headers.set("Cookie", existing ? `${existing}; ${cookie}` : cookie);
    return { ...init, headers };
}
//# sourceMappingURL=http-obolus.js.map
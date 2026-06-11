type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Pick<Response, "text" | "ok" | "status" | "url">>;
/**
 * Wrap a fetch implementation to automatically solve USCCB Obolus bot-check
 * challenges and retry with the proof cookie.
 *
 * After solving, subsequent requests use plain `fetch` because `impit` does not
 * reliably forward proof cookies.
 */
export declare function wrapFetchWithObolus(fetchImpl: FetchLike): FetchLike;
export {};
//# sourceMappingURL=http-obolus.d.ts.map
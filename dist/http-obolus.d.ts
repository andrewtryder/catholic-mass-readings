type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Pick<Response, "text" | "ok" | "status" | "url">>;
/** Wrap a fetch implementation with USCCB-specific retry handling for live requests. */
export declare function wrapFetchWithObolus(fetchImpl: FetchLike): FetchLike;
/** Reset cached proof state (for tests and recovery retries). */
export declare function resetObolusState(): void;
export {};
//# sourceMappingURL=http-obolus.d.ts.map
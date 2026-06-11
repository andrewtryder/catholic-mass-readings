/** Parsed Obolus challenge parameters embedded in USCCB 403 pages. */
export interface ObolusConfig {
    nonce: string;
    challengeToken: string;
    challengeTimestamp: string;
    difficulty: number;
    benchmarkElapsed: number;
    maxTime: number;
}
/** Result of solving an Obolus proof-of-work challenge. */
export interface ObolusProofResult {
    benchmarkElapsed: number;
    miningNonce: number;
    found: boolean;
}
/** Whether an HTTP response body is a USCCB Obolus bot-check page. */
export declare function isObolusChallenge(html: string): boolean;
/** Extract Obolus challenge config from a challenge HTML page. */
export declare function parseObolusConfig(html: string): ObolusConfig;
/** Count leading zero bits in a hex digest (matches browser Obolus implementation). */
export declare function countLeadingZeroBits(hexString: string): number;
/** Solve the Obolus SHA-256 proof-of-work challenge. */
export declare function computeObolusProof(config: ObolusConfig): Promise<ObolusProofResult>;
/** Build the `X_Obolus_Proof` cookie value from a solved challenge. */
export declare function buildObolusProofCookie(config: ObolusConfig, result: ObolusProofResult): string;
/** Parse challenge HTML, solve PoW, and return the proof cookie value. */
export declare function solveObolusChallenge(html: string): Promise<string>;
//# sourceMappingURL=obolus.d.ts.map
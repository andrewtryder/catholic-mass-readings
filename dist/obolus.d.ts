/** Parsed challenge parameters from USCCB error pages. */
export interface ObolusConfig {
    nonce: string;
    challengeToken: string;
    challengeTimestamp: string;
    difficulty: number;
    benchmarkElapsed: number;
    maxTime: number;
    /** Challenge mode from the USCCB page (e.g. `aggressive`). */
    mode: string;
}
/** Result of solving a USCCB access challenge. */
export interface ObolusProofResult {
    benchmarkElapsed: number;
    miningNonce: number;
    found: boolean;
}
/** Whether an HTTP response body is a USCCB access challenge page. */
export declare function isObolusChallenge(html: string): boolean;
/** Extract challenge config from a challenge HTML page. */
export declare function parseObolusConfig(html: string): ObolusConfig;
/** Compute adaptive challenge difficulty from benchmark timing. */
export declare function calculateAdaptiveDifficulty(benchmarkElapsed: number, maxTime: number): number;
/** Count leading zero bits in a hex digest. */
export declare function countLeadingZeroBits(hexString: string): number;
/** Solve a USCCB access challenge. */
export declare function computeObolusProof(config: ObolusConfig, options?: {
    forceDifficulty?: number;
}): Promise<ObolusProofResult>;
/** Build the proof cookie value from a solved challenge. */
export declare function buildObolusProofCookie(config: ObolusConfig, result: ObolusProofResult): string;
/** Parse challenge HTML, solve it, and return the proof cookie value. */
export declare function solveObolusChallenge(html: string): Promise<string>;
//# sourceMappingURL=obolus.d.ts.map
import { createHash } from "node:crypto";
import { USCCBBotChallengeError, USCCBParseError } from "./errors.js";

const PROOF_COOKIE_NAME = "X_Obolus_Proof";
const BENCHMARK_ITERATIONS = 4096;
const SAFETY_TIMEOUT_MS = 30_000;
const BASELINE_DIFFICULTY = 12;

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
export function isObolusChallenge(html: string): boolean {
  return (
    html.includes(PROOF_COOKIE_NAME) &&
    html.includes("challengeToken") &&
    html.includes("Checking connection")
  );
}

/** Extract challenge config from a challenge HTML page. */
export function parseObolusConfig(html: string): ObolusConfig {
  const nonce = extractConfigValue(html, "nonce");
  const challengeToken = extractConfigValue(html, "challengeToken");
  const challengeTimestamp = extractConfigValue(html, "challengeTimestamp");
  const difficultyRaw = extractConfigValue(html, "difficulty");
  const mode = extractConfigValue(html, "mode") ?? "default";
  const maxTimeRaw = Number(extractConfigValue(html, "maxTime") ?? "4000");
  const benchmarkMatch = html.match(
    /benchmarkElapsed:\s*parseInt\(['"](\d+)['"]/
  );
  const benchmarkElapsedRaw = benchmarkMatch ? Number(benchmarkMatch[1]) : 0;

  if (!nonce || !challengeToken || !challengeTimestamp || !difficultyRaw) {
    throw new USCCBParseError("Failed to parse Obolus challenge configuration");
  }

  if (
    nonce.length === 0 ||
    nonce.length > 128 ||
    challengeToken.length === 0 ||
    challengeToken.length > 256 ||
    challengeTimestamp.length === 0 ||
    challengeTimestamp.length > 64
  ) {
    throw new USCCBParseError(
      "Obolus challenge parameters exceed maximum allowed length"
    );
  }

  if (
    !Number.isFinite(benchmarkElapsedRaw) ||
    benchmarkElapsedRaw < 0 ||
    benchmarkElapsedRaw > 120_000
  ) {
    throw new USCCBParseError("Invalid benchmarkElapsed timing in challenge");
  }

  if (!Number.isFinite(maxTimeRaw) || maxTimeRaw < 0 || maxTimeRaw > 300_000) {
    throw new USCCBParseError("Invalid maxTime in challenge");
  }

  const maxTime = Math.max(100, Math.min(30_000, maxTimeRaw));

  let difficulty: number;
  if (difficultyRaw === "adaptive") {
    difficulty = 14;
  } else {
    const parsed = Number.parseInt(difficultyRaw, 10);
    if (!Number.isFinite(parsed)) {
      throw new USCCBParseError("Invalid difficulty value in challenge");
    }
    difficulty = parsed;
  }

  difficulty = Math.max(1, Math.min(20, difficulty));

  return {
    nonce,
    challengeToken,
    challengeTimestamp,
    difficulty,
    benchmarkElapsed: benchmarkElapsedRaw,
    maxTime,
    mode,
  };
}

/** Compute adaptive challenge difficulty from benchmark timing. */
export function calculateAdaptiveDifficulty(
  benchmarkElapsed: number,
  maxTime: number
): number {
  if (benchmarkElapsed <= 0 || !Number.isFinite(benchmarkElapsed)) {
    return 14;
  }
  const hashesPerMs = BENCHMARK_ITERATIONS / benchmarkElapsed;
  const targetTime = maxTime * 0.75;
  const expectedAttempts = targetTime * hashesPerMs;
  if (!Number.isFinite(expectedAttempts) || expectedAttempts <= 0) {
    return 14;
  }
  const rawDifficulty = Math.log2(expectedAttempts);
  return Math.max(12, Math.min(18, Math.floor(rawDifficulty)));
}

/** Count leading zero bits in a hex digest. */
export function countLeadingZeroBits(hexString: string): number {
  let count = 0;
  for (const char of hexString) {
    const hexDigit = Number.parseInt(char, 16);
    if (hexDigit === 0) {
      count += 4;
    } else {
      count += Math.clz32(hexDigit) - 28;
      break;
    }
  }
  return count;
}

/** Solve a USCCB access challenge. */
export async function computeObolusProof(
  config: ObolusConfig,
  options: { forceDifficulty?: number; signal?: AbortSignal | null } = {}
): Promise<ObolusProofResult> {
  const startTime = Date.now();
  if (options.signal?.aborted) options.signal.throwIfAborted();

  let benchmarkElapsed = config.benchmarkElapsed;

  if (!benchmarkElapsed || benchmarkElapsed <= 0) {
    const benchmarkStart = Date.now();
    for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
      if (options.signal?.aborted) options.signal.throwIfAborted();
      sha256Hex(`${config.nonce}:benchmark:${i}`);
    }
    benchmarkElapsed = Math.max(1, Date.now() - benchmarkStart);
  }

  const targetBits = resolveTargetDifficulty(
    config,
    benchmarkElapsed,
    options.forceDifficulty
  );
  let nonce = 0;
  let miningNonce = 0;
  let found = false;

  while (!found) {
    if (options.signal?.aborted) options.signal.throwIfAborted();
    const hashHex = sha256Hex(`${config.nonce}:mine:${nonce}`);
    if (countLeadingZeroBits(hashHex) >= targetBits) {
      found = true;
      miningNonce = nonce;
    }
    nonce++;

    if (Date.now() - startTime > SAFETY_TIMEOUT_MS) {
      break;
    }

    if (nonce % 512 === 0) {
      await yieldToEventLoop();
    }
  }

  return { benchmarkElapsed, miningNonce, found };
}

/** Build the proof cookie value from a solved challenge. */
export function buildObolusProofCookie(
  config: ObolusConfig,
  result: ObolusProofResult
): string {
  return `${config.challengeTimestamp}:${config.nonce}:${config.challengeToken}:${result.benchmarkElapsed}:${result.miningNonce}`;
}

/** Parse challenge HTML, solve it, and return the proof cookie value. */
export async function solveObolusChallenge(
  html: string,
  options: { signal?: AbortSignal | null } = {}
): Promise<string> {
  const config = parseObolusConfig(html);
  let result = await computeObolusProof(config, { signal: options.signal });

  if (!result.found && config.mode === "aggressive") {
    if (options.signal?.aborted) options.signal.throwIfAborted();
    result = await computeObolusProof(config, {
      forceDifficulty: BASELINE_DIFFICULTY,
      signal: options.signal,
    });
  }

  if (!result.found) {
    throw new USCCBBotChallengeError("Obolus proof-of-work timed out");
  }
  return buildObolusProofCookie(config, result);
}

function resolveTargetDifficulty(
  config: ObolusConfig,
  benchmarkElapsed: number,
  forceDifficulty?: number
): number {
  if (forceDifficulty !== undefined && forceDifficulty > 0) {
    return Math.max(1, Math.min(20, Math.floor(forceDifficulty)));
  }

  if (config.mode === "aggressive") {
    return calculateAdaptiveDifficulty(benchmarkElapsed, config.maxTime);
  }

  return Math.max(1, Math.min(20, config.difficulty));
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function extractConfigValue(html: string, key: string): string | null {
  const quoted = html.match(new RegExp(`${key}:\\s*['"]([^'"]*)['"]`));
  if (quoted) {
    return quoted[1];
  }
  const numeric = html.match(
    new RegExp(`${key}:\\s*parseInt\\(['"](\\d+)['"]`)
  );
  return numeric ? numeric[1] : null;
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

import { createHash } from "node:crypto";

const PROOF_COOKIE_NAME = "X_Obolus_Proof";
const BENCHMARK_ITERATIONS = 4096;
const SAFETY_TIMEOUT_MS = 30_000;

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
export function isObolusChallenge(html: string): boolean {
  return (
    html.includes(PROOF_COOKIE_NAME) &&
    html.includes("challengeToken") &&
    html.includes("Checking connection")
  );
}

/** Extract Obolus challenge config from a challenge HTML page. */
export function parseObolusConfig(html: string): ObolusConfig {
  const nonce = extractConfigValue(html, "nonce");
  const challengeToken = extractConfigValue(html, "challengeToken");
  const challengeTimestamp = extractConfigValue(html, "challengeTimestamp");
  const difficultyRaw = extractConfigValue(html, "difficulty");
  const maxTime = Number(extractConfigValue(html, "maxTime") ?? "4000");
  const benchmarkMatch = html.match(/benchmarkElapsed:\s*parseInt\('(\d+)'/);
  const benchmarkElapsed = benchmarkMatch ? Number(benchmarkMatch[1]) : 0;

  if (!nonce || !challengeToken || !challengeTimestamp || !difficultyRaw) {
    throw new Error("Failed to parse Obolus challenge configuration");
  }

  const difficulty =
    difficultyRaw === "adaptive" ? 14 : Number.parseInt(difficultyRaw, 10);

  return {
    nonce,
    challengeToken,
    challengeTimestamp,
    difficulty,
    benchmarkElapsed,
    maxTime,
  };
}

/** Count leading zero bits in a hex digest (matches browser Obolus implementation). */
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

/** Solve the Obolus SHA-256 proof-of-work challenge. */
export async function computeObolusProof(
  config: ObolusConfig
): Promise<ObolusProofResult> {
  const startTime = Date.now();
  let benchmarkElapsed = config.benchmarkElapsed;

  if (!benchmarkElapsed) {
    const benchmarkStart = Date.now();
    for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
      sha256Hex(`${config.nonce}:benchmark:${i}`);
    }
    benchmarkElapsed = Date.now() - benchmarkStart;
  }

  const targetBits = config.difficulty;
  let nonce = 0;
  let miningNonce = 0;
  let found = false;

  while (!found) {
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

/** Build the `X_Obolus_Proof` cookie value from a solved challenge. */
export function buildObolusProofCookie(
  config: ObolusConfig,
  result: ObolusProofResult
): string {
  return `${config.challengeTimestamp}:${config.nonce}:${config.challengeToken}:${result.benchmarkElapsed}:${result.miningNonce}`;
}

/** Parse challenge HTML, solve PoW, and return the proof cookie value. */
export async function solveObolusChallenge(html: string): Promise<string> {
  const config = parseObolusConfig(html);
  const result = await computeObolusProof(config);
  if (!result.found) {
    throw new Error("Obolus proof-of-work timed out");
  }
  return buildObolusProofCookie(config, result);
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function extractConfigValue(html: string, key: string): string | null {
  const quoted = html.match(new RegExp(`${key}:\\s*'([^']*)'`));
  if (quoted) {
    return quoted[1];
  }
  const numeric = html.match(new RegExp(`${key}:\\s*parseInt\\('(\\d+)'`));
  return numeric ? numeric[1] : null;
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

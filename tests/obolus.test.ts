import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildObolusProofCookie,
  computeObolusProof,
  countLeadingZeroBits,
  isObolusChallenge,
  parseObolusConfig,
} from "../src/obolus.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(testDir, "data");

describe("Obolus challenge", () => {
  const challengeHtml = readFileSync(
    join(dataDir, "obolus-challenge.html"),
    "utf-8"
  );

  it("detects Obolus challenge pages", () => {
    expect(isObolusChallenge(challengeHtml)).toBe(true);
    expect(isObolusChallenge("<html>normal page</html>")).toBe(false);
  });

  it("parses challenge configuration", () => {
    const config = parseObolusConfig(challengeHtml);
    expect(config.nonce).toMatch(/^[a-f0-9]+$/);
    expect(config.challengeToken).toMatch(/^[a-f0-9]+$/);
    expect(config.challengeTimestamp).toMatch(/^\d+$/);
    expect(config.difficulty).toBe(14);
  });

  it("counts leading zero bits in hex digests", () => {
    expect(countLeadingZeroBits("0000abc")).toBe(16);
    expect(countLeadingZeroBits("0abc")).toBe(4);
    expect(countLeadingZeroBits("fabc")).toBe(0);
  });

  it("solves low-difficulty proof-of-work", async () => {
    const result = await computeObolusProof({
      nonce: "testnonce",
      challengeToken: "token",
      challengeTimestamp: "123",
      difficulty: 4,
      benchmarkElapsed: 10,
      maxTime: 4000,
    });

    expect(result.found).toBe(true);
    const cookie = buildObolusProofCookie(
      {
        nonce: "testnonce",
        challengeToken: "token",
        challengeTimestamp: "123",
        difficulty: 4,
        benchmarkElapsed: 10,
        maxTime: 4000,
      },
      result
    );
    expect(cookie).toBe(`123:testnonce:token:10:${result.miningNonce}`);
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildObolusProofCookie,
  calculateAdaptiveDifficulty,
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
    expect(config.mode).toBe("aggressive");
  });

  it("uses adaptive difficulty for aggressive mode", () => {
    expect(calculateAdaptiveDifficulty(10, 4000)).toBe(18);
    expect(calculateAdaptiveDifficulty(100, 4000)).toBe(16);
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
      mode: "default",
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
        mode: "default",
      },
      result
    );
    expect(cookie).toBe(`123:testnonce:token:10:${result.miningNonce}`);
  });

  it("enforces parameter bounds on challenge configuration", () => {
    const hugeNonceHtml = `
      <script>
        var config = {
          nonce: '${"a".repeat(150)}',
          challengeToken: 'token',
          challengeTimestamp: '123',
          difficulty: '10'
        };
      </script>
    `;
    expect(() => parseObolusConfig(hugeNonceHtml)).toThrow(
      "exceed maximum allowed length"
    );

    const outOfBoundsTimingHtml = `
      <script>
        var config = {
          nonce: 'test',
          challengeToken: 'token',
          challengeTimestamp: '123',
          difficulty: '10',
          maxTime: '-10'
        };
      </script>
    `;
    expect(() => parseObolusConfig(outOfBoundsTimingHtml)).toThrow(
      "Invalid maxTime in challenge"
    );
  });

  it("clamps difficulty to supported range [1, 20]", () => {
    const lowDiffHtml = `
      <script>
        var config = {
          nonce: 'test',
          challengeToken: 'token',
          challengeTimestamp: '123',
          difficulty: '-50'
        };
      </script>
    `;
    expect(parseObolusConfig(lowDiffHtml).difficulty).toBe(1);

    const highDiffHtml = `
      <script>
        var config = {
          nonce: 'test',
          challengeToken: 'token',
          challengeTimestamp: '123',
          difficulty: '100'
        };
      </script>
    `;
    expect(parseObolusConfig(highDiffHtml).difficulty).toBe(20);
  });

  it("supports cancellation of proof loop via AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      computeObolusProof(
        {
          nonce: "testnonce",
          challengeToken: "token",
          challengeTimestamp: "123",
          difficulty: 18,
          benchmarkElapsed: 10,
          maxTime: 4000,
          mode: "default",
        },
        { signal: controller.signal }
      )
    ).rejects.toThrow(/aborted/);
  });
});

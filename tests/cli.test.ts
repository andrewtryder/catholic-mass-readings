import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../src/cli.js";

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(testDir, "..");
const mockErrorHelper = join(testDir, "helpers", "mock-net-error.ts");
const mockSuccessHelper = join(testDir, "helpers", "mock-net-success.ts");
const mockCircularHelper = join(testDir, "helpers", "mock-circular-error.ts");
const mockPartialHelper = join(testDir, "helpers", "mock-partial.ts");

async function runCli(
  args: string[],
  options: { importHelper?: string } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const nodeArgs = ["--import", "tsx"];
  if (options.importHelper) {
    nodeArgs.push("--import", options.importHelper);
  }
  nodeArgs.push("src/cli.ts", ...args);

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, nodeArgs, {
      cwd: rootDir,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

describe("CLI process tests", () => {
  describe("--help", () => {
    it("displays general --help information and exits 0", async () => {
      const result = await runCli(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("catholic-mass-readings");
      expect(result.stdout).toContain("get-mass");
      expect(result.stdout).toContain("get-mass-types");
      expect(result.stdout).toContain("get-mass-range");
      expect(result.stdout).toContain("get-sunday-mass-range");
      expect(result.stdout).toContain("--log-level");
    });

    it("displays get-mass command help and exits 0", async () => {
      const result = await runCli(["get-mass", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("--date");
      expect(result.stdout).toContain("--type");
      expect(result.stdout).toContain("--citations-only");
      expect(result.stdout).toContain("--save");
    });
  });

  describe("invalid dates", () => {
    it("rejects malformed date strings on get-mass", async () => {
      const result = await runCli(["get-mass", "--date", "invalid-date"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain(
        "Invalid date format: invalid-date. Expected YYYY-MM-DD"
      );
    });

    it("rejects impossible calendar dates on get-mass", async () => {
      const result = await runCli(["get-mass", "--date", "2026-99-99"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain(
        "Invalid date format: 2026-99-99. Expected valid calendar date in YYYY-MM-DD"
      );
    });

    it("rejects malformed start date on get-mass-range", async () => {
      const result = await runCli(["get-mass-range", "--start", "12/25/2026"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain(
        "Invalid date format: 12/25/2026. Expected YYYY-MM-DD"
      );
    });

    it("rejects non-positive step on get-mass-range", async () => {
      const result = await runCli([
        "get-mass-range",
        "--start",
        "2026-07-01",
        "--step",
        "0",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain(
        "stepDays must be a positive integer; received 0"
      );
    });

    it("rejects fractional step on get-mass-range", async () => {
      const result = await runCli([
        "get-mass-range",
        "--start",
        "2026-07-01",
        "--step",
        "1.5",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain(
        "stepDays must be a positive integer; received 1.5"
      );
    });

    it("rejects negative, 0.5, NaN, and Infinity steps on get-mass-range", async () => {
      for (const stepVal of ["-1", "0.5", "abc", "Infinity"]) {
        const result = await runCli([
          "get-mass-range",
          "--start",
          "2026-07-01",
          "--step",
          stepVal,
        ]);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("[ERROR]");
        expect(result.stderr).toContain("stepDays must be a positive integer");
      }
    }, 15000);

    it("rejects impossible calendar dates such as 31st of April or month 0", async () => {
      for (const dateVal of ["2026-04-31", "2026-00-10", "2026-13-01"]) {
        const result = await runCli(["get-mass", "--date", dateVal]);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("[ERROR]");
        expect(result.stderr).toContain("Expected valid calendar date");
      }
    });
  });

  describe("network failures", () => {
    it("handles network failure on get-mass and outputs normal error message", async () => {
      const result = await runCli(["get-mass", "--date", "2026-07-20"], {
        importHelper: mockErrorHelper,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain("fetch failed: network error");
    });

    it("handles network failure on get-mass-types and logs error to stderr", async () => {
      const result = await runCli(["get-mass-types", "--date", "2026-07-20"], {
        importHelper: mockErrorHelper,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain("fetch failed: network error");
    });

    it("handles network failure across get-mass-range and exits with code 1", async () => {
      const result = await runCli(
        [
          "get-mass-range",
          "-s",
          "2026-07-20",
          "-e",
          "2026-07-22",
          "--step",
          "1",
        ],
        { importHelper: mockErrorHelper }
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Range fetch summary:");
      expect(result.stderr).toContain("2 failed");
    });

    it("handles partial range failures with --allow-partial exiting 0 when at least one succeeds", async () => {
      const result = await runCli(
        [
          "get-mass-range",
          "-s",
          "2026-07-20",
          "-e",
          "2026-07-23",
          "--step",
          "1",
          "--allow-partial",
        ],
        { importHelper: mockPartialHelper }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Feast of the Transfiguration");
      expect(result.stderr).toContain(
        "Range fetch summary: 1 succeeded, 1 not found, 1 failed"
      );
    });

    it("handles partial range failures without --allow-partial exiting 1", async () => {
      const result = await runCli(
        [
          "get-mass-range",
          "-s",
          "2026-07-20",
          "-e",
          "2026-07-23",
          "--step",
          "1",
        ],
        { importHelper: mockPartialHelper }
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Feast of the Transfiguration");
      expect(result.stderr).toContain(
        "Range fetch summary: 1 succeeded, 1 not found, 1 failed"
      );
    });
  });

  describe("normal error output", () => {
    it("handles circular error objects without recursion or stack overflow", async () => {
      const result = await runCli(["get-mass-types", "--date", "2026-07-20"], {
        importHelper: mockCircularHelper,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).not.toContain("Maximum call stack size exceeded");
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain("Circular error occurred");
    });

    it("outputs error when passing invalid mass type", async () => {
      const result = await runCli(["get-mass", "--type", "INVALID_TYPE"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain(
        "Invalid mass type 'INVALID_TYPE'. Allowed choices are"
      );
    });

    it("suppresses error logs when --log-level is NOTSET", async () => {
      const result = await runCli([
        "--log-level",
        "NOTSET",
        "get-mass",
        "--type",
        "INVALID_TYPE",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
    });

    it("logs errors with level prefix when --log-level is ERROR or DEBUG", async () => {
      const result = await runCli([
        "--log-level",
        "DEBUG",
        "get-mass",
        "--type",
        "INVALID_TYPE",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain("Invalid mass type 'INVALID_TYPE'");
    });
  });

  describe("normal execution with mock success", () => {
    it("fetches mass and prints to stdout", async () => {
      const result = await runCli(["get-mass", "--date", "2025-08-06"], {
        importHelper: mockSuccessHelper,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Feast of the Transfiguration");
    });

    it("fetches mass types and prints to stdout", async () => {
      const result = await runCli(["get-mass-types", "--date", "2025-08-06"], {
        importHelper: mockSuccessHelper,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("DEFAULT");
    });

    it("saves mass to file when --save is passed", async () => {
      const tmpSavePath = join(testDir, "scratch", "test-save-cli.json");
      const result = await runCli(
        ["get-mass", "--date", "2025-08-06", "--save", tmpSavePath],
        { importHelper: mockSuccessHelper }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Feast of the Transfiguration");

      // Cleanup
      await rm(tmpSavePath, { force: true });
    });

    it("rejects invalid --concurrency on get-mass-range", async () => {
      const res0 = await runCli(["get-mass-range", "--concurrency", "0"]);
      expect(res0.exitCode).toBe(1);
      expect(res0.stderr).toContain(
        "concurrency must be an integer between 1 and 20"
      );

      const res25 = await runCli(["get-mass-range", "--concurrency", "25"]);
      expect(res25.exitCode).toBe(1);
      expect(res25.stderr).toContain(
        "concurrency must be an integer between 1 and 20"
      );

      const resAbc = await runCli(["get-mass-range", "--concurrency", "abc"]);
      expect(resAbc.exitCode).toBe(1);
      expect(resAbc.stderr).toContain(
        "concurrency must be an integer between 1 and 20"
      );
    }, 15000);
  });
});

describe("mapWithConcurrency", () => {
  it("limits concurrent worker execution and maintains result order", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6];

    const results = await mapWithConcurrency(items, 2, async (item) => {
      active++;
      if (active > maxActive) {
        maxActive = active;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return item * 10;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results).toEqual([10, 20, 30, 40, 50, 60]);
  });
});

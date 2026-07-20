import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(testDir, "..");
const mockErrorHelper = join(testDir, "helpers", "mock-net-error.ts");
const mockSuccessHelper = join(testDir, "helpers", "mock-net-success.ts");

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
  });

  describe("network failures", () => {
    it("handles network failure on get-mass and outputs normal error message", async () => {
      const result = await runCli(["get-mass", "--date", "2026-07-20"], {
        importHelper: mockErrorHelper,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain(
        "Failed to retrieve mass for 2026-07-20. USCCB may have blocked the request (403) or no readings exist for this date."
      );
    });

    it("handles network failure on get-mass-types and logs error to stderr", async () => {
      const result = await runCli(["get-mass-types", "--date", "2026-07-20"], {
        importHelper: mockErrorHelper,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("[ERROR]");
      expect(result.stderr).toContain("fetch failed: network error");
    });
  });

  describe("normal error output", () => {
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
  });
});

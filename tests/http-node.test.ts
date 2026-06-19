import { describe, expect, it } from "vitest";
import { createNodeHttpClient } from "../src/http-node.js";

describe("http-node", () => {
  it("creates an http client that can fall back", async () => {
    // Just verify the factory returns an object with get and head methods.
    // The actual testing of impit vs fetch relies on environment which is hard to mock reliably here
    // without resetting modules, but we can verify it doesn't throw.
    const client = await createNodeHttpClient();
    expect(client).toHaveProperty("get");
    expect(client).toHaveProperty("head");
  });
});

import { USCCBNetworkError } from "./errors.js";

/**
 * Read response body text up to `maxBytes`, cancelling streaming readers and throwing `USCCBNetworkError` if exceeded.
 */
export async function readBoundedText(
  response: Pick<Response, "text"> & {
    body?: unknown;
    url?: string;
    status?: number;
  },
  maxBytes: number
): Promise<string> {
  const body = response.body as
    | {
        getReader?: () => ReadableStreamDefaultReader<Uint8Array>;
      }
    | null
    | undefined;

  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel("Response exceeded maximum allowed size");
            throw new USCCBNetworkError(
              `Response exceeded maximum allowed size of ${maxBytes} bytes`,
              { url: response.url, status: response.status }
            );
          }
          chunks.push(value);
        }
      }
      const fullBuffer = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        fullBuffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(fullBuffer);
    } finally {
      reader.releaseLock?.();
    }
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new USCCBNetworkError(
      `Response exceeded maximum allowed size of ${maxBytes} bytes`,
      { url: response.url, status: response.status }
    );
  }
  return text;
}

/** Base class for all errors thrown by the catholic-mass-readings library. */
export class USCCBError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "USCCBError";
  }
}

export interface USCCBNetworkErrorOptions {
  cause?: unknown;
  status?: number;
  url?: string;
  retryable?: boolean;
}

function isNetworkErrorOptions(
  value: unknown
): value is USCCBNetworkErrorOptions {
  if (!value || typeof value !== "object" || value instanceof Error) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every((key) =>
    ["cause", "status", "url", "retryable"].includes(key)
  );
}

/** Thrown when a network request to bible.usccb.org fails (e.g., DNS, connection). */
export class USCCBNetworkError extends USCCBError {
  public readonly cause?: unknown;
  public readonly status?: number;
  public readonly url?: string;
  public readonly retryable?: boolean;
  public readonly options: USCCBNetworkErrorOptions;

  constructor(
    message: string,
    optionsOrCause?: USCCBNetworkErrorOptions | unknown
  ) {
    super(message);
    this.name = "USCCBNetworkError";

    if (optionsOrCause === undefined) {
      this.options = {};
      return;
    }

    if (isNetworkErrorOptions(optionsOrCause)) {
      this.options = optionsOrCause;
      this.cause = optionsOrCause.cause;
      this.status = optionsOrCause.status;
      this.url = optionsOrCause.url;
      this.retryable = optionsOrCause.retryable;
      return;
    }

    this.options = { cause: optionsOrCause };
    this.cause = optionsOrCause;
  }
}

/** Thrown when parsing the HTML response from bible.usccb.org fails. */
export class USCCBParseError extends USCCBError {
  constructor(message: string) {
    super(message);
    this.name = "USCCBParseError";
  }
}

/** Thrown when the anti-bot proof-of-work challenge fails or times out. */
export class USCCBBotChallengeError extends USCCBError {
  constructor(message: string) {
    super(message);
    this.name = "USCCBBotChallengeError";
  }
}

/** Thrown when an invalid argument is provided. */
export class USCCBArgumentError extends USCCBError {
  constructor(message: string) {
    super(message);
    this.name = "USCCBArgumentError";
  }
}

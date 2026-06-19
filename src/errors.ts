/** Base class for all errors thrown by the catholic-mass-readings library. */
export class USCCBError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "USCCBError";
  }
}

/** Thrown when a network request to bible.usccb.org fails (e.g., DNS, connection). */
export class USCCBNetworkError extends USCCBError {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "USCCBNetworkError";
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

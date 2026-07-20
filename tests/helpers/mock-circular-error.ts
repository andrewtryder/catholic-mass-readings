import { Impit } from "impit";

const circularError: Record<string, unknown> = {
  message: "Circular error occurred",
};
circularError.self = circularError;

globalThis.fetch = async () => {
  throw circularError;
};

Impit.prototype.fetch = async () => {
  throw circularError;
};

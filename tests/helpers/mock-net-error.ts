import { Impit } from "impit";

globalThis.fetch = async () => {
  throw new TypeError("fetch failed: network error");
};

Impit.prototype.fetch = async () => {
  throw new TypeError("fetch failed: network error");
};

import { describe, expect, it } from "vitest";
import { allowedHostsFor, checkRequest } from "./security.ts";

const allowed = allowedHostsFor([7340]);

describe("checkRequest", () => {
  it("allows a plain request to the hub", () => {
    expect(checkRequest({ host: "127.0.0.1:7340" }, allowed)).toEqual({ ok: true });
    expect(checkRequest({ host: "localhost:7340" }, allowed)).toEqual({ ok: true });
  });

  it("allows same-origin requests", () => {
    const result = checkRequest(
      { host: "127.0.0.1:7340", origin: "http://127.0.0.1:7340", secFetchSite: "same-origin" },
      allowed,
    );
    expect(result).toEqual({ ok: true });
  });

  it("blocks a missing or foreign Host (DNS rebinding)", () => {
    expect(checkRequest({}, allowed).ok).toBe(false);
    expect(checkRequest({ host: "evil.example:7340" }, allowed).ok).toBe(false);
    expect(checkRequest({ host: "127.0.0.1:9999" }, allowed).ok).toBe(false);
  });

  it("blocks foreign origins", () => {
    for (const origin of [
      "https://evil.example",
      "http://127.0.0.1:9999",
      "https://127.0.0.1:7340",
      "null",
      "not a url",
    ]) {
      expect(checkRequest({ host: "127.0.0.1:7340", origin }, allowed).ok).toBe(false);
    }
  });

  it("blocks cross-site requests even without an Origin", () => {
    expect(checkRequest({ host: "127.0.0.1:7340", secFetchSite: "cross-site" }, allowed).ok).toBe(
      false,
    );
  });

  it("accepts the dev UI origin when its port is allowed", () => {
    const dev = allowedHostsFor([7340, 7341]);
    const result = checkRequest({ host: "127.0.0.1:7340", origin: "http://127.0.0.1:7341" }, dev);
    expect(result).toEqual({ ok: true });
  });
});

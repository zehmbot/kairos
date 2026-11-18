/**
 * Request guard for the hub.
 *
 * The hub only listens on 127.0.0.1, but a web page in the user's browser can still try to reach it.
 * - Host check: blocks DNS-rebinding (evil.example resolving to 127.0.0.1).
 * - Origin check: blocks other sites (and other local ports) from calling the API.
 * - Sec-Fetch-Site: blocks cross-site requests from browsers that send it.
 */

export interface GuardHeaders {
  host?: string;
  origin?: string;
  secFetchSite?: string;
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

const LOOPBACK_NAMES = ["127.0.0.1", "localhost", "[::1]"];

/** Every `host:port` string the hub accepts, for the given ports. */
export function allowedHostsFor(ports: readonly number[]): Set<string> {
  const hosts = new Set<string>();
  for (const port of ports) {
    for (const name of LOOPBACK_NAMES) hosts.add(`${name}:${port}`);
  }
  return hosts;
}

export function checkRequest(
  headers: GuardHeaders,
  allowedHosts: ReadonlySet<string>,
): GuardResult {
  const host = headers.host?.toLowerCase();
  if (!host || !allowedHosts.has(host)) {
    return { ok: false, reason: "host not allowed" };
  }

  if (headers.secFetchSite === "cross-site") {
    return { ok: false, reason: "cross-site request" };
  }

  if (headers.origin !== undefined) {
    let origin: URL;
    try {
      origin = new URL(headers.origin);
    } catch {
      return { ok: false, reason: "origin not allowed" };
    }
    if (origin.protocol !== "http:" || !allowedHosts.has(origin.host.toLowerCase())) {
      return { ok: false, reason: "origin not allowed" };
    }
  }

  return { ok: true };
}

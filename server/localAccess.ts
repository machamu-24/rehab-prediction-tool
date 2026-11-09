import type { RequestHandler } from "express";

export const isLoopbackHost = (hostname: string) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);

/** Reject cross-site API calls and DNS rebinding; this app is for one local machine. */
export const localAccess: RequestHandler = (req, res, next) => {
  try {
    const host = req.headers.host;
    if (!host) throw new Error();
    const expected = new URL(`http://${host}`);
    if (!isLoopbackHost(expected.hostname)) throw new Error();
    const origin = req.headers.origin;
    if (origin && origin !== expected.origin) throw new Error();
    if (req.headers["sec-fetch-site"] === "cross-site") throw new Error();
    next();
  } catch { res.status(403).json({ error: "このAPIは同じローカルアプリ画面からのみ利用できます" }); }
};

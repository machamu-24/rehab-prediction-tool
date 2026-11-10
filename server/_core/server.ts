import express from "express";
import { createServer } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./static";
import { localAccess, isLoopbackHost } from "../localAccess";
import { localStatus } from "../localOperations";
import { getStore, closeStore } from "../sqliteStore";

export async function startLocalServer(
  options: {
    port?: number;
    host?: string;
    publicDir?: string;
    token?: string;
    development?: boolean;
  } = {}
) {
  const host = options.host || "127.0.0.1";
  if (!isLoopbackHost(host))
    throw new Error("このアプリはこのPC内でのみ利用できます");
  getStore(); // Initialize and validate SQLite before showing a usable window.
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use("/api", localAccess);
  if (options.token)
    app.use("/api", (req, res, next) => {
      if (req.headers["x-rehab-token"] !== options.token) {
        res.status(403).json({ error: "アプリ内の操作のみ利用できます" });
        return;
      }
      next();
    });
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/local/health", async (_req, res) =>
    res.json(await localStatus())
  );
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  if (process.env.NODE_ENV === "development" && options.development) {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else serveStatic(app, options.publicDir);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("アプリの起動に失敗しました");
  const url = `http://${host === "::1" ? "[::1]" : host}:${address.port}`;
  return {
    server,
    url,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
      closeStore();
    },
  };
}

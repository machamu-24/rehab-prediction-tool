import express, { type Express } from "express";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");
  app.use(express.static(distPath));
  app.use("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

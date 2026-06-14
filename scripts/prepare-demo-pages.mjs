import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist/public");
const indexPath = path.join(DIST, "index.html");
const notFoundPath = path.join(DIST, "404.html");
const noJekyllPath = path.join(DIST, ".nojekyll");

if (!fs.existsSync(indexPath)) {
  throw new Error("dist/public/index.html does not exist. Run vite build first.");
}

fs.copyFileSync(indexPath, notFoundPath);
fs.writeFileSync(noJekyllPath, "", "utf8");
console.log("Prepared demo Pages fallback files.");

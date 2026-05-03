import { readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(import.meta.dirname, "..", ".vitepress", "dist");
const indexHtml = readFileSync(join(dist, "index.html"), "utf8");

const checks = [
  { name: "hero name", needle: "Forinda RTC SDK" },
  { name: "packages link", needle: "/packages/" },
  { name: "VitePress runtime hash", regex: /<script[^>]+app\.[A-Za-z0-9_-]+\.js/ },
];

const failures = [];
for (const check of checks) {
  const ok = check.regex ? check.regex.test(indexHtml) : indexHtml.includes(check.needle);
  if (!ok) failures.push(check.name);
}

if (failures.length > 0) {
  console.error("Smoke check failed:", failures.join(", "));
  process.exit(1);
}
console.log("Smoke check passed (" + checks.length + " assertions).");

import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
let checked = 0;

for (const [, attributes, source] of scripts) {
  if (/\bsrc\s*=/.test(attributes) || !source.trim()) continue;
  try {
    new Function(source);
    checked++;
  } catch (error) {
    console.error("Inline dashboard script syntax error:", error);
    process.exitCode = 1;
  }
}

if (checked === 0) throw new Error("No inline scripts were checked.");
console.log(`Dashboard inline JavaScript syntax OK (${checked} scripts).`);

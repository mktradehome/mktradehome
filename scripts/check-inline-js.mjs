import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("index.html", "utf8");
const tags = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)];
const inline = tags.filter(([, attributes, body]) => !/\\bsrc\\s*=/.test(attributes) && body.trim());
if (inline.length === 0) throw new Error("No inline JavaScript blocks found in index.html.");
for (let i = 0; i < inline.length; i++) {
  new vm.Script(inline[i][2], { filename: `index.html:inline-script-${i + 1}` });
}
console.log(`Checked ${inline.length} inline JavaScript blocks in index.html.`);

// Builds the dashboard bundle from the original studio sources plus the standalone adapter.
// The original files are concatenated unchanged so the design and behaviour stay identical.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const dir = new URL("../legacy-ui/", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf8");
const head = read("01-head.html");
const css = head.slice(head.indexOf("<style>") + 7, head.indexOf("</style>"));
const parts = ["02-demo.js", "03-core.js", "04-pages.js", "05-studio.js", "05b-shopify.js", "06-more.js", "07-events.js"].map(read);
const last = parts.length - 1;
parts[last] = parts[last].replace(/\ninit\(\);\s*<\/script>\s*<\/body>\s*<\/html>\s*$/, "\n");
if (parts[last].includes("</script>")) throw new Error("Unexpected end of 07-events.js; the init() call was not found");
// Functions the adapter replaces. The originals are renamed (kept for reference, never called) so the bundle is
// valid even in strict mode and nothing depends on duplicate declarations.
const adapter = read("08-standalone.js");
const replaced = [...adapter.matchAll(/^(?:async )?function (\w+)\(/gm)].map((m) => m[1]);
let original = parts.join("\n");
for (const name of replaced) {
  const re = new RegExp(`((?:async )?function )${name}\\(`, "g");
  const hits = original.match(re)?.length ?? 0;
  if (hits > 1) throw new Error(`${name} is declared ${hits} times in the original sources`);
  original = original.replace(re, `$1__original_${name}(`);
}
const js = original + "\n" + adapter + "\ninit();\n";
mkdirSync(new URL("../public/studio/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/studio/studio.css", import.meta.url), css);
writeFileSync(new URL("../public/studio/studio.js", import.meta.url), js);
console.log(`studio.css ${(css.length / 1024).toFixed(0)} KB, studio.js ${(js.length / 1024).toFixed(0)} KB`);

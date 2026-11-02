// Usage (from the project folder, with .env.local holding your Supabase URL and secret key):
//   npx tsx --env-file=.env.local --conditions=react-server scripts/import-artifact-export.ts ./artifact-export          (dry run)
//   npx tsx --env-file=.env.local --conditions=react-server scripts/import-artifact-export.ts ./artifact-export --apply  (write)
import { createClient } from "@supabase/supabase-js";
import { importArtifact } from "../src/lib/migrate/artifact";

const [dir, flag] = process.argv.slice(2);
if (!dir) { console.error("Give the export folder, e.g. ./artifact-export"); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const report = await importArtifact(dir, db, { apply: flag === "--apply" });
console.log(flag === "--apply" ? "IMPORTED" : "DRY RUN (nothing written; add --apply to import)");
for (const p of report.posts) console.log(`  ${p.id}  ${p.title}\n      ${p.result}`);
console.log(`Demo posts left behind: ${report.skippedDemo}. Approvals carried over: ${report.approvalsImported}. Activity entries: ${report.auditImported}.`);
report.problems.forEach((p) => console.log("  ! " + p));

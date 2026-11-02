// Moves real content from a Claude Artifact export (one JSON file per document) into Supabase.
// Demo posts, demo approvals and demo products are deliberately not migrated. Nothing is invented: a post that
// links a product the Shopify sync hasn't imported is reported and skipped, never re-linked or guessed.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brisbaneToIso } from "@/lib/content/constants";

type ArtifactItem = { brand: string; title: string; series?: string; channel: string; format: string; scheduledAt?: string; caption?: string; hashtags?: string[];
  productIds?: string[]; mediaIds?: string[]; slides?: unknown[]; shots?: unknown[]; brief?: string; direction?: string; status: string; reviewNote?: string;
  approvalId?: string | null; approvedFingerprint?: string | null; publishStatus?: string; archived?: boolean; demo?: boolean; createdBy?: string; createdAt?: string };
type ArtifactApproval = { contentId: string; fingerprint: string; approvedAt?: string; approvedBy?: string; demo?: boolean };
type ArtifactAudit = { at: string; actor?: string; actorKind?: string; action: string; contentId?: string; title?: string; brand?: string; detail?: string; demo?: boolean };
export type ImportReport = { posts: { id: string; title: string; result: string }[]; skippedDemo: number; approvalsImported: number; auditImported: number; problems: string[] };

const readDir = <T>(dir: string, sub: string): [string, T][] => {
  const d = join(dir, sub);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith(".json")).sort().map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(d, f), "utf8")) as T]);
};
const DRAFT = new Set(["Idea", "AI Draft", "Needs Review", "Changes Requested"]);

export async function importArtifact(dir: string, db: SupabaseClient, opts: { apply: boolean }): Promise<ImportReport> {
  const items = readDir<ArtifactItem>(dir, "content");
  const approvals = new Map(readDir<ArtifactApproval>(dir, "approvals"));
  const audit = readDir<ArtifactAudit>(dir, "audit");
  const report: ImportReport = { posts: [], skippedDemo: 0, approvalsImported: 0, auditImported: 0, problems: [] };
  const real = items.filter(([, it]) => !it.demo);
  report.skippedDemo = items.length - real.length;

  const wanted = [...new Set(real.flatMap(([, it]) => it.productIds ?? []))];
  const { data: found, error } = wanted.length ? await db.from("products").select("id,brand_id").in("id", wanted) : { data: [], error: null };
  if (error) throw new Error(`Could not read products: ${error.message}`);
  const known = new Map((found ?? []).map((p: { id: string; brand_id: string }) => [p.id, p.brand_id]));

  const { data: already } = real.length ? await db.from("content_items").select("id").in("id", real.map(([id]) => id)) : { data: [] };
  const exists = new Set((already ?? []).map((r: { id: string }) => r.id));
  for (const [id, it] of real) {
    if (exists.has(id)) { report.posts.push({ id, title: it.title, result: "already in Supabase; left unchanged" }); continue; }
    const missing = (it.productIds ?? []).filter((p) => known.get(p) !== it.brand);
    if (missing.length) { report.posts.push({ id, title: it.title, result: `skipped: products not imported from ${it.brand.toUpperCase()}'s Shopify yet (${missing.join(", ")}); run the Shopify sync first` }); continue; }
    if ((it.mediaIds ?? []).length) report.problems.push(`${id}: had ${it.mediaIds!.length} image(s) in the artifact; re-upload them in the media library`);
    const scheduled = it.scheduledAt ? brisbaneToIso(it.scheduledAt) : null;
    const row = { id, brand_id: it.brand, title: it.title ?? "", series: it.series ?? "", channel: it.channel, format: it.format, scheduled_at: scheduled,
      caption: it.caption ?? "", hashtags: it.hashtags ?? [], product_ids: it.productIds ?? [], asset_ids: [], slides: it.slides ?? [], shots: it.shots ?? [],
      brief: it.brief ?? "", direction: it.direction ?? "", status: DRAFT.has(it.status) && it.status !== "Changes Requested" ? it.status : "Needs Review",
      review_note: it.reviewNote ?? "", archived: !!it.archived, created_by: null, created_by_agent: it.createdBy === "ai" ? "planner" : null };
    const approved = !DRAFT.has(it.status) && it.status !== "Failed";
    const ap = it.approvalId ? approvals.get(it.approvalId) : undefined;
    const note = approved ? (ap && !ap.demo ? `${it.status}, approval carried over` : `was ${it.status} but its approval is missing; imported for re-review`) : it.status === "Changes Requested" ? "imported as Needs Review (Changes Requested note kept)" : `imported as ${row.status}`;
    if (!opts.apply) { report.posts.push({ id, title: it.title, result: `would import: ${note}` }); continue; }
    const ins = await db.from("content_items").upsert(row, { onConflict: "id" });
    if (ins.error) { report.posts.push({ id, title: it.title, result: `failed: ${ins.error.message}` }); continue; }
    if (approved && ap && !ap.demo) {
      const r = await db.rpc("import_approved_content", { p_content: id, p_status: it.status === "Failed" ? "Approved" : it.status,
        p_client_fingerprint: it.approvedFingerprint ?? null, p_original: { approvedAt: ap.approvedAt ?? "", approvedBy: ap.approvedBy ?? "", artifactApprovalId: it.approvalId } });
      if (r.error) { report.posts.push({ id, title: it.title, result: `imported for re-review; approval not carried over: ${r.error.message}` }); continue; }
      report.approvalsImported++;
    }
    report.posts.push({ id, title: it.title, result: `imported: ${note}` });
  }

  const imported = new Set(report.posts.filter((p) => p.result.startsWith("imported") || p.result.startsWith("would import")).map((p) => p.id));
  const { data: prior } = await db.from("audit_log").select("data").eq("actor_agent", "artifact-import");
  const done = new Set((prior ?? []).map((r: { data: { originalId?: string } }) => r.data?.originalId).filter(Boolean));
  for (const [auditId, a] of audit) {
    if (a.demo || done.has(auditId) || (a.contentId && !imported.has(a.contentId))) continue;
    if (!opts.apply) { report.auditImported++; continue; }
    const r = await db.rpc("log_event", { p_brand: a.brand ?? null, p_action: `Imported: ${a.action}`.slice(0, 120), p_detail: a.detail || a.title || "",
      p_content: a.contentId || null, p_agent: "artifact-import", p_data: { originalId: auditId, originalAt: a.at, originalActor: a.actor ?? "", originalKind: a.actorKind ?? "" } });
    if (r.error) report.problems.push(`activity entry not imported: ${r.error.message}`); else report.auditImported++;
  }
  return report;
}

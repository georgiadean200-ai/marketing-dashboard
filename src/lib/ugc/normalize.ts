// Duplicate detection and manual-import parsing for UGC. No network access; safe to unit test.

/** Instagram shortcode from any post/reel URL form, or null. */
export function shortcodeFromUrl(url: string): string | null {
  const m = String(url ?? "").trim().match(/^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/i);
  return m ? m[1] : null;
}
/** One stable key per post, shared by every source (tags, mentions, Later import), so a post is stored once per brand. */
export function fingerprintFor(o: { permalink?: string | null; externalId?: string | null }): string | null {
  const code = o.permalink ? shortcodeFromUrl(o.permalink) : null;
  if (code) return `ig:${code}`;
  if (o.externalId) return `id:${o.externalId}`;
  return null;
}
export const canonicalPermalink = (url: string) => { const c = shortcodeFromUrl(url); return c ? `https://www.instagram.com/p/${c}/` : url.trim(); };
export const normalizeHandle = (h: string) => String(h ?? "").trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9._]/g, "");

/** Same creator re-sharing the same caption under a new link is treated as a duplicate. */
export function captionHash(handle: string, caption: string): string | null {
  const text = String(caption ?? "").toLowerCase().replace(/[#@][\w.]+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (text.length < 25) return null;
  let h = 0x811c9dc5;
  const s = `${normalizeHandle(handle)}|${text}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type ImportRow = { permalink: string; fingerprint: string; creator_handle: string; caption: string; posted_at: string | null; notes: string };
/** Accepts pasted Instagram links (one per line, optionally "link @handle"), or CSV with a header row
 *  containing url/link/permalink and optionally handle/username, caption, date, notes. */
export function parseLaterImport(text: string): { rows: ImportRow[]; errors: string[] } {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: ImportRow[] = [], errors: string[] = [], seen = new Set<string>();
  if (!lines.length) return { rows, errors: ["Nothing to import"] };
  const splitCsv = (l: string) => { const out: string[] = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) { const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out.map((c) => c.trim()); };
  const header = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const isCsv = col(["url", "link", "permalink"]) >= 0 && !shortcodeFromUrl(lines[0]);
  const body = isCsv ? lines.slice(1) : lines;
  const iUrl = isCsv ? col(["url", "link", "permalink"]) : -1, iHandle = col(["handle", "username", "creator", "account"]),
    iCap = col(["caption", "description"]), iDate = col(["date", "posted"]), iNotes = col(["note"]);
  body.forEach((line, n) => {
    const cells = isCsv ? splitCsv(line) : [];
    const url = isCsv ? cells[iUrl] ?? "" : (line.match(/https?:\/\/\S+/)?.[0] ?? "");
    const fp = fingerprintFor({ permalink: url });
    if (!fp) { errors.push(`Line ${n + (isCsv ? 2 : 1)}: not an Instagram post link`); return; }
    if (seen.has(fp)) return;
    seen.add(fp);
    const handle = isCsv && iHandle >= 0 ? cells[iHandle] : (line.match(/@([\w.]+)/)?.[1] ?? "");
    const date = isCsv && iDate >= 0 ? cells[iDate] : "";
    const parsed = date ? new Date(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date) ? date.split("/").reverse().join("-") : date) : null;
    rows.push({ permalink: canonicalPermalink(url), fingerprint: fp, creator_handle: normalizeHandle(handle ?? ""),
      caption: isCsv && iCap >= 0 ? (cells[iCap] ?? "").slice(0, 2200) : "", posted_at: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      notes: isCsv && iNotes >= 0 ? (cells[iNotes] ?? "").slice(0, 500) : "" });
  });
  return { rows, errors };
}

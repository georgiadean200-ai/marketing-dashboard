export const SERIES = ["Inspiration", "Tile of the Week", "Product Feature", "Save This Space", "Perfect Match", "Tile School with Wade",
  "Behind the Scenes", "Team Content", "Customer Projects", "Product Launches", "Campaigns", "Seasonal Inspiration"] as const;
export const FORMATS: Record<string, string[]> = {
  Instagram: ["Single image", "Carousel", "Reel", "Story"], Facebook: ["Single image", "Carousel", "Reel", "Story"],
  Pinterest: ["Pin"], LinkedIn: ["Single image", "Carousel", "Text post"], TikTok: ["Reel"], Email: ["Email"],
};
export const CHANNELS = Object.keys(FORMATS);
export const BRISBANE_OFFSET = "+10:00"; // Queensland has no daylight saving

/** "2026-11-23T18:00" (Brisbane wall-clock, as the dashboard shows it) → ISO timestamp, or null. */
export function brisbaneToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00${BRISBANE_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** ISO timestamp → "YYYY-MM-DDTHH:MM" in Brisbane time. */
export function isoToBrisbane(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 10 * 3600_000);
  return d.toISOString().slice(0, 16);
}

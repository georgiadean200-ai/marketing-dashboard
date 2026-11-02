"use client";
import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Boot = { user: { id: string; name: string }; roles: Record<string, string>; canPublish: Record<string, boolean> };

/** Gives the dashboard a signed-in Supabase client (cookie session, auto-refreshing) and then loads it. */
export function StudioBoot({ bootstrap, supabaseUrl, publishableKey }: { bootstrap: Boot; supabaseUrl: string; publishableKey: string }) {
  useEffect(() => {
    const w = window as unknown as { __sb?: unknown; __STUDIO__?: Boot; __studioLoaded?: boolean };
    if (w.__studioLoaded) return;
    w.__studioLoaded = true;
    w.__sb = createBrowserClient(supabaseUrl, publishableKey);
    w.__STUDIO__ = bootstrap;
    const s = document.createElement("script");
    s.src = "/studio/studio.js";
    document.body.appendChild(s);
  }, [bootstrap, supabaseUrl, publishableKey]);
  return null;
}

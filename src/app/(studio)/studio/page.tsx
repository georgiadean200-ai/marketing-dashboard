import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { StudioBoot } from "@/components/StudioBoot";

export const dynamic = "force-dynamic";

// The exact markup of the original studio shell. The dashboard script renders everything inside it.
const SHELL = `<div id="app">
  <aside class="side" id="side" aria-label="Main navigation"></aside>
  <div class="main" id="main">
    <div id="banners"></div>
    <header class="top" id="top"></header>
    <main class="view" id="view" tabindex="-1"></main>
  </div>
</div>
<div class="scrim" id="scrim" data-a="closeNav"></div>
<div id="modal" hidden></div>
<div id="toast" role="status" aria-live="polite"></div>
<input type="file" id="fileIn" accept="image/*,video/mp4,video/webm" multiple hidden>`;

export default async function Studio() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!Object.keys(user.roles).length) {
    return <div style={{ padding: 40, fontFamily: "Montserrat, system-ui, sans-serif" }}>
      <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 400 }}>You don&apos;t have access to a brand yet</h1>
      <p>Ask an administrator to add you to The Tile Collective or Cheap Tiles Online.</p>
      <form action="/auth/signout" method="post"><button>Sign out</button></form>
    </div>;
  }
  return (
    <>
      <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: SHELL }} />
      <StudioBoot bootstrap={{ user: { id: user.id, name: user.name }, roles: user.roles, canPublish: user.canPublish }}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!} publishableKey={(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!} />
    </>
  );
}

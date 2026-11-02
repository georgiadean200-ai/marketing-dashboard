import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "TTC Marketing Studio", robots: { index: false, follow: false }, icons: { icon: "/favicon.svg" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// The studio keeps its original stylesheet exactly; Tailwind is not loaded here so nothing can restyle it.
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/studio/studio.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}

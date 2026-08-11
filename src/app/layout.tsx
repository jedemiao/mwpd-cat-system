import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
// Display face for the dashboard/chrome signature; body copy stays on Inter everywhere.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
// Utility face for routing numbers, dates, and counts — the register's own numbering system.
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  // Office-neutral: this layout also wraps /login, which is shown before any
  // office is known, and every unit in the regional office shares this tab
  // title. The signed-in unit is named in the sidebar instead.
  title: "DMW Caraga Tracker",
  description: "Communication and activity tracker for DMW Regional Office XIII",
  // Browser-tab favicon: the DMW seal (public/dmw_logo.png, same image as
  // asset/dmw_logo.png) instead of the browser's default globe.
  icons: {
    icon: "/dmw_logo.png",
    apple: "/dmw_logo.png",
  },
};

// Runs before paint so the correct theme applies immediately — without this,
// dark-mode visitors would see a light flash on every load.
const themeInitScript = `
(function () {
  var stored = localStorage.getItem("theme");
  var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-surface font-sans text-ink-900 dark:bg-ink-900 dark:text-white">
        {/* Runs before hydration so the correct theme applies without a light flash */}
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}

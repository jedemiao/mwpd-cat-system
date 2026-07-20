import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "MWPtD Tracker",
  description: "Communication and activity tracker for MWPD",
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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-surface font-sans text-ink-900 dark:bg-ink-900 dark:text-white">
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}

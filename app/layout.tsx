import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { Barlow_Condensed, Titillium_Web, JetBrains_Mono } from "next/font/google";
import { AuthErrorWatcher } from "@/components/auth-error-watcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "@/components/account-menu";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

// Runs before hydration (strategy="beforeInteractive") so the theme is
// correct on first paint — setting data-theme only from ThemeToggle's own
// useEffect would flash the default dark theme first for anyone who'd
// picked light. suppressHydrationWarning on <html> below covers the
// attribute this adds ahead of React's own render.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("theme") === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;

const displayFont = Barlow_Condensed({
  variable: "--next-font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["italic", "normal"],
});

const bodyFont = Titillium_Web({
  variable: "--next-font-body",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "900"],
});

const monoFont = JetBrains_Mono({
  variable: "--next-font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Caxeta Gordinho",
  description: "Gestão de lives, ranking, Caxetão e campeonatos de Caxeta.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html
      lang="pt-BR"
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <AuthErrorWatcher />
        {/* Global masthead on every page (not a floating overlay) —
            guarantees it never sits on top of a page's own top-right
            content, at the cost of a small amount of vertical space on
            every screen. */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-stroke">
          <Link href="/" className="font-display italic font-extrabold uppercase">
            Caxetão do <span className="text-red">Gordinho</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user ? (
              <AccountMenu />
            ) : (
              <Link href="/admin/login" className="btn btn-ghost btn-sm inline-flex items-center gap-2">
                <span aria-hidden="true">🔒</span> Área Restrita
              </Link>
            )}
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}

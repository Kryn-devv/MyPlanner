import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/config/app";
import "./globals.css";

/**
 * `display: "swap"` keeps first paint immediate; the variable axis means one
 * file covers every weight the product uses.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-stack",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    // Brand comes from config, so renaming the product is a one-line change.
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Not capped: pinch-zoom is an accessibility requirement, not a nuisance.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body>
        <a href="#main" className="sr-only-focusable z-[100] m-3 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-medium text-white">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

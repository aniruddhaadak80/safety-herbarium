import type { Metadata } from "next";
import { Bodoni_Moda, IBM_Plex_Mono, Spectral } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { absolute, site } from "@/lib/site";

/*
 * Three faces, all variable, self-hosted by next/font at build time.
 *
 *  - Bodoni Moda: display and the italic on determination labels. A high-contrast
 *    didone reads as a printed catalogue caption rather than a web heading.
 *  - Spectral: body. A serif you can read a paper abstract in.
 *  - IBM Plex Mono: accession numbers, scores and coverage figures, tabular.
 */
const display = Bodoni_Moda({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bodoni",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const body = Spectral({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-spectral",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-jakarta",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.liveUrl),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "AI safety",
    "AI alignment",
    "arXiv",
    "reading list",
    "literature review",
    "interpretability",
    "scalable oversight",
    "corrigibility",
    "MCP",
    "open access",
  ],
  authors: [{ name: site.author, url: site.repoUrl }],
  creator: site.author,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: site.liveUrl,
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: [
      {
        url: absolute("/opengraph-image"),
        width: 1200,
        height: 630,
        alt: "Safety Herbarium: a mounted sheet of AI-safety literature with a coverage plate",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: [absolute("/opengraph-image")],
    creator: "@aniruddhaadak80",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport = {
  themeColor: "#f4efe4",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-scroll-behavior` tells Next this page opts into smooth scrolling, so
    // it does not warn about it on every route change.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-field focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <div className="relative z-10 flex min-h-screen flex-col">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
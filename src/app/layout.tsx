import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { CspNonceProvider } from "@/context/csp-nonce-context";
import localFont from "next/font/local";
import { AuthProvider } from "@/context/auth-context";
import {
  SITE,
  KEYWORDS,
  GOOGLE_SITE_VERIFICATION,
  ORGANIZATION_JSON_LD,
  WEBSITE_JSON_LD,
  FINANCIAL_SERVICE_JSON_LD,
} from "@/lib/site";
import { I18nProvider } from "@/context/i18n-context";
import { ToastProvider } from "@/components/layout/toast-provider";
import FloatingWhatsApp from "@/components/layout/floating-whatsapp";
import FloatingTabBar from "@/components/layout/floating-tab-bar";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import { ReducedMotionProvider } from "@/components/providers/reduced-motion";
import AnalyticsProvider from "@/components/providers/analytics-provider";
import CookieConsent from "@/components/layout/cookie-consent";
import "./globals.css";

/*
 * Fonts, self hosted, latin only.
 *
 * The fontsource packages ship every subset in one stylesheet, so a phone in
 * Accra was pulling two Inter files and two DM Serif files, 173 KiB in total,
 * and the browser had to resolve four font requests before it could settle the
 * layout. These are the same files, reduced to the one subset this site needs,
 * declared through next/font so they are preloaded and given metric compatible
 * fallbacks that keep the text from jumping when they land.
 */
const inter = localFont({
  src: "../fonts/inter-latin-variable.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
  adjustFontFallback: "Arial",
});

const serif = localFont({
  src: "../fonts/dm-serif-display-latin-400.woff2",
  variable: "--font-dm-serif",
  display: "swap",
  weight: "400",
  adjustFontFallback: "Times New Roman",
});

const grotesk = localFont({
  src: "../fonts/space-grotesk-latin-variable.woff2",
  variable: "--font-space-grotesk",
  display: "swap",
  weight: "300 700",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} | Susu Savings in Ghana`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [...KEYWORDS],
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  category: "finance",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  verification: {
    google: GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} | Susu Savings in Ghana`,
    description: SITE.description,
    locale: "en_GH",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE.name}, ${SITE.tagline}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} | Susu Savings in Ghana`,
    description: SITE.description,
    images: ["/opengraph-image"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/brand_logo.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/brand_logo.png", sizes: "512x512" }],
    shortcut: "/brand_logo.png",
  },
  formatDetection: { telephone: true, address: true, email: true },
};

export const viewport: Viewport = {
  themeColor: "#020C06",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${serif.variable} ${grotesk.variable}`}
      suppressHydrationWarning
    >
      <body
        suppressHydrationWarning
        className="bg-[#020C06] font-sans antialiased text-gray-100 min-h-screen overflow-x-hidden"
      >
        <CspNonceProvider nonce={nonce}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100000] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-[#020C06] focus:font-bold"
        >
          Skip to content
        </a>
        {[ORGANIZATION_JSON_LD, WEBSITE_JSON_LD, FINANCIAL_SERVICE_JSON_LD].map((schema) => (
          <script
            key={schema["@type"] as string}
            nonce={nonce}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
        <ReducedMotionProvider>
        <SmoothScroll>
          <I18nProvider>
            <AuthProvider>
              <ToastProvider>
                <AnalyticsProvider />
                {/*
                  The skip link targets this element, so it must be able to hold
                  focus: a browser scrolls to a plain `div` but leaves the caret
                  where it was, which means "Skip to content" moved the view and
                  not the keyboard. `tabIndex={-1}` makes the jump real without
                  adding it to the tab order.

                  It stays a div rather than becoming `<main>` because every page
                  renders its own `<main>`; a second one would give a screen
                  reader two "main" landmarks and no way to tell them apart.
                */}
                <div id="main-content" tabIndex={-1} className="outline-none">
                  {children}
                </div>
                <FloatingWhatsApp />
                <FloatingTabBar />
                <CookieConsent />
              </ToastProvider>
            </AuthProvider>
          </I18nProvider>
        </SmoothScroll>
        </ReducedMotionProvider>
        </CspNonceProvider>
      </body>
    </html>
  );
}

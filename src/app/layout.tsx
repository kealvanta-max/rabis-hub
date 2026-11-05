import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/dm-serif-display";
import "@fontsource-variable/space-grotesk";
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
import AnalyticsProvider from "@/components/providers/analytics-provider";
import CookieConsent from "@/components/layout/cookie-consent";
import AudioPlayer from "@/components/ui/audio-player";
import LoadingScreen from "@/components/ui/loading-screen";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="bg-[#020C06] font-sans antialiased text-gray-100 min-h-screen overflow-x-hidden"
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100000] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-[#020C06] focus:font-bold"
        >
          Skip to content
        </a>
        {[ORGANIZATION_JSON_LD, WEBSITE_JSON_LD, FINANCIAL_SERVICE_JSON_LD].map((schema) => (
          <script
            key={schema["@type"] as string}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
        <SmoothScroll>
          <I18nProvider>
            <AuthProvider>
              <ToastProvider>
                <AnalyticsProvider />
                <LoadingScreen />
                <div id="main-content">{children}</div>
                <FloatingWhatsApp />
                <AudioPlayer />
                <FloatingTabBar />
                <CookieConsent />
              </ToastProvider>
            </AuthProvider>
          </I18nProvider>
        </SmoothScroll>
      </body>
    </html>
  );
}

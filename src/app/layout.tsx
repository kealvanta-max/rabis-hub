import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/dm-serif-display";
import "@fontsource-variable/space-grotesk";
import { AuthProvider } from "@/context/auth-context";
import { I18nProvider } from "@/context/i18n-context";
import { ToastProvider } from "@/components/layout/toast-provider";
import FloatingWhatsApp from "@/components/layout/floating-whatsapp";
import FloatingTabBar from "@/components/layout/floating-tab-bar";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import AudioPlayer from "@/components/ui/audio-player";
import LoadingScreen from "@/components/ui/loading-screen";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://rabissavinghub.com"),
  title: "Rabi's Saving Hub | Save Smart, Grow Together",
  description:
    "Ghana's Premium Susu Savings Platform — Join a trusted community, save smart, and grow your wealth together with flexible daily, weekly, and monthly plans.",
  keywords: ["susu", "savings", "ghana", "investment", "community savings", "rabi", "mobile money", "momo"],
  authors: [{ name: "Rabi's Saving Hub" }],
  creator: "Rabi's Saving Hub",
  publisher: "Rabi's Saving Hub",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Rabi's Saving Hub | Save Smart, Grow Together",
    description: "Ghana's Premium Susu Savings Platform — Join a trusted community of smart savers.",
    type: "website",
    locale: "en_GH",
    siteName: "Rabi's Saving Hub",
    images: [{ url: "/brand_logo.png", width: 512, height: 512, alt: "Rabi's Saving Hub Logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rabi's Saving Hub | Save Smart, Grow Together",
    description: "Ghana's Premium Susu Savings Platform",
    images: ["/brand_logo.png"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/brand_logo.png",
    apple: "/brand_logo.png",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "FinancialService",
  name: "Rabi's Saving Hub",
  url: "https://rabissavinghub.com",
  logo: "https://rabissavinghub.com/brand_logo.png",
  image: "https://rabissavinghub.com/brand_logo.png",
  description:
    "Ghana's premium digital Susu savings platform with daily, weekly and monthly community savings plans.",
  areaServed: "Ghana",
  telephone: "+233504701032",
  email: "rabisavinghub@gmail.com",
  sameAs: [
    "https://www.tiktok.com/@rabissavinghub",
    "https://www.instagram.com/rabisavinghub",
    "https://www.facebook.com/profile.php?id=61576456847439",
  ],
  address: {
    "@type": "PostalAddress",
    addressLocality: "Accra",
    addressCountry: "GH",
  },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <SmoothScroll>
          <I18nProvider>
            <AuthProvider>
              <ToastProvider>
                <LoadingScreen />
                <div id="main-content">{children}</div>
                <FloatingWhatsApp />
                <AudioPlayer />
                <FloatingTabBar />
              </ToastProvider>
            </AuthProvider>
          </I18nProvider>
        </SmoothScroll>
      </body>
    </html>
  );
}

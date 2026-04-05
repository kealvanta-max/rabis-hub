import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter, Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/context/auth-context";
import { I18nProvider } from "@/context/i18n-context";
import { ToastProvider } from "@/components/layout/toast-provider";
import FloatingWhatsApp from "@/components/layout/floating-whatsapp";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import AudioPlayer from "@/components/ui/audio-player";
import LoadingScreen from "@/components/ui/loading-screen";
import "./globals.css";

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

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
  icons: {
    icon: "/brand_logo.png",
    apple: "/brand_logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#020C06",
  width: "device-width",
  initialScale: 1,
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
        className={`${dmSerifDisplay.variable} ${inter.variable} ${spaceGrotesk.variable} bg-[#020C06] font-sans antialiased text-gray-100 min-h-screen overflow-x-hidden`}
      >
        <SmoothScroll>
          <I18nProvider>
            <AuthProvider>
              <ToastProvider>
                <LoadingScreen />
                {children}
                <FloatingWhatsApp />
                <AudioPlayer />
              </ToastProvider>
            </AuthProvider>
          </I18nProvider>
        </SmoothScroll>
        <script src="https://cdn.lordicon.com/lordicon.js" async></script>
      </body>
    </html>
  );
}

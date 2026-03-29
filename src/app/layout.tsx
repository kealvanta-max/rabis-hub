import type { Metadata } from "next";
import { DM_Serif_Display, Inter, Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/context/auth-context";
import { I18nProvider } from "@/context/i18n-context";
import { ToastProvider } from "@/components/layout/toast-provider";
import FloatingWhatsApp from "@/components/layout/floating-whatsapp";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
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
  title: "Rabi's Saving Hub | Save Smart, Grow Together",
  description:
    "Ghana's Premium Susu Savings Platform — Join a trusted community, save smart, and grow your wealth together with flexible daily, weekly, and monthly plans.",
  keywords: ["susu", "savings", "ghana", "investment", "community savings", "rabi"],
  openGraph: {
    title: "Rabi's Saving Hub | Save Smart, Grow Together",
    description: "Ghana's Premium Susu Savings Platform",
    type: "website",
  },
};

import AudioPlayer from "@/components/ui/audio-player";
import LoadingScreen from "@/components/ui/loading-screen";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${dmSerifDisplay.variable} ${inter.variable} ${spaceGrotesk.variable} bg-[#0A1628] font-sans antialiased text-gray-100 min-h-screen overflow-x-hidden`}
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
      </body>
    </html>
  );
}

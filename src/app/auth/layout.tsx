import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Join Rabi's Saving Hub, Start Saving from GH₵6 a Day",
  description:
    "Create your Susu account in 5 minutes: pick a plan, verify your Ghana Card and selfie on your phone, and get approved by Rabi to join the members' WhatsApp group.",
  path: "/auth",
  keywords: ["join susu Ghana", "open susu account", "susu registration Ghana"],
});

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}

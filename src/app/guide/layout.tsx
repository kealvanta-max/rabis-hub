import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "How Susu Savings Works — Step by Step Guide",
  description:
    "Learn how Susu savings works at Rabi's Saving Hub in Ghana: choosing a daily, weekly or monthly plan, verifying your Ghana Card, and cashing out with a real person on WhatsApp.",
  path: "/guide",
  keywords: ["how susu works", "susu guide Ghana", "susu rules", "how to join susu"],
});

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}

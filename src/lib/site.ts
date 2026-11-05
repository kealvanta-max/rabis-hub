import type { Metadata } from "next";

/**
 * Single source of truth for everything search engines see.
 *
 * The live domain is the Vercel one until Rabi buys her own — set
 * `NEXT_PUBLIC_SITE_URL` in Vercel and every canonical, sitemap entry and
 * social card follows, with no code changes.
 */
export const SITE = {
  name: "Rabi's Saving Hub",
  shortName: "RabiHub",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://rabis-hub.vercel.app").replace(/\/+$/, ""),
  tagline: "Save Smart, Grow Together",
  description:
    "Rabi's Saving Hub is Ghana's trusted Susu savings community. Join a daily, weekly or monthly plan from GH₵6, get verified in minutes, and cash out with a real person on WhatsApp — no banks, no hidden charges.",
  phone: "+233504701032",
  whatsapp: "233504701032",
  email: "rabisavinghub@gmail.com",
  city: "Accra",
  region: "Greater Accra",
  country: "GH",
  socials: [
    "https://www.tiktok.com/@rabissavinghub",
    "https://www.instagram.com/rabisavinghub",
    "https://www.facebook.com/profile.php?id=61576456847439",
  ],
} as const;

/** Keywords Ghanaians actually type — long-tail beats vanity terms. */
export const KEYWORDS = [
  "susu",
  "susu savings Ghana",
  "susu collector Accra",
  "daily susu Ghana",
  "weekly susu plan",
  "osusu savings",
  "savings group Ghana",
  "susu app Ghana",
  "how to save money in Ghana",
  "susu near me",
  "Rabi's Saving Hub",
  "savings plan Ghana",
  "momo savings",
  "Accra savings group",
];

export function absoluteUrl(path = "/") {
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}

interface PageMetaOptions {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
  image?: string;
}

/** Consistent, canonical-correct metadata for every page. */
export function pageMetadata({
  title,
  description,
  path,
  keywords = [],
  noIndex = false,
  image = "/opengraph-image",
}: PageMetaOptions): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    keywords: [...KEYWORDS, ...keywords],
    alternates: { canonical: path },
    robots: noIndex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    openGraph: {
      type: "website",
      url,
      siteName: SITE.name,
      title,
      description,
      locale: "en_GH",
      images: [{ url: image, width: 1200, height: 630, alt: `${SITE.name} — ${SITE.tagline}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

/** Real questions members ask on WhatsApp — marked up so Google can answer them. */
export const FAQS = [
  {
    q: "What is Rabi's Saving Hub?",
    a: "Rabi's Saving Hub is a Susu savings community in Accra, Ghana. You pick a daily, weekly or monthly plan, contribute on schedule, and receive your payout when your round ends — all coordinated by a real person on WhatsApp.",
  },
  {
    q: "How much money do I need to start a Susu plan?",
    a: "Plans start from GH₵6 a day. Daily, weekly, 6-month, monthly and Achiever plans are available, and the dashboard shows exactly what you pay and what you receive before you join.",
  },
  {
    q: "How do I join Rabi's Saving Hub?",
    a: "Create an account, verify your Ghana Card and take a quick selfie, and share your location for verification. Rabi reviews your application — once approved you are added to the members' WhatsApp group.",
  },
  {
    q: "How do I pay my contributions?",
    a: "Contributions are collected directly by Rabi over Mobile Money and confirmed in your WhatsApp group. There is no card payment on the website and no hidden charge.",
  },
  {
    q: "Does Rabi's Saving Hub operate outside Accra?",
    a: "Yes. Members join from Greater Accra and across Ghana. The location check simply keeps the community verified and safe.",
  },
  {
    q: "Is my Ghana Card information safe?",
    a: "Your documents are checked on your own device before upload and are visible only to Rabi for approval. We never sell data and never post your documents publicly.",
  },
];

const postalAddress = {
  "@type": "PostalAddress",
  addressLocality: SITE.city,
  addressRegion: SITE.region,
  addressCountry: SITE.country,
};

export const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE.url}/#organization`,
  name: SITE.name,
  alternateName: "Rabis Saving Hub",
  url: SITE.url,
  logo: { "@type": "ImageObject", url: absoluteUrl("/brand_logo.png"), width: 512, height: 512 },
  image: absoluteUrl("/opengraph-image"),
  description: SITE.description,
  telephone: SITE.phone,
  email: SITE.email,
  address: postalAddress,
  areaServed: [{ "@type": "Country", name: "Ghana" }, { "@type": "City", name: "Accra" }],
  sameAs: [...SITE.socials],
};

export const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE.url}/#website`,
  url: SITE.url,
  name: SITE.name,
  description: SITE.description,
  inLanguage: "en-GH",
  publisher: { "@id": `${SITE.url}/#organization` },
};

export const FINANCIAL_SERVICE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "@id": `${SITE.url}/#service`,
  name: SITE.name,
  url: SITE.url,
  image: absoluteUrl("/opengraph-image"),
  description: SITE.description,
  areaServed: { "@type": "Country", name: "Ghana" },
  telephone: SITE.phone,
  email: SITE.email,
  priceRange: "GH₵6 – GH₵1000",
  currenciesAccepted: "GHS",
  paymentAccepted: "Mobile Money",
  address: postalAddress,
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    opens: "08:00",
    closes: "20:00",
  },
  sameAs: [...SITE.socials],
};

export const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const BREADCRUMB_JSON_LD = (trail: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((entry, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: entry.name,
    item: absoluteUrl(entry.path),
  })),
});

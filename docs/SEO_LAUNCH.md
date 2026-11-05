# Getting Rabi's Saving Hub found on Google

Everything technical is already built. This is the 15-minute checklist Rabi
(or you) needs to run once after the site is deployed.

**Live domain:** `https://rabis-hub.vercel.app`
**Not the domain:** `rabissavinghub.com` — that is not ours. If it is ever bought,
change one variable (`NEXT_PUBLIC_SITE_URL`) and every canonical, sitemap entry
and social card follows automatically.

---

## 1. Google Search Console

1. Open <https://search.google.com/search-console> → **Add property**.
2. Choose **URL prefix** (not "Domain" — Domain needs DNS access we don't have).
3. Enter exactly: `https://rabis-hub.vercel.app`
4. Pick the **HTML tag** verification method and copy only the `content` value:
   ```html
   <meta name="google-site-verification" content="THIS_PART" />
   ```
5. Vercel → project → **Settings → Environment Variables** →
   add `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` = that value → **Redeploy**.
6. Back in Search Console → **Verify**.

## 2. Submit the sitemap

Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit**.
It is generated automatically and only lists public pages (`/dashboard`,
`/admin` and `/api` are excluded in `robots.txt`).

## 3. Ask Google to index the money pages

Search Console → **URL Inspection** → paste and click **Request indexing** for:

- `https://rabis-hub.vercel.app/`
- `https://rabis-hub.vercel.app/auth`
- `https://rabis-hub.vercel.app/guide`

## 4. Google Business Profile (biggest win for local search)

"Susu collector Accra" searches are local-intent. Create a free profile at
<https://business.google.com> with the same name, phone (+233 50 470 1032) and
Accra address. This puts Rabi on Google Maps and in the local pack — where most
of her customers will actually find her.

## 5. What is already done for SEO

| Item | Where |
| :--- | :--- |
| Real titles + descriptions per page | `src/app/**/layout.tsx` |
| Canonical URLs on the live domain | `src/lib/site.ts` |
| `sitemap.xml` + `robots.txt` | `src/app/sitemap.ts`, `src/app/robots.ts` |
| Organization / WebSite / FinancialService / FAQ structured data | `src/lib/site.ts`, `src/app/layout.tsx`, `src/components/home/faq.tsx` |
| Visible FAQ section (real member questions) | homepage `#faq` |
| WhatsApp/Facebook/X share card, 1200×630 | `src/app/opengraph-image.tsx` |
| Mobile-first, fast first paint (skeletons, lazy OCR/AI) | whole app |

## 6. Optional: Bing & PostHog

- Bing: `NEXT_PUBLIC_BING_SITE_VERIFICATION`
- Analytics: `NEXT_PUBLIC_POSTHOG_KEY` (loads only after cookie consent)
- Errors: `SENTRY_DSN` (relayed through `/api/errors`)
- Rate limiting: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

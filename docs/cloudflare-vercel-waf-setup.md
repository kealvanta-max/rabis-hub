# Put Cloudflare in front of the Vercel production hostname

The response headers added in `middleware.ts` are **not a WAF**. A cloud WAF requires an eligible domain that you control. Cloudflare cannot proxy the shared `*.vercel.app` hostname as your zone; use a custom domain (for example `www.example.com`). Cloudflare Free features and dashboard names can change; verify what the account offers and do not assume all managed WAF/rate-limiting rules are free.

## Setup

1. **Use a custom domain.** Add a domain you control to Cloudflare. If production currently uses only `rabi-saving-hub.vercel.app`, first purchase/own a domain; do not attempt to change DNS for `vercel.app`.
2. **Add the custom domain in Vercel first.** In the Vercel project → Settings → Domains, add the apex and/or `www` host, follow Vercel's exact DNS verification instructions, and wait for Vercel to mark it valid. Set the custom hostname as the production canonical URL and update `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` before deploying.
3. **Move authoritative nameservers to Cloudflare.** Add the domain to Cloudflare, copy the exact nameservers it provides, then update them at the registrar. Wait until Cloudflare reports the zone Active. Keep the DNSSEC DS record consistent during the nameserver change; a stale DS record can make the domain unreachable.
4. **Create Vercel DNS records in Cloudflare.** Use the exact values Vercel shows. Common configuration is a CNAME for `www` to Vercel's assigned CNAME target and an apex A record to Vercel's assigned IP, with Cloudflare proxy enabled (orange cloud). Vercel may prescribe different records; follow the project/domain-specific values. Keep verification TXT records as DNS-only.
5. **Set TLS correctly.** Cloudflare → SSL/TLS → Overview: choose **Full (strict)** after Vercel has a valid certificate. Enable Always Use HTTPS and Automatic HTTPS Rewrites. Do not use Flexible mode.
6. **Enable edge protection.** Cloudflare → Security: enable available DDoS protection and the managed WAF rulesets offered for the plan. Add a narrowly scoped rule to challenge or block obvious abusive traffic to sensitive routes only after testing. Avoid blanket challenges on all routes: they can interfere with Firebase/Google sign-in, mobile upload flows, health checks, and crawlers. Never rate-limit image uploads so aggressively that normal signup retries get locked out.
7. **Test before cutover.** Validate homepage, robots.txt, sitemap, Bing Webmaster Tools and DuckDuckGo crawl access, Google/Firebase popup sign-in, Cloudinary upload, signup, admin, and security headers from both the custom domain and the Vercel alias. Watch Cloudflare Security Events and Vercel logs for false positives. Roll back by switching the proxy off (DNS-only) while investigating.

## Important limits

- Cloudflare proxying does not automatically make the Vercel origin private. The `*.vercel.app` alias and deployment URLs may remain reachable and could bypass Cloudflare controls. Use Vercel domain/redirect/access controls supported by your deployment, make the custom host canonical, and verify that alternate aliases cannot serve sensitive production content. Do not claim Cloudflare protects requests that reach Vercel directly.
- Cloudflare free plan is not a promise of unlimited bot mitigation, custom rules, managed rules, or rate limiting. Check the live plan limits in the account before relying on a feature.
- A WAF reduces some network and application-layer abuse; it does not repair XSS, authorization, insecure evidence storage, or application logic.

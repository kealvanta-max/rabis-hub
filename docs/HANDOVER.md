# Handover — Rabi's Saving Hub

Everything here is written for the person who will **own and run** the site, not
for a developer. The technical version lives in `docs/VERCEL_DEPLOY.md` and
`docs/PRODUCTION_READINESS.md`.

---

## What you now own

| Account | What it does | Keep it safe |
| :--- | :--- | :--- |
| **Vercel** (site hosting) | serves the website | turn on 2FA |
| **Firebase** (Google) | stores members and logins | turn on 2FA, verify your email |
| **Cloudinary** | stores the ID photos members upload | turn on 2FA |
| **Resend** | sends the "approved" / "declined" emails | turn on 2FA |
| **GitHub** | holds the code | turn on 2FA |

All accounts must be on **your** email and **your** phone number for password
recovery. If they are on someone else's, that person can take the business
offline.

---

## The five things to do before you share the link

1. **Publish the database rules** — Firebase console → Firestore Database →
   Rules → paste the contents of `firestore.rules` → **Publish**.
   *(Skipping this makes signups fail silently. This is what broke a real test
   signup.)*
2. **Authorize the website address** — Firebase console → Authentication →
   Settings → Authorized domains → add `rabis-hub.vercel.app`.
3. **Verify your email** — Firebase console → Authentication → Users → your
   account → *Verify*. Then run `npm run admin:setup` once on a computer so your
   account is recognised as the admin.
4. **Turn on 2FA everywhere** (list above). Ten minutes, protects everything.
5. **Turn on Firestore backups** — Google Cloud console → Firestore → Backups.
   Free at this size, and the only way to undo an accidental delete.

---

## Your daily job (2 minutes)

1. Open `rabis-hub.vercel.app/admin` on your phone.
2. **Users** tab → tap **Review** on a new member → check the Ghana Card number
   matches the photo → **Approve**.
3. The member instantly receives the WhatsApp group link for their plan.
4. Not right? Tap **Reject…**, write one friendly sentence — it is emailed to
   them word for word. They can contact you and try again.

**Announcements** tab: post "Next cashout is Tuesday" and it appears on every
member's dashboard. Plans, prices and WhatsApp links are editable in their tabs —
no developer needed.

## Once a month (5 minutes)

* Check the Resend dashboard — if you are near 3,000 emails in the month, slow
  down rejections.
* Check Cloudinary storage — video clips are the heavy ones.
* Export your member list (Users → **Export CSV**) and keep one copy on your
  phone or in Google Drive. This is your safety net.

---

## What to do if something looks wrong

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| New member says "my signup did not go through" | database rules not published | step 1 above |
| "We could not read this card automatically" | blurry photo or weak network | open the member, compare the photo yourself, approve manually |
| Camera will not open | another app is using it (WhatsApp bubble) | close floating bubbles, try again |
| Emails stopped | Resend daily limit | approve fewer at once; the app still works without email |
| A message says the site is "locked" and asks for a code | **fake** | never send money or codes; call the member |

---

## What nobody can do for you

* **Never share your admin password** — not with a "developer", not over a video
  call, not in a WhatsApp message. Real support never asks.
* If you ever pasted a password or key into a chat, change it that day. Rotating
  a key is ten minutes; a hacked payout run is your savings.
* If you see a member in the admin panel you did not approve, tell your developer
  immediately.

---

## If you want to change something in the code

The repository is yours. `FIXES.md` records every change with the reason, so a
future developer can see *why* something was built the way it was — including the
security decisions, which must not be quietly reversed (there are tests that will
stop them).

Costs to run: **$0 today** at up to roughly 100–200 active members. See
`docs/PRODUCTION_READINESS.md` for the exact free-tier limits and what the first
few dollars will buy.

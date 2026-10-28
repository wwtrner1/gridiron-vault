# Team hub messaging: turning on email and texts

Front Office → Messages works today without any setup: coaches post to the
coaches' board, and announcements to families open the coach's own email app
(families in Bcc) or phone, and are kept in the hub. Turning on the two
switches below lets GridIronVault send them itself, to every contact on the
team's roster. The server always works out the recipients from the roster, so
nobody can use it to message people who aren't on a team.

## Email (Resend), about 15 minutes

1. Sign up at resend.com (free tier: 3,000 emails a month, 100 a day).
2. Domains → Add `gridiron-vault.com`, then add the DNS records it shows in
   Netlify (Domains → gridiron-vault.com → DNS). Wait for "Verified".
3. API Keys → Create (sending access only).
4. In Netlify → Site configuration → Environment variables, add:
   - `RESEND_API_KEY` = the key (mark it secret)
   - `HUB_EMAIL_FROM` = `GridIronVault Team <team@gridiron-vault.com>`
5. Redeploy. The "Email families" box turns on. Replies go to the coach who
   sent the announcement.

## Texts (Twilio), about 30 minutes plus carrier review

The Twilio account used for phone codes is reused (`TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN` are already set).

1. Twilio console → Phone Numbers → Buy a local number with SMS (about $1.15
   a month; texts about $0.008 each plus carrier fees).
2. US numbers need **A2P 10DLC registration** before carriers deliver texts:
   Messaging → Regulatory compliance → register the brand and a "Low Volume
   Mixed" campaign. The campaign description, opt-in flow (the team's
   `/join/:token` sign-up page), sample messages and HELP/STOP replies are
   written out ready to paste in `a2p-10dlc-registration.md` in the project's
   launch files. Approval takes a few days to a few weeks.
3. Messaging → Services → Create a Messaging Service, add the number to it.
   The service handles STOP / HELP replies on its own.
4. In Netlify environment variables add:
   - `TWILIO_MESSAGING_SID` = the service's SID (starts `MG`), or
     `TWILIO_FROM` = the number in +1 format
   - `TEAM_SMS` = `on`
5. Redeploy. "Text families who signed up" turns on. Only numbers that signed
   up on the team's link (Messages → Players & families → Family texts
   sign-up) get texts; a coach can take a number off but never add one. The
   roster's "OK to text" only fills the coach's own Messages app links.

## Limits

Per Front Office per day: 1,000 emails and 300 texts (`MESSAGE_LIMITS` in
`src/lib/teamHub.ts`). Every text starts "GridIronVault - Team name:" and ends "Reply STOP to opt out." A team's sign-up page takes at most 40 new numbers a day and 400 in all (`TEXT_LIMITS`).

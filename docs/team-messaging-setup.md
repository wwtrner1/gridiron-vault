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
   Messaging → Regulatory compliance → register the brand (sole proprietor is
   fine) and a campaign ("Account notifications", sample: "Eagles: Saturday's
   game moved to 10 AM. Reply STOP to opt out."). Approval takes a few days.
3. Messaging → Services → Create a Messaging Service, add the number to it.
   The service handles STOP / HELP replies on its own.
4. In Netlify environment variables add:
   - `TWILIO_MESSAGING_SID` = the service's SID (starts `MG`), or
     `TWILIO_FROM` = the number in +1 format
   - `TEAM_SMS` = `on`
5. Redeploy. "Text families who said OK" turns on. Only phones a coach marked
   "OK to text" on the roster get texts.

## Limits

Per Front Office per day: 1,000 emails and 300 texts (`MESSAGE_LIMITS` in
`src/lib/teamHub.ts`). Every text ends "Reply STOP to opt out."

# New-signup email to the owner

When a coach's account is created, GridIronVault emails the owner: name, email,
plan (the 14-day trial and when it ends, Sideline when the email isn't eligible
for a trial, Sideline when trials are off), how they signed up (email or Google),
roughly where from, and when. One email per account. The owner's own first
sign-in sends nothing.

It is sent from `ensureProfile` in `netlify/functions/api.ts` the moment a
coach's profile row is first made (`netlify/admin/signupAlert.ts`), which is
the first `/api/me` call after sign-in. It is off until email is set up, and an
email problem never fails a sign-up: the send runs after the answer goes out
(Netlify's `waitUntil`), gives up after about 4 seconds, errors and setup
mistakes only go to the function log, and there is no retry. Because the profile
insert is what decides "new", a burst of first calls, a second tab or a second
device still sends one email. An account that was deleted never counts as new
again, even if a device still holding its old sign-in makes the profile row anew.

## Turning it on (Netlify → Site configuration → Environment variables)

It uses the same Resend account as team announcements
(`docs/team-messaging-setup.md`, steps 1 to 4). If you already did that, it is on.
Otherwise set:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | the Resend key (mark it secret) |
| `HUB_EMAIL_FROM` | `GridIronVault <team@gridiron-vault.com>`, an address on a domain verified in Resend |

Optional:

| Variable | Value |
| --- | --- |
| `SIGNUP_ALERT_TO` | who gets it, comma-separated. Left out, it goes to every address on the owner list (`netlify/security/owner.ts`: the built-in owner plus `OWNER_EMAILS`). `off` switches it off. |
| `SIGNUP_ALERT_FROM` | a sender for this email only, so team announcements keep `HUB_EMAIL_FROM`. |

Redeploy after changing them (environment changes only reach the function on a
new deploy). Resend's test sender (`onboarding@resend.dev`) can only send to the
address the Resend account was made with, so it works for a quick start with
`SIGNUP_ALERT_FROM` and your own address in `SIGNUP_ALERT_TO`, with no domain to
verify.

If emails stop: the Netlify function log shows `Resend notice 4xx` with Resend's
reason (an unverified domain, a bad key), or "New-signup email is off" with what
is missing (the key or sender, or a `SIGNUP_ALERT_TO` with no valid address). The
notice shares the Resend quota (free tier: 100 emails a day) with team
announcements, so a burst of signups can use some of it.

## What this does not do

It does not see accounts that never signed in (an email that was never
confirmed), and a failed send is not retried. Netlify Identity's own signup
event isn't used: it fires before any plan exists, and can't be exercised
outside a deploy (Identity doesn't run under `netlify dev`).

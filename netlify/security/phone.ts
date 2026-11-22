/**
 * Phone numbers as families type them on a team's texts sign-up page.
 *
 * This file used to hold the sign-in phone check too (Twilio Verify: a
 * verified mobile on every account and a texted code on each new device). It
 * was taken out on 2026-11-22 because it kept coaches from joining. Nothing
 * reads `TWILIO_VERIFY_SID` any more, so no setting on the site can bring the
 * codes back: that takes new code.
 */

/** US and Canadian numbers as typed → E.164 (+15551234567); other countries need the + and code. */
export function normalizePhone(raw: string): string | null {
  const s = raw.trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

const KEY = "grid1ronvault.saveask.v1";

/**
 * True once per browser: the first save with no account is when a coach has something worth keeping,
 * so that save's note offers the Create account tab (and the trial). Every later save is a plain note.
 * Storage that refuses (a private window) answers false, so the offer never repeats on every save.
 */
export function takeAccountAsk(): boolean {
  try {
    if (localStorage.getItem(KEY)) return false;
    localStorage.setItem(KEY, "1");
    return true;
  } catch {
    return false;
  }
}

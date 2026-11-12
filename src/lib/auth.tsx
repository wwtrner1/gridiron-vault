import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthError,
  MissingIdentityError,
  getUser,
  handleAuthCallback,
  login as identityLogin,
  logout as identityLogout,
  oauthLogin,
  refreshSession,
  requestPasswordRecovery,
  signup as identitySignup,
  updateUser,
} from "@netlify/identity";
import { api } from "./api";

export type Account = { id: string; email: string; name: string };

type AuthValue = {
  account: Account | null;
  status: "loading" | "ready";
  available: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<string>;
  signOut: () => Promise<void>;
  startOAuth: (provider: "google" | "github") => void;
  sendReset: (email: string) => Promise<void>;
  /** True after a coach opens a password-reset link: signed in, new password not chosen yet. */
  recovering: boolean;
  /** An emailed link (password reset, confirmation, invite) that Identity refused: expired, used, or not ours. */
  linkFailed: LinkKind | null;
  /**
   * The account answered as if nobody were signed in while this page still shows a coach: refresh the sign-in
   * and say whether it is good again. When it can't be, the page signs out so it stops looking signed in.
   */
  renew: () => Promise<boolean>;
  setNewPassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const toAccount = (user: {
  id: string;
  email?: string;
  name?: string;
  userMetadata?: Record<string, unknown>;
}): Account => ({
  id: user.id,
  email: user.email ?? "",
  name:
    user.name ||
    (user.userMetadata?.full_name as string) ||
    (user.email ?? "").split("@")[0] ||
    "Coach",
});

/*
 * Staying signed in. Identity keeps the session in two places: cookies the
 * browser forgets when it closes (they have no expiry date), and a saved copy
 * in this browser that includes the long-lived refresh token. iPhone Safari
 * and home-screen apps close all the time, and once the cookies were gone
 * Identity threw the saved copy away too, so coaches had to sign in again.
 * Before Identity looks, we rebuild the cookies from the saved copy (with a
 * fresh token if the old one has run out) and give them a 30-day life.
 */
const SAVED = "gotrue.user";
const COOKIE_DAYS = 30;

function writeAuthCookies(access: string, refresh?: string) {
  const tail = `; path=/; max-age=${COOKIE_DAYS * 86400}; secure; samesite=lax`;
  document.cookie = `nf_jwt=${encodeURIComponent(access)}${tail}`;
  if (refresh) document.cookie = `nf_refresh=${encodeURIComponent(refresh)}${tail}`;
}

const jwtExpiry = (jwt: string): number => {
  try {
    return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000;
  } catch {
    return 0;
  }
};

type Saved = { token?: { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number } };

async function restoreSession() {
  // Identity's own copy of the sign-in refreshes first, when it holds one. Two refreshers used to share one
  // refresh token: Identity's timer and the trade below. Identity hands out a new refresh token each time and
  // retires the old one, so whichever went second failed, and Identity's failure wipes the saved copy. The page
  // still showed the coach signed in, but the cookie the API reads ran out an hour later: every call was then
  // answered as signed out, and the owner lost the Admin link (2026-11-12, iPhone Safari).
  try {
    await refreshSession();
  } catch {
    /* offline or no Identity: the saved copy below decides */
  }
  let saved: Saved | null;
  try {
    saved = JSON.parse(localStorage.getItem(SAVED) ?? "null");
  } catch {
    return;
  }
  const token = saved?.token;
  if (!saved || !token?.refresh_token) return;
  const expiresAt = token.expires_at ?? (token.access_token ? jwtExpiry(token.access_token) : 0);
  // Identity refreshes inside its last minute, so anything with more left is still Identity's to refresh: a trade
  // here would retire the refresh token Identity holds and its next refresh would fail.
  if (token.access_token && expiresAt - Date.now() > 30_000) {
    // Still current: put the cookies back (or keep them) with a life past closing the app.
    writeAuthCookies(token.access_token, token.refresh_token);
    return;
  }
  // The token ran out while the app was closed: trade the refresh token for a new one.
  try {
    const res = await fetch("/.netlify/identity/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refresh_token }).toString(),
    });
    if (!res.ok) return; // signed out elsewhere, or the refresh token expired: a normal sign-in follows
    const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    const refresh = data.refresh_token ?? token.refresh_token;
    saved.token = {
      ...token,
      access_token: data.access_token,
      refresh_token: refresh,
      expires_in: data.expires_in,
      expires_at: jwtExpiry(data.access_token) || Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    localStorage.setItem(SAVED, JSON.stringify(saved));
    writeAuthCookies(data.access_token, refresh);
  } catch {
    /* offline: Identity decides, and the coach's local plays still open */
  }
}

export type LinkKind = "recovery" | "confirmation" | "invite" | "email_change";

/** Which emailed link the address carries, read before Identity handles (and clears) it. */
function linkInHash(): LinkKind | null {
  const h = window.location.hash;
  if (h.includes("recovery_token=")) return "recovery";
  if (h.includes("confirmation_token=")) return "confirmation";
  if (h.includes("invite_token=")) return "invite";
  if (h.includes("email_change_token=")) return "email_change";
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [available, setAvailable] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [linkFailed, setLinkFailed] = useState<LinkKind | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const link = linkInHash();
      try {
        const callback = await handleAuthCallback();
        if (callback?.user && alive) setAccount(toAccount(callback.user));
        // Back from Google or an email confirmation link: that's a sign-in for the owner's audit.
        if (callback?.user && callback.type !== "recovery") void api.reportSignIn().catch(() => undefined);
        if (callback?.type === "recovery" && alive) setRecovering(true);
        if (!callback) await restoreSession();
        const user = await getUser();
        if (alive && user) setAccount(toAccount(user));
      } catch (error) {
        if (error instanceof MissingIdentityError && alive) setAvailable(false);
        // An emailed link Identity refused: say so instead of landing on the page as if nothing happened.
        else if (link && alive) {
          setLinkFailed(link);
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } finally {
        if (alive) setStatus("ready");
      }
    })();
    // Back from the background (a phone app switch can pause the token timer): refresh if it ran out.
    const onVisible = () => document.visibilityState === "visible" && void restoreSession();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const user = await identityLogin(email, password);
    await restoreSession(); // gives the new session's cookies a life past closing the browser
    setAccount(toAccount(user));
    void api.reportSignIn().catch(() => undefined);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const user = await identitySignup(email, password, { full_name: name });
    // Identity only stamps confirmedAt once the email is verified. Until then
    // there is no session to hold on to, so we hand the coach a next step.
    if (user.confirmedAt) {
      setAccount(toAccount(user));
      return "Account created. Your playbook is ready.";
    }
    return "Check your inbox and confirm your email to finish signing up.";
  }, []);

  const renew = useCallback(async () => {
    await restoreSession();
    try {
      const user = await getUser();
      if (user) return true;
    } catch {
      /* fall through: no sign-in to keep */
    }
    setAccount(null);
    return false;
  }, []);

  const signOut = useCallback(async () => {
    await identityLogout();
    setAccount(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      account,
      status,
      available,
      signIn,
      signUp,
      signOut,
      startOAuth: (provider) => oauthLogin(provider),
      sendReset: async (email: string) => {
        await requestPasswordRecovery(email);
      },
      recovering,
      linkFailed,
      renew,
      setNewPassword: async (password: string) => {
        await updateUser({ password });
        setRecovering(false);
      },
    }),
    [account, status, available, signIn, signUp, signOut, recovering, linkFailed, renew],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Turn an Identity failure into language a coach can act on. */
/**
 * In the browser @netlify/identity wraps gotrue-js's error and drops its HTTP
 * status (it stays on `cause`), so read it from either place.
 */
const statusOf = (error: AuthError): number | undefined =>
  error.status ?? (error.cause as { status?: number } | undefined)?.status;

export function authMessage(error: unknown): string {
  if (error instanceof MissingIdentityError)
    return "Accounts are not switched on for this site yet. Your work stays saved in this browser.";
  if (error instanceof AuthError) {
    const status = statusOf(error);
    // Identity answers a failed sign-in with 400 and says why in the message.
    if (status === 400 && /confirm/i.test(error.message))
      return "Confirm your email first — open the link we sent you, then sign in.";
    if (status === 422 && /already|registered|exists/i.test(error.message))
      return "That email already has an account. Sign in instead, or reset your password.";
    switch (status) {
      case 400:
      case 401:
        return "That email and password do not match. Try again or reset your password.";
      case 403:
        return "New signups are closed right now. Ask the site owner for an invite.";
      case 422:
        return "Check the email format and use a password of at least 8 characters.";
      case 404:
        return "No account uses that email yet. Create one to get started.";
      case 429:
        return "Too many tries. Wait a minute, then sign in again.";
      default:
        return "Sign-in failed. Check your email and password, then try again.";
    }
  }
  return "We could not reach the sign-in service. Check your connection and try again.";
}

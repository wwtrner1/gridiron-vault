import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthError,
  MissingIdentityError,
  getUser,
  handleAuthCallback,
  login as identityLogin,
  logout as identityLogout,
  oauthLogin,
  requestPasswordRecovery,
  signup as identitySignup,
} from "@netlify/identity";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const callback = await handleAuthCallback();
        if (callback?.user && alive) setAccount(toAccount(callback.user));
        const user = await getUser();
        if (alive && user) setAccount(toAccount(user));
      } catch (error) {
        if (error instanceof MissingIdentityError && alive) setAvailable(false);
      } finally {
        if (alive) setStatus("ready");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const user = await identityLogin(email, password);
    setAccount(toAccount(user));
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
    }),
    [account, status, available, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Turn an Identity failure into language a coach can act on. */
export function authMessage(error: unknown): string {
  if (error instanceof MissingIdentityError)
    return "Accounts are not switched on for this site yet. Your work stays saved in this browser.";
  if (error instanceof AuthError) {
    // Identity answers a failed sign-in with 400 and says why in the message.
    if (error.status === 400 && /confirm/i.test(error.message))
      return "Confirm your email first — open the link we sent you, then sign in.";
    switch (error.status) {
      case 400:
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

import { useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "./Modal";
import { authMessage, useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

const LINK_WORDS = {
  recovery: { what: "password-reset link", next: "Ask for a new one from the sign-in page and open it within the hour." },
  confirmation: { what: "confirmation link", next: "Sign in and we'll send you a fresh one." },
  invite: { what: "invite link", next: "Ask the person who invited you to send it again." },
  email_change: { what: "email-change link", next: "Sign in and change the address again to get a fresh one." },
};

/** An emailed link Identity refused (expired, already used, or not for this site): say so and point the way. */
function LinkFailed({ kind, onClose }: { kind: keyof typeof LINK_WORDS; onClose: () => void }) {
  const words = LINK_WORDS[kind];
  return (
    <Modal title="That link didn't work" onClose={onClose}>
      <p>
        The {words.what} you opened has expired or was already used. {words.next}
      </p>
      <div className="chip-row">
        <Link to="/signin" className="btn btn-primary" onClick={onClose}>
          Go to sign in
        </Link>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Not now
        </button>
      </div>
    </Modal>
  );
}

/** After a password-reset link: the coach is signed in, and chooses the new password here. */
export function NewPassword() {
  const { recovering, linkFailed, setNewPassword } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [later, setLater] = useState(false);
  if (linkFailed && !later) return <LinkFailed kind={linkFailed} onClose={() => setLater(true)} />;
  if (!recovering || later) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    setError("");
    try {
      await setNewPassword(password);
      toast("New password saved. Use it next time you sign in.");
    } catch (err) {
      setError(authMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Choose a new password" onClose={() => setLater(true)}>
      <form onSubmit={save} noValidate>
        <p>You opened a password-reset link. Pick the password you'll use from now on.</p>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </label>
        {error && (
          <p className="error-line" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </Modal>
  );
}

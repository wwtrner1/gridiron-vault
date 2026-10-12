import { useState } from "react";
import { Modal } from "./Modal";
import { authMessage, useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

/** After a password-reset link: the coach is signed in, and chooses the new password here. */
export function NewPassword() {
  const { recovering, setNewPassword } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [later, setLater] = useState(false);
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
      <form onSubmit={save}>
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

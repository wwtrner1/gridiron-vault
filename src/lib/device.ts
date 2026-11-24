/**
 * A random id for this browser, sent with every API request so the owner's
 * sign-in audit can tell one device from another (the server stores only a
 * hash of it). Clearing site data makes this browser a new device. Nothing
 * is asked of the coach for a new device: there is no device code.
 */
const KEY = "grid1ronvault.device.v1";
let memory = "";

export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked: this tab still gets a stable id until it closes.
    memory ||= crypto.randomUUID();
    return memory;
  }
}

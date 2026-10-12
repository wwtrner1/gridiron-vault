/**
 * A random id for this browser, sent with every API request so the server
 * can tell a coach's own devices from a shared login (the server stores
 * only a hash of it). Clearing site data makes this browser a new device.
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

/** A plain name for the device list, like "Chrome on Windows". */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "this device";
  return `${browser} on ${os}`;
}

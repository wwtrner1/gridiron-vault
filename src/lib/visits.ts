import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { deviceId } from "./device";

/**
 * The visitor counter (see "What we collect" on the Privacy page). One random
 * id per browser tab, how long the page was in view, and the page names. No
 * cookie, no IP address stored, and nothing is sent when the browser says Do
 * Not Track or Global Privacy Control. Signed in or not, the same.
 */
const BEAT_MS = 30_000;
const SID_KEY = "grid1ronvault.visit.v1";

const optedOut = () => {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true;
};

function sessionId() {
  try {
    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = crypto.randomUUID().replace(/-/g, "");
      sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return "";
  }
}

function send(body: Record<string, unknown>) {
  try {
    navigator.sendBeacon("/api/visit", JSON.stringify(body));
  } catch {
    /* offline: a missed beacon is fine */
  }
}

export function useVisitCounter() {
  const { pathname } = useLocation();

  // Every page the visitor opens (the first one starts the visit).
  useEffect(() => {
    if (optedOut() || pathname.startsWith("/admin")) return;
    const sid = sessionId();
    if (!sid) return;
    send({ sid, did: deviceId(), path: pathname, ref: document.referrer, hit: 1 });
  }, [pathname]);

  // Time on site: seconds the page was actually in view, sent every 30 s and when the tab is hidden or closed.
  useEffect(() => {
    if (optedOut() || typeof document === "undefined") return;
    const sid = sessionId();
    if (!sid) return;
    let since = document.visibilityState === "visible" ? Date.now() : 0;
    const flush = () => {
      if (!since) return;
      const secs = Math.round((Date.now() - since) / 1000);
      since = Date.now();
      if (secs > 0) send({ sid, did: deviceId(), secs });
    };
    const timer = window.setInterval(flush, BEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
        since = 0;
      } else since = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);
}

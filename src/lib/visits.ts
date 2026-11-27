import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { deviceId } from "./device";

/**
 * The visitor counter (see "What we collect" on the Privacy page). One random
 * id per browser tab, a random id per page opened, how long each page was in
 * view, the page names, the link's campaign tag and whether this browser has
 * been here before. No cookie, no IP address stored, and nothing is sent when
 * the browser says Do Not Track or Global Privacy Control. Signed in or not,
 * the same.
 */
const BEAT_MS = 30_000;
const SID_KEY = "grid1ronvault.visit.v1";
/** Set on a browser's first visit; only its presence is sent ("been here before"), never its value. */
const SEEN_KEY = "grid1ronvault.seen.v1";

const optedOut = () => {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true;
};

const newId = () => crypto.randomUUID().replace(/-/g, "");

function sessionId() {
  try {
    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = newId();
      sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return "";
  }
}

/** Whether this browser visited before this tab's visit began. Read once per tab, then marked. */
let returningFlag: boolean | null = null;
function returning() {
  if (returningFlag !== null) return returningFlag;
  try {
    returningFlag = localStorage.getItem(SEEN_KEY) !== null;
    if (!returningFlag) localStorage.setItem(SEEN_KEY, "1");
  } catch {
    returningFlag = false;
  }
  return returningFlag;
}

/** The campaign tag on the link that opened the site: ?utm_source=, else ?ref=. */
export function campaignOf(search: string) {
  try {
    const q = new URLSearchParams(search);
    const source = q.get("utm_source") || q.get("ref") || "";
    const name = q.get("utm_campaign") || "";
    return (name && source ? `${source} / ${name}` : source).slice(0, 80);
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

/** The page in view now and when it last came into view; time is credited to that page when it leaves. */
const view = { pv: "", since: 0 };

function flush() {
  if (!view.since || !view.pv) return;
  const secs = Math.round((Date.now() - view.since) / 1000);
  view.since = Date.now();
  const sid = sessionId();
  if (secs > 0 && sid) send({ sid, did: deviceId(), pv: view.pv, secs });
}

export function useVisitCounter() {
  const { pathname, search } = useLocation();

  // Every page the visitor opens (the first one starts the visit). The time on the page before it goes to that page.
  useEffect(() => {
    if (optedOut()) return;
    flush();
    if (pathname.startsWith("/admin")) {
      view.pv = "";
      view.since = 0;
      return;
    }
    const sid = sessionId();
    if (!sid) return;
    view.pv = newId();
    view.since = typeof document !== "undefined" && document.visibilityState === "visible" ? Date.now() : 0;
    send({ sid, did: deviceId(), pv: view.pv, path: pathname, ref: document.referrer, utm: campaignOf(search), back: returning(), hit: 1 });
    // The search string is read only with a new page: a filter changing in the address isn't a page view.
  }, [pathname]);

  // Time on site: seconds the page was actually in view, sent every 30 s and when the tab is hidden or closed.
  useEffect(() => {
    if (optedOut() || typeof document === "undefined") return;
    const timer = window.setInterval(flush, BEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
        view.since = 0;
      } else if (view.pv) view.since = Date.now();
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

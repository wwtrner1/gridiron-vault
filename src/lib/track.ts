/**
 * Three events, on purpose.
 *
 * play_created, call_sheet_opened and play_exported are the only signals that
 * tell us whether a coach got value. Everything else is noise we would end up
 * building dashboards for instead of features.
 */
export type EventName = "play_created" | "call_sheet_opened" | "play_exported";

type Payload = Record<string, string | number | boolean | null | undefined>;

const KEY = "nextplay.events.v1";

export function track(name: EventName, payload: Payload = {}) {
  const row = { name, at: new Date().toISOString(), ...payload };
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    list.push(row);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-400)));
  } catch {
    /* no storage — the event is dropped, which is fine */
  }
  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    try {
      navigator.sendBeacon("/api/events", JSON.stringify(row));
    } catch {
      /* offline on the sideline — events are not worth a retry queue */
    }
  }
}

/** Local read-out used on the account page so a coach sees their own usage. */
export function readEvents(): { name: string; at: string }[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { name: string; at: string }[]) : [];
  } catch {
    return [];
  }
}

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { applyPatch, diffScene, isEmptyPatch, LIVE_LIMITS, sameScene, type LivePatch } from "./live";
import type { Scene } from "./types";

export type LiveState = "connecting" | "live" | "offline" | "blocked";

/**
 * Keeps one Designer scene in step with a live play. One loop, never two
 * requests at once: send what this coach changed, or else ask whether the
 * server has moved on. Whatever comes back is laid under the coach's own
 * newer edits (`applyPatch(server, diff(synced, now))`), so a drag in progress
 * is never overwritten, and the loop waits while a pointer is down.
 */
export function useLivePlay(liveId: string | null, getScene: () => Scene, apply: (scene: Scene, name: string, others?: LivePatch) => void) {
  const [state, setState] = useState<LiveState>("connecting");
  const [problem, setProblem] = useState("");
  const [here, setHere] = useState<string[]>([]);
  const getRef = useRef(getScene);
  const applyRef = useRef(apply);
  getRef.current = getScene;
  applyRef.current = apply;

  useEffect(() => {
    if (!liveId) return;
    let stopped = false;
    let timer = 0;
    let synced: Scene | null = null;
    let rev = -1;
    let down = false;
    const press = () => (down = true);
    const release = () => (down = false);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    setState("connecting");

    /** Show `next` unless the coach already sees it. */
    const show = (next: Scene, name = "", others?: LivePatch) => {
      if (!sameScene(next, getRef.current())) applyRef.current(next, name, others);
    };

    const tick = async () => {
      let wait = document.hidden ? LIVE_LIMITS.pollHidden : LIVE_LIMITS.poll;
      try {
        if (down) {
          wait = 250;
        } else if (!synced) {
          const first = await api.openLive(liveId);
          if (first.scene) {
            synced = first.scene;
            rev = first.rev;
            applyRef.current(first.scene, first.name ?? "");
            setHere(first.here);
          }
        } else {
          const mine = getRef.current();
          const patch = diffScene(synced, mine);
          if (!isEmptyPatch(patch)) {
            const res = await api.pushLive(liveId, patch);
            const others = diffScene(applyPatch(synced, patch), res.scene);
            synced = res.scene;
            rev = res.rev;
            setHere(res.here);
            // Edits made while that request was out ride on top of the server's copy.
            show(applyPatch(res.scene, diffScene(mine, getRef.current())), "", others);
          } else {
            const res = await api.openLive(liveId, rev);
            setHere(res.here);
            if (!res.same && res.scene) {
              const others = diffScene(synced, res.scene);
              synced = res.scene;
              rev = res.rev;
              show(applyPatch(res.scene, diffScene(mine, getRef.current())), "", others);
            }
          }
        }
        if (!stopped) {
          setState("live");
          setProblem("");
        }
      } catch (e) {
        const message = (e as Error).message;
        if (!stopped) {
          const blocked = /Staff plan|isn't one you can open/.test(message);
          setState(blocked ? "blocked" : "offline");
          setProblem(message);
          if (blocked) return;
          wait = 5000;
        }
      }
      if (!stopped) timer = window.setTimeout(tick, wait);
    };
    void tick();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
  }, [liveId]);

  return { state, problem, here };
}

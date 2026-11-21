import { useEffect, useMemo, useState } from "react";
import { brandStore, hasBrand, inkOn, useBrand } from "./brand";
import type { FilmView } from "./brandData";
import { canDraw3d } from "./film3d";
import { buildLesson, canTeach, defaultLook, teachLooks } from "./teach";
import type { TeachLook } from "./teach";
import type { Scene } from "./types";

/*
 * What the Film Room, the Designer's Preview and its 3D look share: the dark or
 * light look, the Flat or 3D pick (kept with the team brand on the account)
 * and the lesson a play is drawn from.
 */

/** Dark, light, or whatever the device is set to. */
export function useLook(look: TeachLook): "dark" | "light" {
  const [deviceDark, setDeviceDark] = useState(() => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true));
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDeviceDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return look === "device" ? (deviceDark ? "dark" : "light") : look;
}

/** Whether the screen matches a media query, kept in step as it turns or resizes. */
export function useMedia(query: string): boolean {
  const [hit, setHit] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(query);
    const on = () => setHit(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return hit;
}

/**
 * Flat or 3D. A coach's pick is kept with the team brand on the account, so it
 * follows him to every device; anyone else's lasts the visit. Flat is the
 * default, and a browser that can't draw WebGL stays flat (`noGl` says so).
 */
export function useFilmView(coach: boolean) {
  const brand = useBrand();
  const [viewPick, setViewPick] = useState<FilmView | undefined>();
  const [noGl, setNoGl] = useState(false);
  const wants3d = (viewPick ?? (coach ? brand.filmView : undefined) ?? "flat") === "3d";
  const pickView = (v: FilmView) => {
    if (v === "3d" && !canDraw3d()) {
      setNoGl(true);
      return;
    }
    setNoGl(false);
    setViewPick(v);
    if (coach && (brand.filmView ?? "flat") !== v) {
      try {
        brandStore.set({ filmView: v === "3d" ? "3d" : undefined });
      } catch {
        /* storage full: the pick lasts this visit */
      }
    }
  };
  return { in3d: wants3d && !noGl, noGl, pickView, fail: () => setNoGl(true) };
}

/**
 * The lesson the Designer draws a play from outside the Film Room (Preview, the
 * 3D look, Make a video): against the defense the play's lesson is set to, else
 * the one it beats best, in the coach's usual look and team colors.
 */
export function usePlayLesson(scene: Scene, name: string, rushYards: number) {
  const brand = useBrand();
  const teachable = canTeach(scene);
  const look = useMemo(() => teachLooks(scene).find((l) => l.id === scene.teach?.against) ?? defaultLook(scene, { rushYards }), [scene, rushYards]);
  const lesson = useMemo(() => buildLesson(scene, name, look, "", { rushYards }), [scene, name, look, rushYards]);
  const dark = useLook(scene.teach?.look ?? brand.filmLook ?? "dark") === "dark";
  const teamOn = hasBrand(brand) && scene.teach?.team !== false;
  return {
    teachable,
    look,
    lesson,
    dark,
    who: lesson.letters[0] ?? "",
    logo: teamOn ? (brand.logo ?? undefined) : undefined,
    colors: teamOn ? { primary: brand.primary, secondary: brand.secondary } : undefined,
    team: teamOn ? { name: brand.name, logo: brand.logo ?? undefined, primary: brand.primary, secondary: brand.secondary, ink: inkOn(brand.primary) } : undefined,
  };
}

import { useEffect, useMemo, useState } from "react";
import { brandStore, hasBrand, inkOn, useBrand } from "./brand";
import type { FilmView } from "./brandData";
import { DEFAULT_CAMERA, canDraw3d, followsPlayer } from "./film3d";
import type { CameraPick, FilmCamera } from "./film3d";
import { buildLesson, canTeach, defaultLook, teachLooks } from "./teach";
import type { Lesson, TeachLook } from "./teach";
import type { PlayerNode, Scene } from "./types";

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

/** What a screen needs to offer the 3D cameras: the pick, a way to change it, and the player a camera rides with. */
export type FilmCameraState = {
  pick: CameraPick;
  set: (patch: Partial<CameraPick>) => void;
  /** The player Follow a player and Player's eyes ride with (for the visit); none picks the quarterback or the first read. */
  follow: string | undefined;
  setFollow: (id: string | undefined) => void;
  /** A tap on a player in the picture: ride with him, from inside his helmet unless a following camera is already up. */
  tap: (id: string) => void;
};

/**
 * The 3D camera. A coach's pick is kept with the team brand on the account, so
 * the Film Room, Preview and the Designer's 3D field open the same way on every
 * device; anyone else's lasts the visit. `first` is the camera a screen starts
 * on before anything is picked.
 */
export function useFilmCamera(coach: boolean, first: FilmCamera = "auto"): FilmCameraState {
  const brand = useBrand();
  const [mine, setMine] = useState<CameraPick | undefined>();
  const [follow, setFollow] = useState<string | undefined>();
  const pick = mine ?? (coach ? brand.filmCam : undefined) ?? { ...DEFAULT_CAMERA, camera: first };
  const set = (patch: Partial<CameraPick>) => {
    const next = { ...pick, ...patch };
    if (!coach) return setMine(next);
    // A coach's pick lives with the brand, which every screen reads, so two screens open at once never hold different picks.
    try {
      brandStore.set({ filmCam: next });
      setMine(undefined);
    } catch {
      /* storage full: the pick lasts this visit */
      setMine(next);
    }
  };
  const tap = (id: string) => {
    setFollow(id);
    if (!followsPlayer(pick.camera)) set({ camera: "eyes" });
  };
  return { pick, set, follow, setFollow, tap };
}

/** The players a camera can ride with, by the id the 3D field knows them by: the offense by letter, then the look's defenders. */
export function cameraPlayers(scene: Scene, lesson: Lesson): { id: string; name: string }[] {
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side !== "defense");
  const letterOf = (n: PlayerNode) => n.label.trim().toUpperCase() || "?";
  const count = new Map<string, number>();
  // Two players wearing one letter (or none) are told apart by a number.
  const offense = players.map((n) => {
    const letter = letterOf(n);
    const k = (count.get(letter) ?? 0) + 1;
    count.set(letter, k);
    return { id: n.id, name: players.filter((o) => letterOf(o) === letter).length > 1 ? `${letter} ${k}` : letter };
  });
  const seen = new Map<string, number>();
  const defense = lesson.result.defenders.map((d, i) => {
    const n = (seen.get(d.label) ?? 0) + 1;
    seen.set(d.label, n);
    const twice = lesson.result.defenders.filter((o) => o.label === d.label).length > 1;
    return { id: `d${i}`, name: `${d.label}${twice ? ` ${n}` : ""} (defense)` };
  });
  return [...offense, ...defense];
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

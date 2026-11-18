import { linesOf } from "./assignments";
import { FILM_LOOKS } from "./brandData";
import type { FilmLook } from "./brandData";
import { explainPlay } from "./explain";
import { LOOKS, formatOf, simulate, wins, yardScale, yards } from "./coverage";
import type { Look, Result, SimDefender, SimOptions } from "./coverage";
import { CANVAS_W } from "./types";
import type { PathNode, PlayerNode, Scene } from "./types";
import { cleanClip } from "./voice";
import type { VoiceClip } from "./voice";

/**
 * Film Room: a coach's own play turned into a short lesson. The steps, the
 * captions and every number come from the drawing and the Coverage check, so
 * the coach writes nothing. Pure: the player (`components/FilmRoom.tsx`) only
 * draws what this returns.
 */

export const TEACH_LOOKS = FILM_LOOKS;
export type TeachLook = FilmLook;
export const TEACH_LOOK_NAME: Record<TeachLook, string> = { dark: "Dark", light: "Light", device: "Match my device" };

/** A play's Film Room settings, saved in the play (`scene.teach`) so they follow it to every device. */
export type TeachSettings = {
  /** The coach's usual look (`TeamBrand.filmLook`, on the account) when unset, else dark. */
  look?: TeachLook;
  /** The defense the lesson runs against (a Coverage check look id). The play's best look when unset. */
  against?: string;
  /** Team colors and logo on the lesson. On when unset. */
  team?: boolean;
  /** The coach's own voice, one clip per step (`lib/voice.ts`; the bytes are on the account). */
  voice?: Partial<Record<StepId, VoiceClip>>;
};

export const STEP_IDS = ["look", "zones", "call", "snap", "read", "job"] as const;

/** Keeps only what a lesson can use; undefined when nothing is set. */
export function cleanTeach(raw: unknown): TeachSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: TeachSettings = {};
  if (typeof r.look === "string" && (TEACH_LOOKS as readonly string[]).includes(r.look)) out.look = r.look as TeachLook;
  if (typeof r.against === "string" && r.against.length <= 60) out.against = r.against;
  if (typeof r.team === "boolean") out.team = r.team;
  if (r.voice && typeof r.voice === "object") {
    const voice: Partial<Record<StepId, VoiceClip>> = {};
    for (const id of STEP_IDS) {
      const clip = cleanClip((r.voice as Record<string, unknown>)[id]);
      if (clip) voice[id] = clip;
    }
    if (Object.keys(voice).length) out.voice = voice;
  }
  return Object.keys(out).length ? out : undefined;
}

export type StepId = (typeof STEP_IDS)[number];

export type TeachStep = {
  id: StepId;
  title: string;
  /** One idea, about a dozen words. The words inside {braces} are the key words. */
  caption: string;
  /** Seconds the picture holds still before it moves. */
  hold: number;
  /** The play's clock over the step, in seconds after the snap. `from === to` is a still. */
  from: number;
  to: number;
  /** Play speed while it moves (0.5 is half speed). */
  rate: number;
  /** The coach's voice over this step, when one is recorded. The step waits for it to finish. */
  voice?: VoiceClip;
};

/** A beat of quiet after the coach stops talking, before the next step. */
export const VOICE_TAIL = 0.5;

/** Puts the coach's clips on their steps, and holds each picture long enough for the words to finish. */
export function withVoice(steps: TeachStep[], voice: TeachSettings["voice"]): TeachStep[] {
  if (!voice) return steps;
  return steps.map((s) => {
    const clip = voice[s.id];
    if (!clip) return s;
    const short = clip.ms / 1000 + VOICE_TAIL - stepLength(s);
    return { ...s, voice: clip, hold: short > 0 ? s.hold + short : s.hold };
  });
}

/** One defender's job in a coach's words. */
export type DefJob = { label: string; job: string; kind: SimDefender["job"]; deep: boolean };

export type Lesson = {
  look: Look;
  result: Result;
  steps: TeachStep[];
  jobs: DefJob[];
  counts: { deep: number; under: number; man: number; rush: number };
  /** Offensive letters a player can pick for "Your job", quarterback first. */
  letters: string[];
};

const BALL_FLIGHT = 0.5;
/** How long the play runs on after the throw, so the catch is seen. */
export const AFTER_THROW = BALL_FLIGHT + 0.9;

/** How long a step is on screen, in seconds. */
export const stepLength = (s: TeachStep) => s.hold + (s.to - s.from) / s.rate;
/** The play's clock `u` seconds into a step. */
export const clockAt = (s: TeachStep, u: number) => (u <= s.hold ? s.from : Math.min(s.to, s.from + (u - s.hold) * s.rate));

/** A caption without its key-word marks, for screen readers and copying. */
export const plainCaption = (c: string) => c.replace(/[{}]/g, "");
/** A caption as pieces: `key` pieces are drawn in the highlight color. */
export function captionParts(c: string): { text: string; key: boolean }[] {
  const out: { text: string; key: boolean }[] = [];
  for (const piece of c.split(/(\{[^}]*\})/)) {
    if (!piece) continue;
    const key = piece.startsWith("{") && piece.endsWith("}");
    out.push({ text: key ? piece.slice(1, -1) : piece, key });
  }
  return out;
}

const offensePlayers = (scene: Scene) =>
  scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf && n.side === "offense" && !!n.label.trim());

/** The defenses a lesson can run against, for the play's game (5-on-5, 7-on-7, 11-man). */
export const teachLooks = (scene: Scene): Look[] => LOOKS[formatOf(scene)];

/** The look to teach against when the coach hasn't picked: the one the play beats best. */
export function defaultLook(scene: Scene, opts: SimOptions = {}): Look {
  const looks = teachLooks(scene);
  let best = looks[0];
  let score = -1;
  for (const l of looks) {
    const r = simulate(scene, l, { ...opts, extra: 0 });
    const s = r.score + (wins(r) ? 100 : 0);
    if (s > score) (score = s), (best = l);
  }
  return best;
}

/** Names each defender's job: deep thirds, hook, flat, man on a letter, rush. */
export function defenderJobs(scene: Scene, result: Result): DefJob[] {
  const scale = yardScale(scene.view);
  const labelOf = new Map(offensePlayers(scene).map((p) => [p.id, p.label.trim().toUpperCase()]));
  const zones = result.defenders.filter((d) => d.job === "zone");
  const deepCount = zones.filter((d) => d.deep).length;
  const deepName = deepCount === 1 ? "Deep middle" : deepCount === 2 ? "Deep half" : deepCount === 4 ? "Deep quarter" : "Deep third";
  const mid = zones.length ? zones.reduce((a, d) => a + (d.landmark?.x ?? d.start.x), 0) / zones.length : CANVAS_W / 2;
  return result.defenders.map((d) => {
    if (d.job === "rush") return { label: d.label, job: "Rush", kind: d.job, deep: false };
    if (d.job === "man") return { label: d.label, job: d.manOf && labelOf.get(d.manOf) ? `Man on ${labelOf.get(d.manOf)}` : "Man", kind: d.job, deep: false };
    if (d.deep) return { label: d.label, job: deepName, kind: d.job, deep: true };
    const across = Math.abs(((d.landmark?.x ?? d.start.x) - mid) / scale.x);
    return { label: d.label, job: across >= 11 ? "Flat" : across < 3 ? "Middle hook" : "Hook to curl", kind: d.job, deep: false };
  });
}

/** "Y runs 10 yards, then breaks…" said to the player: "Y, you run 10 yards, then break…". */
function toYou(letter: string, sentence: string): string {
  const rest = sentence.slice(letter.length).trim();
  const you = rest
    .replace(/^runs\b/, "run")
    .replace(/^blocks\b/, "block")
    .replace(/^goes\b/, "go")
    .replace(/^breaks\b/, "break")
    .replace(/^takes\b/, "take")
    .replace(/\bthen breaks\b/, "then break")
    .replace(/\band looks\b/, "and look");
  return `${letter}, you ${you}`;
}

/** What one letter does on this play, said to that player. */
export function jobFor(scene: Scene, letter: string): string {
  const want = letter.trim().toUpperCase();
  const line = explainPlay(scene)
    .split("\n")
    .find((l) => l.startsWith(`${want} `));
  if (line) return toYou(want, line);
  const who = offensePlayers(scene).find((p) => p.label.trim().toUpperCase() === want);
  if (who?.job?.trim()) return `${want}, your job: ${who.job.trim()}.`;
  return `${want}, you hold your spot and sell the play.`;
}

/** The lines that belong to a letter, for the spotlight in "Your job". */
export function linesFor(scene: Scene, letter: string): PathNode[] {
  const who = offensePlayers(scene).find((p) => p.label.trim().toUpperCase() === letter.trim().toUpperCase());
  return who ? linesOf(scene, who) : [];
}

/** True when there is an offense to teach. */
export const canTeach = (scene: Scene) => offensePlayers(scene).length > 0;

/**
 * The whole lesson for a play against one look: The look, Zones, The call,
 * Snap, The read (a freeze, then half speed) and Your job.
 */
export function buildLesson(scene: Scene, name: string, look: Look, letter: string, opts: SimOptions = {}): Lesson {
  const result = simulate(scene, look, { ...opts, extra: AFTER_THROW });
  const jobs = defenderJobs(scene, result);
  const counts = {
    deep: jobs.filter((j) => j.deep).length,
    under: jobs.filter((j) => j.kind === "zone" && !j.deep).length,
    man: jobs.filter((j) => j.kind === "man").length,
    rush: jobs.filter((j) => j.kind === "rush").length,
  };
  const players = offensePlayers(scene);
  const letters = [...new Set(players.map((p) => p.label.trim().toUpperCase()))].sort((a, b) => (a === "Q" ? -1 : b === "Q" ? 1 : 0));
  const title = name.trim() || "This play";
  const rows = result.rows;
  const at = result.throwAt.toFixed(1);

  const parts: string[] = [];
  if (counts.deep) parts.push(`{${counts.deep} deep}`);
  if (counts.under) parts.push(`${counts.under} underneath`);
  if (counts.man) parts.push(`${counts.man} in man`);
  if (counts.rush) parts.push(`${counts.rush} rushing`);
  const zonesCaption = counts.deep || counts.under ? `Count the defense: ${parts.join(", ")}.` : `No zones here. {Man coverage}: every receiver has a defender on him.`;

  const call = rows.length
    ? `The call: ${rows
        .slice(0, 4)
        .map((r, i) => (i === 0 ? `{${r.label} ${r.route}}` : `${r.label} ${r.route}`))
        .join(", ")}.`
    : "The call: everybody knows his job before the snap.";

  const t = result.target;
  const sack = result.sackAt !== null ? ` The rush gets home at ${result.sackAt.toFixed(1)} seconds, so get it out.` : "";
  const read = !t
    ? ""
    : t.status === "open"
      ? `Read ${t.read}: {${t.label} on the ${t.route}} is open by ${yards(t.sep)} yards. Throw it.${sack}`
      : `Nobody is clean. Best look is {${t.label}}, ${t.status}. Check it down or throw it away.${sack}`;

  const end = result.duration;
  const steps: TeachStep[] = [
    { id: "look", title: "The look", caption: `${title}. Line up and find the defense: {${look.name}}.`, hold: 3.6, from: 0, to: 0, rate: 1 },
    { id: "zones", title: counts.deep || counts.under ? "Zones" : "Coverage", caption: zonesCaption, hold: 4.2, from: 0, to: 0, rate: 1 },
    { id: "call", title: "The call", caption: call, hold: 4.4, from: 0, to: 0, rate: 1 },
    {
      id: "snap",
      title: "Snap",
      caption: rows.length ? `On the snap, eyes on {${rows[0].label}}. The ball is due out at ${at} seconds.` : "On the snap, everybody goes.",
      hold: 1.2,
      from: 0,
      to: result.throwAt,
      rate: 1,
    },
  ];
  if (t) steps.push({ id: "read", title: "The read", caption: read, hold: 3.4, from: result.throwAt, to: end, rate: 0.5 });
  if (letters.length) {
    const who = letters.includes(letter.trim().toUpperCase()) ? letter.trim().toUpperCase() : letters[0];
    steps.push({ id: "job", title: "Your job", caption: jobFor(scene, who).replace(`${who},`, `{${who}},`), hold: 1.6, from: 0, to: end, rate: 1 });
  }
  return { look, result, steps: withVoice(steps, cleanTeach(scene.teach)?.voice), jobs, counts, letters };
}

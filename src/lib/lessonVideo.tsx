import { voiceUrl } from "./voice";
import { renderToStaticMarkup } from "react-dom/server";
import { LESSON_FPS, LessonField } from "../components/LessonField";
import { captionParts, clockAt, stepLength } from "./teach";
import type { Lesson } from "./teach";
import type { Scene } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";

/**
 * A Film Room lesson as a video file. Every frame is the same picture the
 * Film Room shows (`LessonField`), with the title, the step list and the
 * caption drawn round it, encoded in the coach's own browser. Nothing is
 * uploaded.
 */

export type VideoShape = "wide" | "tall";
export const VIDEO_SHAPES: Record<VideoShape, { w: number; h: number; name: string; hint: string; tag: string }> = {
  wide: { w: 1280, h: 720, name: "Wide (16:9)", hint: "For the meeting room, a TV or a laptop.", tag: "16x9" },
  tall: { w: 720, h: 1280, name: "Tall (9:16)", hint: "For phones, team chats and social.", tag: "9x16" },
};

export const VIDEO_FPS = 24;

/** True when this browser can encode video itself (Chrome, Edge, Safari 16.4+, Firefox 130+). */
export const canMakeVideo = () => typeof VideoEncoder === "function" && typeof VideoFrame === "function";

/** An error whose words are written for the coach. */
export class VideoError extends Error {
  readonly coach = true;
}

export type VideoJob = {
  scene: Scene;
  lesson: Lesson;
  name: string;
  /** The letter "Your job" teaches. */
  who: string;
  dark: boolean;
  shape: VideoShape;
  /** Team name, logo and colors, when the coach has them switched on. */
  team?: { name: string; logo?: string; primary: string; secondary: string; ink: string };
  onProgress?: (done: number) => void;
  /** Called once when the lesson has the coach's voice: whether it went into the file. */
  onVoice?: (state: "in" | "left-out") => void;
  signal?: AbortSignal;
};

const VOICE_RATE = 48_000;

/** The coach's clips laid on the lesson's clock as one mono track, or null when no clip could be read. */
async function voiceTrack(lesson: Lesson): Promise<AudioBuffer | null> {
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) return null;
  const total = lesson.steps.reduce((a, s) => a + stepLength(s), 0);
  const ctx = new Offline(1, Math.ceil(total * VOICE_RATE), VOICE_RATE);
  let start = 0;
  let placed = 0;
  for (const s of lesson.steps) {
    if (s.voice) {
      try {
        const res = await fetch(voiceUrl(s.voice.id));
        if (!res.ok) throw new Error("gone");
        const clip = await ctx.decodeAudioData(await res.arrayBuffer());
        const src = ctx.createBufferSource();
        src.buffer = clip;
        src.connect(ctx.destination);
        // Never past its own step, so one clip can't talk over the next.
        src.start(start, 0, stepLength(s));
        placed++;
      } catch {
        /* a clip that is gone or can't be read is left out; the rest still play */
      }
    }
    start += stepLength(s);
  }
  return placed ? await ctx.startRendering() : null;
}

/** AAC plays everywhere; Opus is what a browser without an AAC encoder can still write. */
async function voiceCodec(): Promise<{ codec: string; mux: "aac" | "opus" } | null> {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return null;
  for (const c of [
    { codec: "mp4a.40.2", mux: "aac" as const },
    { codec: "opus", mux: "opus" as const },
  ]) {
    try {
      const ok = await AudioEncoder.isConfigSupported({ codec: c.codec, sampleRate: VOICE_RATE, numberOfChannels: 1, bitrate: 96_000 });
      if (ok.supported) return c;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

const NAVY = "#011628";
const CYAN = "#0ea2be";
const KEY = "#5fd6ea";
const DISPLAY = "'Saira Condensed', 'Arial Narrow', sans-serif";
const BODY = "'Barlow', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/** The lesson's frames in order: which step, and the play's clock in it. */
export function videoFrames(lesson: Lesson): { step: number; t: number; done: number }[] {
  const total = lesson.steps.reduce((a, s) => a + stepLength(s), 0);
  const out: { step: number; t: number; done: number }[] = [];
  let before = 0;
  lesson.steps.forEach((s, i) => {
    const n = Math.max(1, Math.ceil(stepLength(s) * VIDEO_FPS));
    for (let f = 0; f < n; f++) {
      const u = f / VIDEO_FPS;
      out.push({ step: i, t: clockAt(s, u), done: total ? (before + u) / total : 0 });
    }
    before += stepLength(s);
  });
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new VideoError("The play could not be drawn for the video."));
    image.src = src;
  });
}

/** Caption pieces laid out in lines no wider than `max`, keeping which words are key words. */
function wrap(ctx: CanvasRenderingContext2D, caption: string, max: number): { text: string; key: boolean; w: number }[][] {
  const lines: { text: string; key: boolean; w: number }[][] = [[]];
  let x = 0;
  for (const part of captionParts(caption)) {
    for (const word of part.text.split(/(\s+)/)) {
      if (!word) continue;
      const w = ctx.measureText(word).width;
      if (x + w > max && word.trim() && lines[lines.length - 1].length) {
        lines.push([]);
        x = 0;
      }
      if (!word.trim() && x === 0) continue;
      lines[lines.length - 1].push({ text: word, key: part.key, w });
      x += w;
    }
  }
  return lines;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

type Box = { x: number; y: number; w: number; h: number };

/** Where each part sits for a shape. The field keeps the Designer's own proportions. */
function layout(shape: VideoShape): { top: number; field: Box; cap: Box; steps: Box } {
  const { w, h } = VIDEO_SHAPES[shape];
  const ratio = CANVAS_W / CANVAS_H;
  if (shape === "wide") {
    const top = 64;
    const cap = { x: 0, y: h - 112, w, h: 112 };
    const fh = cap.y - top - 24;
    const fw = Math.round(fh * ratio);
    return { top, field: { x: 20, y: top + 12, w: fw, h: fh }, cap, steps: { x: fw + 44, y: top + 24, w: w - fw - 64, h: fh - 24 } };
  }
  const top = 96;
  const fw = w - 24;
  const fh = Math.round(fw / ratio);
  const field = { x: 12, y: top + 14, w: fw, h: fh };
  const cap = { x: 0, y: field.y + fh + 14, w, h: 250 };
  return { top, field, cap, steps: { x: 28, y: cap.y + cap.h + 30, w: w - 56, h: h - cap.y - cap.h - 60 } };
}

/** Encodes the lesson and answers the finished file. */
export async function lessonVideo(job: VideoJob): Promise<Blob> {
  if (!canMakeVideo()) throw new VideoError("This browser can't make video files. Open the play in Chrome, Edge or Safari on a computer and try again.");
  const { lesson, shape, dark, team } = job;
  const { w, h } = VIDEO_SHAPES[shape];
  const tall = shape === "tall";
  const at = layout(shape);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new VideoError("This browser could not start the video picture.");

  // The page's own fonts, so the video reads like the app.
  try {
    await Promise.all([`800 30px ${DISPLAY}`, `700 24px ${BODY}`, `600 14px ${MONO}`].map((f) => document.fonts.load(f)));
  } catch {
    /* a missing font falls back; the video still renders */
  }

  const codecs: { codec: string; mux: "avc" | "vp9" }[] = [
    { codec: "avc1.42E01F", mux: "avc" },
    { codec: "avc1.4D401F", mux: "avc" },
    { codec: "vp09.00.31.08", mux: "vp9" },
  ];
  let pick: (typeof codecs)[number] | null = null;
  for (const c of codecs) {
    try {
      const ok = await VideoEncoder.isConfigSupported({ codec: c.codec, width: w, height: h, bitrate: 3_000_000, framerate: VIDEO_FPS });
      if (ok.supported) {
        pick = c;
        break;
      }
    } catch {
      /* try the next one */
    }
  }
  if (!pick) throw new VideoError("This browser can't encode video. Open the play in Chrome, Edge or Safari on a computer and try again.");

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  // The coach's voice, when the lesson has one and this browser can write sound into the file.
  const spoken = lesson.steps.some((s) => s.voice);
  const sound = spoken ? await voiceCodec() : null;
  const track = sound ? await voiceTrack(lesson) : null;
  if (spoken) job.onVoice?.(sound && track ? "in" : "left-out");
  const muxer = new Muxer({
    target,
    video: { codec: pick.mux, width: w, height: h, frameRate: VIDEO_FPS },
    ...(sound && track ? { audio: { codec: sound.mux, numberOfChannels: 1, sampleRate: VOICE_RATE } } : {}),
    fastStart: "in-memory",
  });
  let failed: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failed = e;
    },
  });
  encoder.configure({ codec: pick.codec, width: w, height: h, bitrate: 3_000_000, framerate: VIDEO_FPS });

  const logo = team?.logo ? await loadImage(team.logo).catch(() => null) : null;
  const frames = videoFrames(lesson);
  const fields = new Map<string, HTMLImageElement>();
  const title = job.name.trim() || "Untitled play";
  const accent = team?.secondary ?? CYAN;

  const fieldAt = async (step: number, t: number) => {
    const key = `${step}:${Math.round(t * LESSON_FPS)}`;
    let image = fields.get(key);
    if (!image) {
      const svg = renderToStaticMarkup(<LessonField scene={job.scene} lesson={lesson} step={lesson.steps[step]} t={t} who={job.who} dark={dark} logo={team?.logo} standalone />);
      image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      // Stills are reused for a whole hold; moving frames are drawn once, so only stills are kept.
      const s = lesson.steps[step];
      if (s.from === s.to || t === s.from) fields.set(key, image);
    }
    return image;
  };

  const draw = (image: HTMLImageElement, step: number, t: number, done: number) => {
    const s = lesson.steps[step];
    ctx.fillStyle = dark ? "#0b1524" : "#f3f6f9";
    ctx.fillRect(0, 0, w, h);

    // Top bar.
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, w, at.top);
    ctx.fillStyle = accent;
    ctx.fillRect(0, at.top - 3, w, 3);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let x = 22;
    const mid = (at.top - 3) / 2;
    if (logo) {
      const size = at.top - 26;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x + size / 2, mid, size / 2, 0, Math.PI * 2);
      ctx.fill();
      const k = Math.min((size - 8) / logo.width, (size - 8) / logo.height);
      ctx.drawImage(logo, x + size / 2 - (logo.width * k) / 2, mid - (logo.height * k) / 2, logo.width * k, logo.height * k);
      x += size + 14;
    }
    ctx.font = `600 ${tall ? 15 : 13}px ${MONO}`;
    ctx.fillStyle = "#8fb3c9";
    const kicker = team?.name.trim() ? `${team.name.trim().toUpperCase()} · FILM ROOM` : "FILM ROOM";
    ctx.fillText(fitText(ctx, kicker, w - x - 30), x, mid - (tall ? 18 : 14));
    ctx.font = `800 ${tall ? 34 : 28}px ${DISPLAY}`;
    ctx.fillStyle = "#fff";
    const vs = `vs ${lesson.look.name}`;
    ctx.font = `600 ${tall ? 16 : 14}px ${MONO}`;
    const vsW = ctx.measureText(vs).width;
    ctx.font = `800 ${tall ? 34 : 28}px ${DISPLAY}`;
    ctx.fillText(fitText(ctx, title.toUpperCase(), w - x - vsW - 56), x, mid + (tall ? 12 : 10));
    ctx.font = `600 ${tall ? 16 : 14}px ${MONO}`;
    ctx.fillStyle = KEY;
    ctx.textAlign = "right";
    ctx.fillText(vs, w - 22, mid + (tall ? 12 : 10));

    // Field, with the clock in its corner.
    ctx.drawImage(image, at.field.x, at.field.y, at.field.w, at.field.h);
    ctx.strokeStyle = dark ? "#22364f" : "#c9d6e2";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(at.field.x, at.field.y, at.field.w, at.field.h);
    const clock = `${t.toFixed(1)} S`;
    ctx.font = `600 13px ${MONO}`;
    const cw = ctx.measureText(clock).width + 18;
    ctx.fillStyle = NAVY;
    ctx.fillRect(at.field.x + at.field.w - cw - 10, at.field.y + 10, cw, 24);
    ctx.fillStyle = KEY;
    ctx.textAlign = "center";
    ctx.fillText(clock, at.field.x + at.field.w - cw / 2 - 10, at.field.y + 22);

    // Caption bar with the progress line.
    ctx.fillStyle = NAVY;
    ctx.fillRect(at.cap.x, at.cap.y, at.cap.w, at.cap.h);
    ctx.fillStyle = team?.primary ?? "#0f2f5c";
    ctx.fillRect(at.cap.x, at.cap.y, 10, at.cap.h);
    ctx.fillStyle = accent;
    ctx.fillRect(at.cap.x, at.cap.y, Math.round(at.cap.w * Math.min(1, done)), 4);
    const size = tall ? 38 : 30;
    ctx.font = `700 ${size}px ${BODY}`;
    const lines = wrap(ctx, s.caption, at.cap.w - 80).slice(0, tall ? 5 : 2);
    const lh = size * 1.22;
    let y = at.cap.y + at.cap.h / 2 - ((lines.length - 1) * lh) / 2 + 2;
    ctx.textAlign = "left";
    for (const line of lines) {
      while (line.length && !line[line.length - 1].text.trim()) line.pop();
      let lx = at.cap.x + at.cap.w / 2 - line.reduce((a, p) => a + p.w, 0) / 2;
      for (const p of line) {
        ctx.fillStyle = p.key ? KEY : "#fff";
        ctx.fillText(p.text, lx, y);
        lx += p.w;
      }
      y += lh;
    }

    // Step list.
    const ink = dark ? "#eaf3fa" : "#0b1524";
    const sub = dark ? "#8fa6ba" : "#5d7287";
    ctx.textAlign = "left";
    ctx.font = `600 ${tall ? 15 : 12}px ${MONO}`;
    ctx.fillStyle = dark ? "#3fd3ee" : "#0b6f85";
    ctx.fillText(`INSTALL · ${lesson.steps.length} STEPS`, at.steps.x, at.steps.y);
    const row = tall ? 58 : 44;
    lesson.steps.forEach((st, si) => {
      const ry = at.steps.y + 24 + si * row;
      const now = si === step;
      if (now) {
        ctx.fillStyle = dark ? "#143a4c" : "#d9f1f7";
        ctx.fillRect(at.steps.x - 10, ry, at.steps.w + 10, row - 8);
      }
      const r = tall ? 15 : 12;
      const cy = ry + (row - 8) / 2;
      ctx.beginPath();
      ctx.arc(at.steps.x + r + 2, cy, r, 0, Math.PI * 2);
      if (now) {
        ctx.fillStyle = CYAN;
        ctx.fill();
      } else {
        ctx.strokeStyle = si < step ? (dark ? "#3fd3ee" : "#0b6f85") : sub;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.font = `600 ${tall ? 14 : 12}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillStyle = now ? "#011628" : si < step ? (dark ? "#3fd3ee" : "#0b6f85") : sub;
      ctx.fillText(String(si + 1), at.steps.x + r + 2, cy + 1);
      ctx.textAlign = "left";
      ctx.font = `700 ${tall ? 24 : 19}px ${BODY}`;
      ctx.fillStyle = now ? ink : sub;
      ctx.fillText(st.title, at.steps.x + r * 2 + 16, cy + 1);
    });
    ctx.font = `600 ${tall ? 14 : 11}px ${MONO}`;
    ctx.fillStyle = sub;
    ctx.fillText("gridiron-vault.com", at.steps.x, at.steps.y + at.steps.h);
  };

  try {
    for (let f = 0; f < frames.length; f++) {
      if (job.signal?.aborted) throw new VideoError("Stopped. No video was made.");
      if (failed) throw failed;
      const fr = frames[f];
      draw(await fieldAt(fr.step, fr.t), fr.step, fr.t, fr.done);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1_000_000) / VIDEO_FPS), duration: Math.round(1_000_000 / VIDEO_FPS) });
      encoder.encode(frame, { keyFrame: f % (VIDEO_FPS * 2) === 0 });
      frame.close();
      // Let the encoder catch up and the page breathe.
      if (encoder.encodeQueueSize > 6 || f % 8 === 0) await new Promise((r) => setTimeout(r, 0));
      job.onProgress?.((f + 1) / frames.length);
    }
    await encoder.flush();
    if (failed) throw failed;
    if (sound && track) {
      const voice = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => {
          failed = e;
        },
      });
      voice.configure({ codec: sound.codec, sampleRate: VOICE_RATE, numberOfChannels: 1, bitrate: 96_000 });
      const samples = track.getChannelData(0);
      const size = VOICE_RATE / 10;
      for (let o = 0; o < samples.length; o += size) {
        if (job.signal?.aborted) throw new VideoError("Stopped. No video was made.");
        const part = samples.slice(o, Math.min(samples.length, o + size));
        const data = new AudioData({ format: "f32-planar", sampleRate: VOICE_RATE, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round((o * 1_000_000) / VOICE_RATE), data: part });
        voice.encode(data);
        data.close();
        if (voice.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 0));
      }
      await voice.flush();
      voice.close();
      if (failed) throw failed;
    }
    muxer.finalize();
  } catch (e) {
    try {
      encoder.close();
    } catch {
      /* already closed */
    }
    if (e instanceof VideoError) throw e;
    throw new VideoError("The video didn't finish. Close other tabs and try again, or make it on a computer.");
  }
  encoder.close();
  return new Blob([target.buffer], { type: "video/mp4" });
}

/** "Trips Rt Flood" as a file name: trips-rt-flood-film-room-16x9.mp4 */
export function videoFileName(name: string, shape: VideoShape): string {
  const slug = (name.trim() || "play")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "play"}-film-room-${VIDEO_SHAPES[shape].tag}.mp4`;
}

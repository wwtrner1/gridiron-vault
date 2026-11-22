import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { luminance } from "../lib/brandData";
import { STATUS_COLOR, yardScale } from "../lib/coverage";
import { fieldMarks } from "../lib/field";
import { turnsByHand } from "../lib/film3d";
import type { CameraSide, FilmCamera, FixedCamera } from "../lib/film3d";
import { EYE_LIMITS, ORBIT_LIMITS, ORBIT_START, momentOf, resolveCamera, shotFor } from "../lib/filmCameras";
import type { Box, Followed, Shot } from "../lib/filmCameras";
import { pathData, toWorld } from "../lib/geometry";
import { pointAt } from "../lib/motion";
import { linesFor } from "../lib/teach";
import type { Lesson, TeachStep } from "../lib/teach";
import { CANVAS_W, FIRST_READ } from "../lib/types";
import type { PathNode, PlayerNode, Point, Scene } from "../lib/types";
import { LESSON_FPS, lessonInk } from "./LessonField";

/*
 * The Film Room in 3D (2026-11-20, Wes: cleared by the attorney's patent review).
 * The same lesson as `LessonField`, the same model frames and the same steps, on a
 * real field with real players. The flat field stays the default; this one is
 * the coach's pick. One WebGL canvas, drawn only when something changes.
 */

const MODEL_URL = "/film-room/athlete.glb";
const FPS = LESSON_FPS;
const BALL_FLIGHT = 0.5;
/** Meters to yards: the athlete is modelled in meters, the field is laid out in yards. */
const YD = 1 / 0.9144;
/** Players are drawn a little over life size, so a letter and a stance read from the end-zone cameras. */
const TALL = 1.3;
/** How deep an end zone is drawn, in yards. */
const END_ZONE = 10;
const NAVY = "#0B1524";
const CYAN = "#16C8E8";
const GOLD = "#F2B705";
const DEFENSE = { jersey: "#E9EDF1", trim: "#8F2F25", helmet: "#8F2F25", pants: "#E9EDF1" };
const SKIN = ["#A9744F", "#8A5C3E", "#C68E63", "#6E4630"];
const FONT = "'Saira Condensed', 'Barlow', system-ui, sans-serif";

let athlete: Promise<GLTF> | null = null;
/** The athlete is fetched once a visit and cloned for every player. */
function loadAthlete(): Promise<GLTF> {
  athlete ??= new GLTFLoader().loadAsync(MODEL_URL).catch((e) => {
    athlete = null;
    throw e;
  });
  return athlete;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lum = (hex: string) => {
  try {
    return luminance(hex);
  } catch {
    return 0.5;
  }
};
const shade = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  return k < 0 ? c.multiplyScalar(1 + k) : c.lerp(new THREE.Color("#ffffff"), k);
};

type Props = {
  scene: Scene;
  lesson: Lesson;
  step: TeachStep;
  /** The play's clock, in seconds after the snap. */
  t: number;
  /** The letter "Your job" is showing. */
  who: string;
  dark: boolean;
  logo?: string;
  /** Team colors for the offense; GridIronVault navy and cyan when left out. */
  team?: { primary: string; secondary: string };
  camera: FilmCamera;
  /** Which end the end-zone and sideline cameras stand at; the offense's when left out. */
  side?: CameraSide;
  /** Swing to the ball once it is thrown (QB cam, Follow a player); on when left out. */
  pass?: boolean;
  /** The player Follow a player and Player's eyes ride with: an offense player's id, or `d0`, `d1`… for a defender. */
  follow?: string;
  /** A tap on a player in the picture. */
  onPick?: (id: string) => void;
  /** Smaller screens: fewer pixels, no shadows. */
  light?: boolean;
  /** Draw the throw and the catch on any step, not only The read (the Designer's Preview runs the whole play as one). */
  ball?: boolean;
  label?: string;
  /** No WebGL in this browser: the Film Room goes back to the flat field. */
  onFail?: (why: "webgl") => void;
};

/**
 * Canvas units to the field in yards. A drawing's yard is a different length
 * across the field than up it (the Coverage check's `yardScale`), so each way
 * has its own scale and the 3D field comes out its real width. The x axis is
 * mirrored so the view from behind the offense matches the flat field.
 */
type Map3 = { ux: number; uz: number; X: (x: number) => number; Z: (y: number) => number; halfW: number; flag: boolean; goalZ: number | null };
function mapFor(scene: Scene): Map3 {
  const view = scene.view === "blank" ? "half" : scene.view;
  const k = yardScale(view);
  const ux = k.x || 18.2;
  const uz = k.y || 14.4;
  const goal = fieldMarks(view).goal;
  return { ux, uz, X: (x) => -(x - CANVAS_W / 2) / ux, Z: (y) => (scene.losY - y) / uz, halfW: view === "flag" ? 15 : 80 / 3, flag: view === "flag", goalZ: goal == null ? null : (scene.losY - goal) / uz };
}

/** A route's drawn line as world points, read off the same path data the flat field draws. */
function routePoints(node: PathNode, m: Map3): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  try {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", pathData(node));
    const len = el.getTotalLength();
    const n = Math.max(2, Math.ceil(len / 5));
    for (let i = 0; i <= n; i++) {
      const p = el.getPointAtLength((len * i) / n);
      const w = toWorld(node, p);
      out.push(new THREE.Vector2(m.X(w.x), m.Z(w.y)));
    }
  } catch {
    for (const p of node.points) {
      const w = toWorld(node, p);
      out.push(new THREE.Vector2(m.X(w.x), m.Z(w.y)));
    }
  }
  return out;
}

/** A flat strip along a line on the grass. */
function strip(pts: THREE.Vector2[], width: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    const nx = -d.y * (width / 2);
    const nz = d.x * (width / 2);
    pos.push(pts[i].x + nx, y, pts[i].y + nz, pts[i].x - nx, y, pts[i].y - nz);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Splits a line into dashes (a dashed or motion line in the drawing). */
function dashes(pts: THREE.Vector2[], on: number, off: number): THREE.Vector2[][] {
  const out: THREE.Vector2[][] = [];
  let cur: THREE.Vector2[] = [pts[0]];
  let left = on;
  let drawing = true;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1].clone();
    const b = pts[i];
    let seg = a.distanceTo(b);
    while (seg > left) {
      const p = a.clone().lerp(b, left / seg);
      if (drawing) {
        cur.push(p);
        out.push(cur);
      } else cur = [p];
      seg -= left;
      a = p;
      drawing = !drawing;
      left = drawing ? on : off;
    }
    left -= seg;
    if (drawing) cur.push(b.clone());
  }
  if (drawing && cur.length > 1) out.push(cur);
  return out;
}

function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  return tx;
}

/** A round chip with a letter, as on the flat field, floating over a player's head. */
function chip(text: string, fill: string, ink: string, edge = "#ffffff"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = edge;
  g.stroke();
  g.fillStyle = ink;
  g.font = `800 ${text.length > 1 ? 46 : 62}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text.slice(0, 3), 64, 68);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: false, transparent: true }));
  s.renderOrder = 10;
  return s;
}

/** A tag in the display face (a zone's job), with a halo so it reads on the grass. */
function tag(text: string, fill: string, ink: string): THREE.Sprite {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = `800 52px ${FONT}`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 40;
  c.width = w;
  c.height = 76;
  g.font = font;
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(2, 2, w - 4, 72, 14);
  g.fill();
  g.fillStyle = ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, 41);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: false, transparent: true }));
  s.renderOrder = 11;
  s.scale.set((w / 76) * 1.15, 1.15, 1);
  return s;
}

const numberCache = new Map<string, THREE.CanvasTexture>();
/** The letter printed on the jersey, so every player wears his playbook letter. */
function numberTexture(text: string, ink: string, edge: string): THREE.CanvasTexture {
  const key = text + ink + edge;
  const hit = numberCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.font = `800 ${text.length > 1 ? 120 : 160}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 12;
  g.strokeStyle = edge;
  g.strokeText(text, 128, 88);
  g.fillStyle = ink;
  g.fillText(text, 128, 88);
  const tx = canvasTexture(c);
  tx.flipY = false;
  numberCache.set(key, tx);
  return tx;
}

type Kit = { jersey: string; trim: string; helmet: string; pants: string; skin: string; text: string };

type Body = {
  root: THREE.Group;
  sample: (entries: [string, number, number][]) => void;
  clip: (name: string) => number;
  mats: THREE.Material[];
  dim: (alpha: number) => void;
};

/** One player: a clone of the athlete in his side's uniform, or a plain puck when the athlete didn't load. */
function makeBody(model: GLTF | null, kit: Kit, frame: number): Body {
  const root = new THREE.Group();
  const mats: THREE.Material[] = [];
  if (!model) {
    const m = new THREE.MeshStandardMaterial({ color: kit.jersey, roughness: 0.6 });
    mats.push(m);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * TALL, 0.55 * TALL, 1.9 * TALL, 20), m);
    puck.position.y = 0.95 * TALL;
    root.add(puck);
    return { root, sample: () => undefined, clip: () => 1, mats, dim: (a) => ((m.transparent = a < 1), (m.opacity = a)) };
  }
  const m = cloneSkinned(model.scene) as THREE.Object3D;
  m.scale.set(YD * TALL * frame, YD * TALL, YD * TALL * frame);
  root.add(m);
  const byName = new Map<string, THREE.MeshStandardMaterial[]>();
  m.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    const own = (mt: THREE.Material) => {
      const c = mt.clone() as THREE.MeshStandardMaterial;
      mats.push(c);
      const list = byName.get(c.name) ?? [];
      list.push(c);
      byName.set(c.name, list);
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
  });
  const ball = m.getObjectByName("Football");
  if (ball) ball.visible = false;
  const paint = (part: string, color: string | THREE.Color) => {
    for (const [name, list] of byName) if (name.includes(part)) for (const mt of list) mt.color.set(color);
  };
  paint("woven jersey", kit.jersey);
  paint("piping", kit.trim);
  paint("pad fabric", kit.pants);
  paint("seams", shade(kit.pants, -0.3));
  paint("skin", kit.skin);
  paint("glove backs", kit.trim);
  paint("lacquered helmet", kit.helmet);
  const light = lum(kit.jersey) > 0.55;
  for (const [name, list] of byName)
    if (name.includes("numeral"))
      for (const mt of list) {
        mt.map = numberTexture(kit.text, light ? "#" + shade(kit.trim, -0.25).getHexString() : "#ffffff", light ? "#ffffff" : kit.trim);
        mt.color.set("#ffffff");
        mt.needsUpdate = true;
      }
  const mixer = new THREE.AnimationMixer(m);
  const acts = new Map<string, THREE.AnimationAction>();
  for (const cl of model.animations) {
    const a = mixer.clipAction(cl);
    a.play();
    a.paused = true;
    a.setEffectiveWeight(0);
    acts.set(cl.name, a);
  }
  return {
    root,
    mats,
    clip: (name) => acts.get(name)?.getClip().duration ?? 1,
    sample(entries) {
      for (const a of acts.values()) a.setEffectiveWeight(0);
      for (const [name, phase, w] of entries) {
        const a = acts.get(name);
        if (!a) continue;
        a.time = clamp(phase, 0, 0.9999) * a.getClip().duration;
        a.setEffectiveWeight(w);
      }
      mixer.update(0);
    },
    dim(alpha) {
      for (const mt of mats) {
        mt.transparent = alpha < 1;
        mt.opacity = alpha;
        mt.depthWrite = alpha >= 1;
      }
    },
  };
}

type Mover = {
  id: string;
  body: Body;
  chip: THREE.Sprite;
  ring: THREE.Mesh | null;
  track: Point[];
  /** Distance run up to each frame, in yards, so the stride follows the ground covered. */
  run: number[];
  side: "offense" | "defense";
  letter: string;
  zone: boolean;
  start: THREE.Vector2;
  /** Where he is and the way he faces at the moment on screen. */
  at: THREE.Vector2;
  face: number;
};

class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly world = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.3, 600);
  private fixed = new THREE.Group();
  private ink = new THREE.Group();
  private zones = new THREE.Group();
  private marks = new THREE.Group();
  private movers: Mover[] = [];
  private ball: THREE.Mesh;
  private hemi = new THREE.HemisphereLight("#dfefff", "#2b4a2a", 1);
  private sun = new THREE.DirectionalLight("#fff3dc", 2.2);
  private camPos = new THREE.Vector3(0, 10, -14);
  private camLook = new THREE.Vector3(0, 0, 9);
  private camUp = new THREE.Vector3(0, 1, 0);
  private goal = { pos: this.camPos.clone(), look: this.camLook.clone(), up: this.camUp.clone(), fov: 50 };
  /** The camera on screen now, so a change of camera can cut instead of flying through the players. */
  shot: FixedCamera = "behind";
  private rode = "";
  private orbit = { ...ORBIT_START };
  private eye = { yaw: 0, pitch: 0 };
  private soft = false;
  private raf = 0;
  private last = 0;
  private still: boolean;
  frames = 0;
  model: GLTF | null = null;
  map: Map3 | null = null;
  props: Props | null = null;
  inkKey = "";
  marksKey = "";
  play: Box = { x0: -10, x1: 10, z0: -6, z1: 18 };
  snap: Box = { x0: -10, x1: 10, z0: -6, z1: 12 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    light: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    // A browser drawing WebGL without a graphics card (software rendering) gets the cheap picture: no shadows, one pixel a pixel.
    const soft = software(this.renderer);
    if (soft) light = true;
    this.soft = soft;
    canvas.dataset.quality = soft ? "software" : light ? "light" : "full";
    this.renderer.setPixelRatio(soft ? 1 : Math.min(window.devicePixelRatio || 1, light ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = !light;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.world.add(this.fixed, this.zones, this.ink, this.marks, this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = !light;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10), new THREE.MeshStandardMaterial({ color: "#8B5A2B", roughness: 0.55 }));
    this.ball.scale.set(1.4, 1.4, 2.3);
    this.ball.castShadow = true;
    this.world.add(this.ball);
  }

  size() {
    const r = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(1, Math.round(r?.width ?? 640));
    const h = Math.max(1, Math.round(r?.height ?? 360));
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.kick(true);
  }

  /** Dark is a night game under the lights; light is a day game. The field and sky follow. */
  private lights(dark: boolean) {
    this.world.background = new THREE.Color(dark ? "#08111d" : "#cfe2f1");
    this.world.fog = new THREE.Fog(dark ? "#08111d" : "#cfe2f1", 110, 320);
    this.hemi.color.set(dark ? "#b9d3f5" : "#e6f2ff");
    this.hemi.groundColor.set(dark ? "#16301c" : "#2b4a2a");
    this.hemi.intensity = dark ? 0.85 : 1.1;
    this.sun.color.set(dark ? "#f4f8ff" : "#fff3dc");
    this.sun.intensity = dark ? 2.4 : 2.3;
    this.sun.position.set(-30, 55, -20);
    this.sun.target.position.set(0, 0, 8);
    this.renderer.toneMappingExposure = dark ? 1.08 : 1.0;
  }

  /**
   * Paints the field in yards and lays it on the grass: wider and longer than
   * the drawing, so no camera ever looks off the end of it. Yard lines run every
   * five yards out from the line of scrimmage and the numbers are yards from it,
   * as on the flat field.
   */
  private field(scene: Scene, m: Map3, dark: boolean, logo?: string, team?: { primary: string; secondary: string }) {
    const P = this.soft ? 14 : 22;
    const apron = 10;
    const half = m.halfW;
    // The field of play: to the goal line where the drawing has one, else well past the deepest route.
    const far = m.goalZ ?? 75;
    const near = m.flag && m.goalZ != null ? m.goalZ - 50 : -40;
    const front = far + (m.goalZ != null ? END_ZONE : 0) + 6;
    const back = near - (m.flag ? END_ZONE : 0) - 6;
    const c = document.createElement("canvas");
    c.width = Math.round((half + apron) * 2 * P);
    c.height = Math.round((front - back) * P);
    const g = c.getContext("2d")!;
    const px = (x: number) => (half + apron - x) * P;
    const py = (z: number) => (front - z) * P;
    const band = (z0: number, z1: number, fill: string) => {
      g.fillStyle = fill;
      g.fillRect(px(half), py(z1), half * 2 * P, (z1 - z0) * P);
    };
    g.fillStyle = dark ? "#123a1d" : "#2f6d2c";
    g.fillRect(0, 0, c.width, c.height);
    const grass = dark ? ["#1d5a2c", "#1a5228"] : ["#3f8a3a", "#3a8035"];
    for (let z = Math.floor(near / 5) * 5; z < far; z += 5) band(Math.max(near, z), Math.min(far, z + 5), grass[Math.abs(Math.round(z / 5)) % 2]);
    const zoneFill = team?.primary ?? NAVY;
    const zoneInk = lum(zoneFill) > 0.5 ? NAVY : "#ffffff";
    const ends: [number, number][] = [];
    if (m.goalZ != null) ends.push([far, far + END_ZONE]);
    if (m.flag) ends.push([near - END_ZONE, near]);
    for (const [z0, z1] of ends) {
      band(z0, z1, zoneFill);
      g.fillStyle = zoneInk;
      g.globalAlpha = 0.16;
      for (let x = -half; x < half; x += 2.4) g.fillRect(px(x + 1.2), py(z1), 1.2 * P, (z1 - z0) * P);
      g.globalAlpha = 1;
    }
    const white = "rgba(255,255,255,.92)";
    const line = (z: number, w: number, color = white) => {
      g.fillStyle = color;
      g.fillRect(px(half), py(z) - (w * P) / 2, half * 2 * P, w * P);
    };
    g.textAlign = "center";
    g.textBaseline = "middle";
    const tall = m.flag ? 1.9 : 2.7;
    g.font = `700 ${Math.round(tall * P)}px ${FONT}`;
    for (let z = Math.ceil(near / 5) * 5; z <= far; z += 5) {
      if (z === 0) continue;
      if (z > near + 0.5 && z < far - 0.5) line(z, 0.13, "rgba(255,255,255,.78)");
      if (z > 0 && z % 10 === 0 && z < far - 3) {
        g.fillStyle = "rgba(255,255,255,.88)";
        // Numbers read from behind the offense, the way the first camera sees the field.
        for (const x of [half - (m.flag ? 3 : 6.5), -(half - (m.flag ? 3 : 6.5))]) g.fillText(String(z), px(x), py(z + tall * 0.75));
      }
    }
    if (!m.flag) {
      g.fillStyle = "rgba(255,255,255,.7)";
      // Yard ticks at the sidelines and the hash marks.
      for (let z = Math.ceil(near); z <= far; z++) {
        if (z % 5 === 0) continue;
        for (const x of [half - 0.35, -(half - 1.05), half / 3 + 0.35, -half / 3 + 0.35]) g.fillRect(px(x), py(z) - 0.05 * P, 0.7 * P, 0.1 * P);
      }
    }
    line(near, 0.26);
    line(far, 0.26);
    // Sidelines and the end lines, as one border.
    const z0 = m.flag ? near - END_ZONE : near;
    const z1 = m.goalZ != null ? far + END_ZONE : far;
    g.strokeStyle = white;
    g.lineWidth = 0.42 * P;
    g.strokeRect(px(half), py(z1), half * 2 * P, (z1 - z0) * P);
    line(0, 0.3, "#3FD3EE");
    const tex = canvasTexture(c);
    const geo = new THREE.BufferGeometry();
    const w = half + apron;
    geo.setAttribute("position", new THREE.Float32BufferAttribute([w, 0, front, -w, 0, front, w, 0, back, -w, 0, back], 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const turf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
    turf.receiveShadow = true;
    this.fixed.add(turf);
    const around = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: dark ? "#0d2414" : "#2a5a28", roughness: 1 }));
    around.rotation.x = -Math.PI / 2;
    around.position.y = -0.4;
    around.receiveShadow = true;
    this.fixed.add(around);
    this.stadium(m, dark, back, front, team);
    if (logo) {
      const img = new Image();
      img.onload = () => {
        const s = m.flag ? 6 : 9;
        const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(this.logoCanvas(img)), transparent: true, opacity: 0.28, depthWrite: false });
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat);
        plate.rotation.x = -Math.PI / 2;
        plate.rotation.z = Math.PI;
        plate.position.set(0, 0.01, Math.min(18, far - s));
        this.fixed.add(plate);
        this.kick(true);
      };
      img.src = logo;
    }
  }

  /** The ground a camera sees past the field: stands down both sides and behind both ends, and goal posts where the drawing has a goal line. */
  private stadium(m: Map3, dark: boolean, back: number, front: number, team?: { primary: string; secondary: string }) {
    const crowd = document.createElement("canvas");
    crowd.width = 256;
    crowd.height = 64;
    const g = crowd.getContext("2d")!;
    g.fillStyle = dark ? "#0f1b2d" : "#6c7b8c";
    g.fillRect(0, 0, 256, 64);
    const dots = [team?.primary ?? CYAN, team?.secondary ?? "#ffffff", "#d9e2ec", dark ? "#26384f" : "#93a2b3", dark ? "#1a2a40" : "#7f8fa1"];
    // The same crowd every time (no random numbers), so two pictures of one play match.
    for (let i = 0, n = 7; i < 900; i++) {
      n = (n * 16807) % 2147483647;
      g.fillStyle = dots[n % dots.length];
      g.globalAlpha = dark ? 0.5 : 0.75;
      g.fillRect(n % 256, (n >> 9) % 64, 3, 4);
    }
    const tex = canvasTexture(crowd);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const stand = (len: number, tiers: number) => {
      const group = new THREE.Group();
      for (let i = 0; i < tiers; i++) {
        const h = 4 + i * 3.6;
        const t = tex.clone();
        t.needsUpdate = true;
        t.repeat.set(len / 30, 1);
        const box = new THREE.Mesh(new THREE.BoxGeometry(len, h, 7), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
        box.position.set(0, h / 2, i * 7);
        group.add(box);
      }
      return group;
    };
    const long = front - back + 50;
    const midZ = (front + back) / 2;
    for (const sgn of [1, -1]) {
      const side = stand(long, this.soft ? 2 : 4);
      side.rotation.y = (-sgn * Math.PI) / 2;
      side.position.set(-sgn * (m.halfW + 22), 0, midZ);
      this.fixed.add(side);
    }
    const wide = (m.halfW + 22) * 2 + 20;
    const farEnd = stand(wide, this.soft ? 2 : 3);
    farEnd.position.set(0, 0, front + 16);
    const nearEnd = stand(wide, this.soft ? 2 : 3);
    nearEnd.rotation.y = Math.PI;
    nearEnd.position.set(0, 0, back - 16);
    this.fixed.add(farEnd, nearEnd);
    if (m.goalZ != null && !m.flag) {
      const mat = new THREE.MeshStandardMaterial({ color: "#F4C430", roughness: 0.5 });
      const post = new THREE.Group();
      const bar = (len: number, x: number, y: number, flat: boolean) => {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, len, 10), mat);
        if (flat) c.rotation.z = Math.PI / 2;
        c.position.set(x, y, 0);
        post.add(c);
      };
      bar(3.33, 0, 1.67, false);
      bar(6.17, 0, 3.33, true);
      bar(8, 3.08, 7.33, false);
      bar(8, -3.08, 7.33, false);
      post.position.set(0, 0, m.goalZ + END_ZONE);
      this.fixed.add(post);
    }
  }

  private logoCanvas(img: HTMLImageElement) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const k = Math.min(256 / img.width, 256 / img.height);
    g.drawImage(img, (256 - img.width * k) / 2, (256 - img.height * k) / 2, img.width * k, img.height * k);
    return c;
  }

  private clearGroup(group: THREE.Object3D) {
    for (const o of [...group.children]) {
      group.remove(o);
      dispose(o);
    }
  }

  /** Everything that comes from the play itself: field, players, zones. Rebuilt when the play, the look or the colors change. */
  build(p: Props) {
    this.clearGroup(this.fixed);
    this.clearGroup(this.zones);
    for (const mv of this.movers) {
      this.world.remove(mv.body.root, mv.chip);
      if (mv.ring) this.world.remove(mv.ring);
      dispose(mv.body.root);
      dispose(mv.chip);
      if (mv.ring) dispose(mv.ring);
    }
    this.movers = [];
    this.props = p;
    const m = (this.map = mapFor(p.scene));
    this.lights(p.dark);
    this.field(p.scene, m, p.dark, p.logo, p.team);

    const { result, motion } = p.lesson;
    const primary = p.team?.primary ?? NAVY;
    const secondary = p.team?.secondary ?? CYAN;
    const offense = p.scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side !== "defense");
    offense.forEach((n, k) => {
      const letter = n.label.trim().toUpperCase() || "?";
      const kit: Kit = { jersey: primary, trim: secondary, helmet: primary, pants: lum(primary) > 0.6 ? secondary : "#F2F5F8", skin: SKIN[k % SKIN.length], text: letter };
      const lineman = /^(C|G|T|LT|LG|RG|RT|OL)$/.test(letter);
      const track = motion.offense.get(n.id) ?? [];
      this.add({ id: n.id, letter, side: "offense", zone: false, track, kit, frame: lineman ? 1.22 : 0.95, fill: n.fill, start: { x: n.x, y: n.y } });
    });
    result.defenders.forEach((d, di) => {
      const kit: Kit = { ...DEFENSE, skin: SKIN[(di + 1) % SKIN.length], text: d.label.slice(0, 2) };
      this.add({ id: `d${di}`, letter: d.label, side: "defense", zone: d.job === "zone", track: motion.defense[di] ?? [], kit, frame: d.lineman ? 1.2 : 0.95, fill: p.dark ? "#2A1717" : "#ffffff", start: d.start });
    });

    const box = (pts: THREE.Vector2[]): Box => ({ x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), z0: Math.min(...pts.map((q) => q.y)), z1: Math.max(...pts.map((q) => q.y)) });
    const starts = this.movers.map((mv) => mv.start);
    const all = [...starts];
    for (const mv of this.movers) for (let i = 0; i < mv.track.length; i += 6) all.push(new THREE.Vector2(m.X(mv.track[i].x), m.Z(mv.track[i].y)));
    if (starts.length) {
      this.snap = box(starts);
      this.play = box(all);
    }

    // Zones: the flat field's ellipses, laid on the grass, cyan underneath and gold deep.
    result.defenders.forEach((d, di) => {
      if (!d.landmark || !d.reach) return;
      const deep = !!p.lesson.jobs[di]?.deep;
      const color = deep ? "#FFD23F" : "#3FD3EE";
      const cx = m.X(d.landmark.x);
      const cz = m.Z(d.landmark.y);
      const rx = d.reach.rx / 1.15 / m.ux;
      const rz = d.reach.ry / 2.4 / m.uz;
      const zone = new THREE.Group();
      zone.userData.zone = true;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      disc.scale.set(rx, rz, 1);
      disc.position.set(cx, 0.03, cz);
      const edge: THREE.Vector2[] = [];
      for (let a = 0; a <= 64; a++) edge.push(new THREE.Vector2(cx + Math.cos((a / 64) * Math.PI * 2) * rx, cz + Math.sin((a / 64) * Math.PI * 2) * rz));
      const ring = new THREE.Group();
      for (const part of dashes(edge, 1.1, 0.7)) ring.add(new THREE.Mesh(strip(part, 0.22, 0.04), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })));
      const label = tag((p.lesson.jobs[di]?.job ?? "").toUpperCase(), deep ? "rgba(255,210,63,.92)" : "rgba(63,211,238,.92)", NAVY);
      label.position.set(cx, 1.4, cz);
      label.userData.size = [label.scale.x, label.scale.y];
      label.userData.tag = true;
      zone.add(disc, ring, label);
      this.zones.add(zone);
    });
    this.inkKey = "";
    this.marksKey = "";
    this.clearGroup(this.marks);
  }

  private add(o: { id: string; letter: string; side: "offense" | "defense"; zone: boolean; track: Point[]; kit: Kit; frame: number; fill: string; start: Point }) {
    const m = this.map!;
    const body = makeBody(this.model, o.kit, o.frame);
    const dark = this.props?.dark ?? true;
    const ink = o.side === "defense" ? (dark ? "#FF8A7A" : "#9E3428") : lum(o.fill) > 0.55 ? NAVY : "#ffffff";
    const c = chip(o.letter, o.fill, ink, o.side === "defense" ? "#9E3428" : "#ffffff");
    c.scale.set(1.05, 1.05, 1);
    c.userData.size = [1.05, 1.05];
    const run = [0];
    for (let i = 1; i < o.track.length; i++) run.push(run[i - 1] + Math.hypot((o.track[i].x - o.track[i - 1].x) / m.ux, (o.track[i].y - o.track[i - 1].y) / m.uz));
    const start = new THREE.Vector2(m.X(o.start.x), m.Z(o.start.y));
    const mover: Mover = { id: o.id, body, chip: c, ring: null, track: o.track, run, side: o.side, letter: o.letter.toUpperCase(), zone: o.zone, start, at: start.clone(), face: o.side === "offense" ? 0 : Math.PI };
    this.world.add(body.root, c);
    this.movers.push(mover);
  }

  /** The coach's routes for this step: heavier while the lesson is about them, faint while it isn't. */
  private routes(p: Props) {
    const id = p.step.id;
    const key = `${id}|${p.who}|${p.dark}`;
    if (key === this.inkKey) return;
    this.inkKey = key;
    this.clearGroup(this.ink);
    const m = this.map!;
    const mine = new Set(id === "job" ? linesFor(p.scene, p.who).map((l) => l.id) : []);
    for (const n of lessonInk(p.scene, p.dark)) {
      if (n.kind !== "path" || n.closed) continue;
      const pts = routePoints(n, m);
      if (pts.length < 2) continue;
      const bold = id === "call" || id === "snap" || id === "read" || (id === "job" && mine.has(n.id));
      const opacity = id === "call" ? 1 : id === "job" ? (mine.has(n.id) ? 1 : 0.14) : id === "look" || id === "zones" ? 0.3 : 0.8;
      const first = !!n.firstRead;
      let color = first ? FIRST_READ : n.stroke;
      // Dark ink would vanish on the grass at night; it reads as white.
      if (lum(color) < 0.05) color = p.dark ? "#E9F0F6" : "#101820";
      const width = Math.max(0.32, (n.width * 2) / m.uz) * (bold ? 1.6 : 1) * (first && id === "call" ? 1.25 : 1);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
      const parts = n.style === "solid" ? [pts] : dashes(pts, n.style === "dotted" ? 0.35 : 1.1, n.style === "dotted" ? 0.45 : 0.7);
      for (const part of parts) if (part.length > 1) this.ink.add(new THREE.Mesh(strip(part, width, 0.05), mat));
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
      if (n.endCap === "arrow" || n.endCap === "chevron") {
        const s = width * 1.7;
        const shape = new THREE.Shape([new THREE.Vector2(0, s * 1.1), new THREE.Vector2(-s * 0.7, -s * 0.4), new THREE.Vector2(s * 0.7, -s * 0.4)]);
        const head = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
        head.rotation.x = -Math.PI / 2;
        head.rotation.z = Math.atan2(-d.x, -d.y);
        head.position.set(b.x, 0.055, b.y);
        this.ink.add(head);
      } else if (n.endCap === "tee") {
        const nrm = new THREE.Vector2(-d.y, d.x).multiplyScalar(width * 2.2);
        this.ink.add(new THREE.Mesh(strip([b.clone().add(nrm), b.clone().sub(nrm)], width, 0.055), mat));
      }
    }
  }

  /** Puts every player, ring, badge and the ball where the lesson has them at this moment. */
  pose(p: Props) {
    if (!this.map) return;
    const m = this.map;
    const { result } = p.lesson;
    const id = p.step.id;
    const now = Math.min(p.t, result.duration);
    this.routes(p);
    for (const z of this.zones.children) {
      z.visible = id !== "job";
      for (const c of z.children) if (c.userData.tag) c.visible = id === "zones";
      z.children.forEach((c) => {
        const mesh = c as THREE.Mesh;
        if (mesh.material && !c.userData.tag) (mesh.material as THREE.MeshBasicMaterial).opacity = id === "zones" ? 0.24 : 0.12;
      });
    }
    const thrown = (id === "read" || !!p.ball) && p.t >= result.throwAt;
    const status = new Map(id === "read" ? result.rows.map((r) => [r.id, r.status]) : []);
    let qbHand: THREE.Vector3 | null = null;
    let targetAt: THREE.Vector3 | null = null;
    for (const mv of this.movers) {
      const at = (tt: number) => {
        const q = pointAt(mv.track, Math.max(0, tt), FPS);
        return q ? new THREE.Vector2(m.X(q.x), m.Z(q.y)) : mv.start.clone();
      };
      const pos = at(now);
      const ahead = at(now + 0.12);
      const back = at(now - 0.12);
      const vel = ahead.clone().sub(back).divideScalar(now > 0.12 ? 0.24 : 0.12);
      const speed = vel.length();
      const home = mv.side === "offense" ? 0 : Math.PI;
      const backpedal = mv.side === "defense" && mv.zone && now < 1.4 && vel.y > 0.8 && Math.abs(vel.x) < vel.y * 1.2;
      let face = home;
      if (speed > 0.8) face = backpedal ? Math.atan2(-vel.x, -vel.y) : Math.atan2(vel.x, vel.y);
      else if (now > 0.3) {
        const was = at(now - 0.6);
        const d = pos.clone().sub(was);
        if (d.length() > 0.3) face = Math.atan2(d.x, d.y);
      }
      mv.body.root.position.set(pos.x, 0, pos.y);
      mv.body.root.rotation.y = face;
      mv.at.copy(pos);
      mv.face = face;
      const f = Math.min(mv.run.length - 1, Math.max(0, now * FPS));
      const i = Math.floor(f);
      const dist = mv.run.length ? mv.run[i] + ((mv.run[Math.min(mv.run.length - 1, i + 1)] ?? mv.run[i]) - mv.run[i]) * (f - i) : 0;
      const entries: [string, number, number][] = [];
      const w = clamp(speed / 4, 0, 1);
      if (p.t <= 0.02 || speed < 0.3) entries.push([now > 0 ? "Idle" : "Ready", 0.5, 1]);
      else {
        const stride = (backpedal ? 1.6 : 2.6) * TALL;
        entries.push([backpedal ? "Backpedal" : "Sprint", (dist / stride) % 1, w], ["Ready", 0.5, 1 - w]);
      }
      if (mv.side === "offense" && mv.letter === "Q") {
        const dur = mv.body.clip("Throw");
        const ph = (p.t - result.throwAt) / dur + 0.55;
        if (ph > 0 && ph < 1 && p.t > 0) entries.splice(0, entries.length, ["Throw", ph, 1]);
        qbHand = new THREE.Vector3(pos.x, 2.0 * TALL, pos.y);
      }
      if (result.target && mv.id === result.target.id) {
        targetAt = new THREE.Vector3(pos.x, 1.4 * TALL, pos.y);
        const dur = mv.body.clip("Catch");
        const ph = (p.t - result.throwAt - BALL_FLIGHT) / dur + 0.45;
        if ((id === "read" || p.ball) && ph > 0 && ph < 1) entries.splice(0, entries.length, ["Catch", ph, 1]);
      }
      mv.body.sample(entries);
      const dimmed = id === "job" && (mv.side === "defense" || mv.letter !== p.who);
      mv.body.dim(dimmed ? 0.3 : 1);
      mv.chip.position.set(pos.x, 2.75 * TALL, pos.y);
      (mv.chip.material as THREE.SpriteMaterial).opacity = dimmed ? 0.3 : 1;
      const s = thrown ? status.get(mv.id) : undefined;
      if (s) {
        if (!mv.ring) {
          mv.ring = new THREE.Mesh(new THREE.RingGeometry(0.95 * TALL, 1.25 * TALL, 40), new THREE.MeshBasicMaterial({ color: STATUS_COLOR[s], transparent: true, opacity: 0.95, depthWrite: false }));
          mv.ring.rotation.x = -Math.PI / 2;
          this.world.add(mv.ring);
        }
        (mv.ring.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[s]);
        mv.ring.position.set(pos.x, 0.06, pos.y);
        mv.ring.visible = true;
      } else if (mv.ring) mv.ring.visible = false;
    }

    // Read order: gold badges where each route ends (made once a step, not every frame).
    const marksKey = id === "read" ? `read|${result.look.id}|${this.inkKey}` : "";
    if (marksKey !== this.marksKey) {
      this.marksKey = marksKey;
      this.clearGroup(this.marks);
    }
    if (id === "read" && !this.marks.children.length)
      for (const r of result.rows) {
        const b = chip(String(r.read), GOLD, NAVY, NAVY);
        b.scale.set(0.95, 0.95, 1);
        b.userData.size = [0.95, 0.95];
        b.position.set(m.X(r.end.x), 3.2 * TALL, m.Z(r.end.y));
        this.marks.add(b);
      }

    const qb = qbHand as THREE.Vector3 | null;
    const to = targetAt as THREE.Vector3 | null;
    if (thrown && qb && to) {
      const k = Math.min(1, (p.t - result.throwAt) / BALL_FLIGHT);
      this.ball.visible = true;
      this.ball.position.copy(qb).lerp(to, k);
      this.ball.position.y += Math.sin(Math.PI * k) * 3.5;
      this.ball.lookAt(to.x, this.ball.position.y, to.z);
    } else this.ball.visible = false;

    // The camera: the lesson's own, one for each moment of the play, or the one the coach picked.
    const canThrow = id === "read" || !!p.ball;
    const { shot, tag } = resolveCamera(p.camera, id, momentOf(p.t, result.throwAt, BALL_FLIGHT, canThrow));
    const qbMover = this.movers.find((mv) => mv.side === "offense" && mv.letter === "Q") ?? null;
    const target = result.target ? (this.movers.find((mv) => mv.id === result.target!.id) ?? null) : null;
    let rider: Mover | null;
    if (p.camera === "auto") rider = id === "job" ? (this.movers.find((mv) => mv.side === "offense" && mv.letter === p.who) ?? null) : null;
    else if (p.camera === "modular") rider = target ?? qbMover;
    else rider = this.movers.find((mv) => mv.id === p.follow) ?? (shot === "eyes" ? (qbMover ?? target) : (target ?? qbMover)) ?? this.movers[0] ?? null;
    let follow: Followed | null = null;
    if (rider) {
      const watch = rider === qbMover ? (target ?? this.movers.find((mv) => mv.id === result.rows[0]?.id) ?? null) : rider.side === "defense" ? qbMover : null;
      // The quarterback watches his read, eyes downfield; a defender watches the quarterback.
      const eyes = !watch ? undefined : rider === qbMover ? { x: rider.at.x + (watch.at.x - rider.at.x) * 0.55, z: Math.max(rider.at.y + 16, watch.at.y + 4) } : { x: watch.at.x, z: watch.at.y };
      follow = { x: rider.at.x, z: rider.at.y, hx: Math.sin(rider.face), hz: Math.cos(rider.face), offense: rider.side === "offense", eyes };
    }
    // A new rider or a new camera starts looking straight ahead again.
    const rode = `${shot}|${rider?.id ?? ""}`;
    if (rode !== this.rode) {
      this.rode = rode;
      this.eye = { yaw: 0, pitch: 0 };
    }
    for (const mv of this.movers) {
      // Inside a helmet there is no helmet to see.
      const hidden = shot === "eyes" && mv === rider;
      mv.body.root.visible = !hidden;
      mv.chip.visible = !hidden;
    }
    // Follow the lesson is the lesson's own camera work: a From or Follow the ball saved for another camera doesn't reach it.
    const own = p.camera === "auto";
    const side = own ? "offense" : (p.side ?? "offense");
    const ballAt = thrown && this.ball.visible ? { x: this.ball.position.x, y: this.ball.position.y, z: this.ball.position.z } : null;
    const s: Shot = shotFor(shot, {
      aspect: this.cam.aspect,
      side,
      play: this.play,
      snap: this.snap,
      halfField: m.halfW,
      qb: qbMover ? { x: qbMover.at.x, z: qbMover.at.y } : null,
      follow,
      ball: ballAt,
      pass: own || p.pass !== false,
      orbit: this.orbit,
      eye: this.eye,
      tall: TALL,
    });
    this.goal.pos.set(...s.pos);
    this.goal.look.set(...s.look);
    this.goal.up.set(...(s.up ?? [0, 1, 0]));
    this.goal.fov = s.fov;
    // A cut, not a flight, when the camera changes to or from a helmet or the top-down view.
    // So is a top-down view turned to the other end: its up flips to the opposite, which an ease could never cross.
    const cut = (shot !== this.shot && (shot === "eyes" || this.shot === "eyes" || shot === "overhead" || this.shot === "overhead")) || this.camUp.dot(this.goal.up) < -0.9;
    this.shot = shot;
    const d = this.canvas.dataset;
    d.camera = tag;
    d.shot = shot;
    d.fov = String(Math.round(s.fov));
    d.side = side;
    d.follow = follow && (shot === "zoom" || shot === "eyes") ? (rider?.id ?? "") : "";
    d.goal = s.pos.map((v) => v.toFixed(1)).join(",");
    if (turnsByHand(shot)) d.drag = "1";
    else delete d.drag;
    this.kick(cut);
  }

  /** The coach turning the camera by hand: a drag in pixels on Free look or inside a helmet. */
  turn(dx: number, dy: number) {
    if (this.shot === "eyes") {
      this.eye.yaw = clamp(this.eye.yaw + dx * 0.004, ...EYE_LIMITS.yaw);
      this.eye.pitch = clamp(this.eye.pitch + dy * 0.003, ...EYE_LIMITS.pitch);
    } else if (this.shot === "free") {
      this.orbit.az -= dx * 0.006;
      this.orbit.el = clamp(this.orbit.el + dy * 0.004, ...ORBIT_LIMITS.el);
    }
  }

  /** Free look closer (under 1) or farther (over 1). */
  zoomBy(k: number) {
    if (this.shot === "free") this.orbit.r = clamp(this.orbit.r * k, ...ORBIT_LIMITS.r);
  }

  /** The player under a tap, if one is close enough to it. */
  pickAt(clientX: number, clientY: number): string | null {
    const r = this.canvas.getBoundingClientRect();
    let best: string | null = null;
    let near = 48;
    const v = new THREE.Vector3();
    for (const mv of this.movers) {
      if (!mv.body.root.visible) continue;
      v.set(mv.at.x, 1.1 * TALL, mv.at.y).project(this.cam);
      if (v.z > 1) continue;
      const dist = Math.hypot(r.left + ((v.x + 1) / 2) * r.width - clientX, r.top + ((1 - v.y) / 2) * r.height - clientY);
      if (dist < near) {
        near = dist;
        best = mv.id;
      }
    }
    return best;
  }

  /** Draws now, and keeps drawing while the camera is still on its way. */
  kick(snap: boolean) {
    if (snap || this.still) {
      this.camPos.copy(this.goal.pos);
      this.camLook.copy(this.goal.look);
      this.camUp.copy(this.goal.up);
      this.cam.fov = this.goal.fov;
      this.cam.updateProjectionMatrix();
    }
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    // A helmet rides with its player exactly; the other cameras ease to where they are going.
    const riding = this.shot === "eyes";
    const k = 1 - Math.exp(-dt * (riding ? 9 : this.shot === "free" ? 8 : 3.2));
    if (riding) this.camPos.copy(this.goal.pos);
    else this.camPos.lerp(this.goal.pos, k);
    this.camLook.lerp(this.goal.look, riding ? Math.max(k, 0.16) : k);
    this.camUp.lerp(this.goal.up, Math.max(k, 0.2)).normalize();
    if (Math.abs(this.cam.fov - this.goal.fov) > 0.01) {
      this.cam.fov += (this.goal.fov - this.cam.fov) * k;
      this.cam.updateProjectionMatrix();
    }
    this.cam.position.copy(this.camPos);
    this.cam.up.copy(this.camUp);
    this.cam.lookAt(this.camLook);
    this.labels();
    this.renderer.render(this.world, this.cam);
    this.frames++;
    this.canvas.dataset.frames = String(this.frames);
    const away = this.camPos.distanceTo(this.goal.pos) + this.camLook.distanceTo(this.goal.look) + Math.abs(this.cam.fov - this.goal.fov) * 0.1 + this.camUp.distanceTo(this.goal.up);
    if (away > 0.02) this.raf = requestAnimationFrame(this.frame);
  };

  /** Letters, read badges and zone names hold their size on the screen, so they read from the press box and from a helmet alike. */
  private labels() {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const size = (o: THREE.Object3D, share: number, lo: number, hi: number) => {
      const base = o.userData.size as [number, number] | undefined;
      if (!base) return;
      const k = clamp((2 * o.position.distanceTo(this.camPos) * tan * share) / base[1], lo, hi);
      o.scale.set(base[0] * k, base[1] * k, 1);
    };
    for (const mv of this.movers) size(mv.chip, 0.05, 0.45, 3.4);
    for (const b of this.marks.children) size(b, 0.045, 0.9, 3.2);
    for (const z of this.zones.children) for (const c of z.children) if (c.userData.tag) size(c, 0.04, 0.8, 3);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    dispose(this.world);
    this.renderer.dispose();
  }
}

function software(r: THREE.WebGLRenderer): boolean {
  try {
    const gl = r.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

function dispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const mt of mats) {
      const map = (mt as THREE.MeshBasicMaterial).map;
      // Jersey letters are shared between players and kept for the visit.
      if (map && ![...numberCache.values()].includes(map as THREE.CanvasTexture)) map.dispose();
      mt.dispose();
    }
  });
}

/**
 * One moment of a lesson in 3D: the field, the players in uniform, the routes
 * on the grass, the zones, the read and the throw. Same inputs as `LessonField`.
 */
export function LessonField3D(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const [model, setModel] = useState<GLTF | null | "pucks">(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let st: Stage;
    try {
      st = new Stage(el, !!latest.current.light);
    } catch {
      latest.current.onFail?.("webgl");
      return;
    }
    stage.current = st;
    st.size();
    const ro = new ResizeObserver(() => {
      st.size();
      if (st.props) st.pose(latest.current);
    });
    if (el.parentElement) ro.observe(el.parentElement);
    const lost = (e: Event) => {
      e.preventDefault();
      latest.current.onFail?.("webgl");
    };
    el.addEventListener("webglcontextlost", lost);
    const again = () => st.props && st.pose(latest.current);
    // Free look and the helmet cam turn with a drag; on any camera a tap on a player picks him.
    // One finger or the mouse at a time: a second finger never joins the drag or ends it.
    let press: { id: number; x: number; y: number; moved: number } | null = null;
    const down = (e: PointerEvent) => {
      if (press) return;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      if (turnsByHand(st.shot)) el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      // The button was let go somewhere the field never heard about.
      if (e.pointerType === "mouse" && e.buttons === 0) {
        press = null;
        return;
      }
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      press = { id: press.id, x: e.clientX, y: e.clientY, moved: press.moved + Math.abs(dx) + Math.abs(dy) };
      if (!turnsByHand(st.shot)) return;
      st.turn(dx, dy);
      again();
    };
    const up = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const was = press;
      press = null;
      if (was.moved > 6) return;
      const id = st.pickAt(e.clientX, e.clientY);
      if (id) latest.current.onPick?.(id);
    };
    const cancel = (e: PointerEvent) => {
      if (press && e.pointerId === press.id) press = null;
    };
    const wheel = (e: WheelEvent) => {
      if (st.shot !== "free") return;
      e.preventDefault();
      st.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1);
      again();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("wheel", wheel, { passive: false });
    let live = true;
    loadAthlete().then(
      (g) => live && setModel(g),
      () => live && setModel("pucks"),
    );
    return () => {
      live = false;
      ro.disconnect();
      el.removeEventListener("webglcontextlost", lost);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("wheel", wheel);
      st.dispose();
      stage.current = null;
    };
  }, []);

  const { scene, lesson, dark, logo, team } = props;
  const primary = team?.primary;
  const secondary = team?.secondary;
  // Rebuilt when the play, the defense, the look or the colors change; a moment of the play only moves things.
  const build = useMemo(() => ({ scene, lesson, dark, logo, primary, secondary, model }), [scene, lesson, dark, logo, primary, secondary, model]);
  useEffect(() => {
    const st = stage.current;
    if (!st || model === null) return;
    st.model = model === "pucks" ? null : model;
    st.build(latest.current);
    st.pose(latest.current);
    st.kick(true);
    canvas.current!.dataset.athlete = model === "pucks" ? "pucks" : "model";
    canvas.current!.dataset.players = String(lesson.result.defenders.length + scene.nodes.filter((n) => n.kind === "player" && n.side !== "defense").length);
  }, [build]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const st = stage.current;
    if (st?.props) st.pose(props);
  });

  // The camera on screen, worked out the way the stage does, for the controls drawn over the picture.
  const { result } = lesson;
  const canThrow = props.step.id === "read" || !!props.ball;
  const { shot } = resolveCamera(props.camera, props.step.id, momentOf(props.t, result.throwAt, BALL_FLIGHT, canThrow));
  const nudge = (dx: number, dy: number, zoom = 1) => {
    const st = stage.current;
    if (!st?.props) return;
    st.turn(dx, dy);
    st.zoomBy(zoom);
    st.pose(latest.current);
  };
  const free = shot === "free";

  return (
    <div className="fr-3d">
      <canvas ref={canvas} role="img" aria-label={props.label} data-athlete="loading" />
      {model === null && <span className="fr-3d-wait">Loading the players…</span>}
      {shot === "qb" && canThrow && props.t > 0 && (
        <span className="fr-3d-snap" aria-hidden="true">
          Snap to pass <b>{Math.min(props.t, result.throwAt).toFixed(2)}</b>
        </span>
      )}
      {turnsByHand(shot) && (
        <div className="fr-3d-turn" role="group" aria-label="Turn the camera">
          <button type="button" aria-label="Turn left" onClick={() => nudge(free ? 40 : -60, 0)}>
            ←
          </button>
          <button type="button" aria-label="Turn right" onClick={() => nudge(free ? -40 : 60, 0)}>
            →
          </button>
          <button type="button" aria-label={free ? "Higher" : "Look up"} onClick={() => nudge(0, free ? 40 : -50)}>
            ↑
          </button>
          <button type="button" aria-label={free ? "Lower" : "Look down"} onClick={() => nudge(0, free ? -40 : 50)}>
            ↓
          </button>
          {free && (
            <>
              <button type="button" aria-label="Closer" onClick={() => nudge(0, 0, 1 / 1.2)}>
                +
              </button>
              <button type="button" aria-label="Farther" onClick={() => nudge(0, 0, 1.2)}>
                −
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

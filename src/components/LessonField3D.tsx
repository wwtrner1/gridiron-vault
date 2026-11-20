import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { luminance } from "../lib/brandData";
import { STATUS_COLOR } from "../lib/coverage";
import { fieldInset, unitsPerYard, yardLines } from "../lib/field";
import { pathData, toWorld } from "../lib/geometry";
import { pointAt } from "../lib/motion";
import { linesFor } from "../lib/teach";
import type { Lesson, StepId, TeachStep } from "../lib/teach";
import { CANVAS_H, CANVAS_W, FIRST_READ } from "../lib/types";
import type { PathNode, PlayerNode, Point, Scene } from "../lib/types";
import { LESSON_FPS, lessonInk } from "./LessonField";
import type { FilmCamera } from "../lib/film3d";

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
  /** Smaller screens: fewer pixels, no shadows. */
  light?: boolean;
  label?: string;
  /** No WebGL in this browser: the Film Room goes back to the flat field. */
  onFail?: (why: "webgl") => void;
};

/** Canvas units to the field in yards. The x axis is mirrored so the view from behind the offense matches the flat field. */
type Map3 = { upy: number; X: (x: number) => number; Z: (y: number) => number; halfW: number };
function mapFor(scene: Scene): Map3 {
  const view = scene.view === "blank" ? "half" : scene.view;
  const upy = unitsPerYard(view) || 14.4;
  const inset = fieldInset(view);
  return { upy, X: (x) => -(x - CANVAS_W / 2) / upy, Z: (y) => (scene.losY - y) / upy, halfW: (CANVAS_W / 2 - inset) / upy };
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
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.9, 20), m);
    puck.position.y = 0.95;
    root.add(puck);
    return { root, sample: () => undefined, clip: () => 1, mats, dim: (a) => ((m.transparent = a < 1), (m.opacity = a)) };
  }
  const m = cloneSkinned(model.scene) as THREE.Object3D;
  m.scale.set(YD * frame, YD, YD * frame);
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
};

/** Where the play happens on the field, in yards: every player from the snap to the end. */
type Bounds = { x0: number; x1: number; z0: number; z1: number };

/**
 * The camera spot and the point it looks at, far enough back that the whole play
 * fits the screen at its shape (a tall phone pulls the camera back).
 */
function cameraFor(kind: FilmCamera, stepId: StepId, focus: THREE.Vector2 | null, b: Bounds, aspect: number, fov: number): [THREE.Vector3, THREE.Vector3] {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const tanH = tanV * aspect;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const across = (b.x1 - b.x0) / 2 + 5;
  const deep = (b.z1 - b.z0) / 2 + 4;
  /** Looking at a point from an angle above the grass, back far enough to fit `wide` across and `long` up the field. */
  const from = (at: THREE.Vector3, elev: number, wide: number, long: number, dir: THREE.Vector2 = new THREE.Vector2(0, -1)) => {
    const e = THREE.MathUtils.degToRad(elev);
    const d = Math.max(10, wide / tanH, (long * Math.sin(e)) / tanV + long * Math.cos(e) * 0.35);
    return [new THREE.Vector3(at.x + dir.x * Math.cos(e) * d, Math.sin(e) * d, at.z + dir.y * Math.cos(e) * d), at] as [THREE.Vector3, THREE.Vector3];
  };
  const mid = new THREE.Vector3(cx, 0, cz);
  if (kind === "sideline") return from(new THREE.Vector3(cx, 0, cz), 34, deep, across, new THREE.Vector2(-1, 0));
  if (kind === "overhead") return from(mid, 82, across, deep);
  if (kind === "auto") {
    if (stepId === "look" || stepId === "zones") return from(mid, 52, across, deep);
    if (stepId === "job" && focus) return from(new THREE.Vector3(focus.x, 0, focus.y + 3), 42, 14, 14);
  }
  // Behind the offense: the quarterback's side of the ball, looking downfield.
  return from(new THREE.Vector3(cx, 0, cz + 1), 34, across, deep);
}

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
  private camGoal: [THREE.Vector3, THREE.Vector3] = [this.camPos.clone(), this.camLook.clone()];
  private raf = 0;
  private last = 0;
  private still: boolean;
  frames = 0;
  model: GLTF | null = null;
  map: Map3 | null = null;
  props: Props | null = null;
  inkKey = "";
  bounds: Bounds = { x0: -10, x1: 10, z0: -6, z1: 18 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    light: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    // A browser drawing WebGL without a graphics card (software rendering) gets the cheap picture: no shadows, one pixel a pixel.
    const soft = software(this.renderer);
    if (soft) light = true;
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
    this.world.fog = new THREE.Fog(dark ? "#08111d" : "#cfe2f1", 70, 190);
    this.hemi.color.set(dark ? "#b9d3f5" : "#e6f2ff");
    this.hemi.groundColor.set(dark ? "#16301c" : "#2b4a2a");
    this.hemi.intensity = dark ? 0.85 : 1.1;
    this.sun.color.set(dark ? "#f4f8ff" : "#fff3dc");
    this.sun.intensity = dark ? 2.4 : 2.3;
    this.sun.position.set(-30, 55, -20);
    this.sun.target.position.set(0, 0, 8);
    this.renderer.toneMappingExposure = dark ? 1.08 : 1.0;
  }

  /** Paints the field in canvas units, then lays it on the grass with matching corners. */
  private field(scene: Scene, m: Map3, dark: boolean, logo?: string) {
    const view = scene.view === "blank" ? "half" : scene.view;
    const inset = fieldInset(view);
    const S = 2;
    const c = document.createElement("canvas");
    c.width = CANVAS_W * S;
    c.height = CANVAS_H * S;
    const g = c.getContext("2d")!;
    g.scale(S, S);
    const grass = dark ? ["#1d5a2c", "#1a5228"] : ["#3f8a3a", "#3a8035"];
    g.fillStyle = dark ? "#123a1d" : "#2f6d2c";
    g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const lines = yardLines(scene.view, scene.losY);
    // Mowing stripes every five yards, out from the line of scrimmage.
    const five = m.upy * 5;
    for (let y = scene.losY, k = 0; y > -five; y -= five, k++) {
      g.fillStyle = grass[k % 2];
      g.fillRect(inset, y - five, CANVAS_W - inset * 2, five);
    }
    for (let y = scene.losY, k = 1; y < CANVAS_H + five; y += five, k++) {
      g.fillStyle = grass[k % 2];
      g.fillRect(inset, y, CANVAS_W - inset * 2, five);
    }
    g.strokeStyle = "rgba(255,255,255,.92)";
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(inset, 0);
    g.lineTo(inset, CANVAS_H);
    g.moveTo(CANVAS_W - inset, 0);
    g.lineTo(CANVAS_W - inset, CANVAS_H);
    g.stroke();
    g.lineWidth = 1.6;
    g.fillStyle = "rgba(255,255,255,.85)";
    g.font = `700 ${Math.round(m.upy * 2.2)}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const l of lines) {
      g.strokeStyle = "rgba(255,255,255,.75)";
      g.beginPath();
      g.moveTo(inset, l.y);
      g.lineTo(CANVAS_W - inset, l.y);
      g.stroke();
      if (l.yards % 10 === 0 && l.y < scene.losY) {
        // Numbers read from behind the offense, the way the camera sees the field.
        for (const x of [inset + m.upy * 4, CANVAS_W - inset - m.upy * 4]) {
          g.fillText(String(l.yards), x, l.y - m.upy * 1.4);
        }
      }
    }
    g.strokeStyle = "#3FD3EE";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(inset, scene.losY);
    g.lineTo(CANVAS_W - inset, scene.losY);
    g.stroke();
    const tex = canvasTexture(c);
    const geo = new THREE.BufferGeometry();
    const corners: [number, number][] = [
      [0, 0],
      [CANVAS_W, 0],
      [0, CANVAS_H],
      [CANVAS_W, CANVAS_H],
    ];
    geo.setAttribute("position", new THREE.Float32BufferAttribute(corners.flatMap(([x, y]) => [m.X(x), 0, m.Z(y)]), 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(corners.flatMap(([x, y]) => [x / CANVAS_W, 1 - y / CANVAS_H]), 2));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const turf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    turf.receiveShadow = true;
    this.fixed.add(turf);
    const around = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: dark ? "#0d2414" : "#2a5a28", roughness: 1 }));
    around.rotation.x = -Math.PI / 2;
    around.position.y = -0.02;
    around.receiveShadow = true;
    this.fixed.add(around);
    if (logo) {
      const img = new Image();
      img.onload = () => {
        const s = 140 / m.upy;
        const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(this.logoCanvas(img)), transparent: true, opacity: 0.28, depthWrite: false });
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat);
        plate.rotation.x = -Math.PI / 2;
        plate.rotation.z = Math.PI;
        plate.position.set(0, 0.01, m.Z(Math.max(20, scene.losY - 330) + 70));
        this.fixed.add(plate);
        this.kick(true);
      };
      img.src = logo;
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
    this.field(p.scene, m, p.dark, p.logo);

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

    const bx: number[] = [];
    const bz: number[] = [];
    for (const mv of this.movers) {
      bx.push(mv.start.x);
      bz.push(mv.start.y);
      for (let i = 0; i < mv.track.length; i += 6) {
        bx.push(m.X(mv.track[i].x));
        bz.push(m.Z(mv.track[i].y));
      }
    }
    if (bx.length) this.bounds = { x0: Math.min(...bx), x1: Math.max(...bx), z0: Math.min(...bz), z1: Math.max(...bz) };

    // Zones: the flat field's ellipses, laid on the grass, cyan underneath and gold deep.
    result.defenders.forEach((d, di) => {
      if (!d.landmark || !d.reach) return;
      const deep = !!p.lesson.jobs[di]?.deep;
      const color = deep ? "#FFD23F" : "#3FD3EE";
      const cx = m.X(d.landmark.x);
      const cz = m.Z(d.landmark.y);
      const rx = d.reach.rx / 1.15 / m.upy;
      const rz = d.reach.ry / 2.4 / m.upy;
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
      label.userData.tag = true;
      zone.add(disc, ring, label);
      this.zones.add(zone);
    });
    this.inkKey = "";
  }

  private add(o: { id: string; letter: string; side: "offense" | "defense"; zone: boolean; track: Point[]; kit: Kit; frame: number; fill: string; start: Point }) {
    const m = this.map!;
    const body = makeBody(this.model, o.kit, o.frame);
    const dark = this.props?.dark ?? true;
    const ink = o.side === "defense" ? (dark ? "#FF8A7A" : "#9E3428") : lum(o.fill) > 0.55 ? NAVY : "#ffffff";
    const c = chip(o.letter, o.fill, ink, o.side === "defense" ? "#9E3428" : "#ffffff");
    c.scale.set(1.05, 1.05, 1);
    const run = [0];
    for (let i = 1; i < o.track.length; i++) run.push(run[i - 1] + Math.hypot(o.track[i].x - o.track[i - 1].x, o.track[i].y - o.track[i - 1].y) / m.upy);
    const mover: Mover = { id: o.id, body, chip: c, ring: null, track: o.track, run, side: o.side, letter: o.letter.toUpperCase(), zone: o.zone, start: new THREE.Vector2(m.X(o.start.x), m.Z(o.start.y)) };
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
      const width = Math.max(0.32, (n.width * 2) / m.upy) * (bold ? 1.6 : 1) * (first && id === "call" ? 1.25 : 1);
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
    const thrown = id === "read" && p.t >= result.throwAt;
    const status = new Map(id === "read" ? result.rows.map((r) => [r.id, r.status]) : []);
    let focus: THREE.Vector2 | null = null;
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
      const f = Math.min(mv.run.length - 1, Math.max(0, now * FPS));
      const i = Math.floor(f);
      const dist = mv.run.length ? mv.run[i] + ((mv.run[Math.min(mv.run.length - 1, i + 1)] ?? mv.run[i]) - mv.run[i]) * (f - i) : 0;
      const entries: [string, number, number][] = [];
      const w = clamp(speed / 4, 0, 1);
      if (p.t <= 0.02 || speed < 0.3) entries.push([now > 0 ? "Idle" : "Ready", 0.5, 1]);
      else {
        const stride = backpedal ? 1.6 : 2.6;
        entries.push([backpedal ? "Backpedal" : "Sprint", (dist / stride) % 1, w], ["Ready", 0.5, 1 - w]);
      }
      if (mv.side === "offense" && mv.letter === "Q") {
        const dur = mv.body.clip("Throw");
        const ph = (p.t - result.throwAt) / dur + 0.55;
        if (ph > 0 && ph < 1 && p.t > 0) entries.splice(0, entries.length, ["Throw", ph, 1]);
        qbHand = new THREE.Vector3(pos.x, 2.0, pos.y);
      }
      if (result.target && mv.id === result.target.id) {
        targetAt = new THREE.Vector3(pos.x, 1.4, pos.y);
        const dur = mv.body.clip("Catch");
        const ph = (p.t - result.throwAt - BALL_FLIGHT) / dur + 0.45;
        if (id === "read" && ph > 0 && ph < 1) entries.splice(0, entries.length, ["Catch", ph, 1]);
      }
      mv.body.sample(entries);
      const dimmed = id === "job" && (mv.side === "defense" || mv.letter !== p.who);
      mv.body.dim(dimmed ? 0.3 : 1);
      if (id === "job" && mv.side === "offense" && mv.letter === p.who) focus = pos.clone();
      mv.chip.position.set(pos.x, 2.75, pos.y);
      (mv.chip.material as THREE.SpriteMaterial).opacity = dimmed ? 0.3 : 1;
      const s = thrown ? status.get(mv.id) : undefined;
      if (s) {
        if (!mv.ring) {
          mv.ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.25, 40), new THREE.MeshBasicMaterial({ color: STATUS_COLOR[s], transparent: true, opacity: 0.95, depthWrite: false }));
          mv.ring.rotation.x = -Math.PI / 2;
          this.world.add(mv.ring);
        }
        (mv.ring.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[s]);
        mv.ring.position.set(pos.x, 0.06, pos.y);
        mv.ring.visible = true;
      } else if (mv.ring) mv.ring.visible = false;
    }

    // Read order: gold badges where each route ends.
    this.clearGroup(this.marks);
    if (id === "read")
      for (const r of result.rows) {
        const b = chip(String(r.read), GOLD, NAVY, NAVY);
        b.scale.set(0.95, 0.95, 1);
        b.position.set(m.X(r.end.x), 3.2, m.Z(r.end.y));
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

    // The camera follows the lesson, or holds the spot the coach picked.
    const [pos, look] = cameraFor(p.camera, id, focus, this.bounds, this.cam.aspect, this.cam.fov);
    this.camGoal = [pos, look];
    this.canvas.dataset.camera = p.camera === "auto" ? `auto:${id}` : p.camera;
    this.kick(false);
  }

  /** Draws now, and keeps drawing while the camera is still on its way. */
  kick(snap: boolean) {
    if (snap || this.still) {
      this.camPos.copy(this.camGoal[0]);
      this.camLook.copy(this.camGoal[1]);
    }
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-dt * 3.2);
    this.camPos.lerp(this.camGoal[0], k);
    this.camLook.lerp(this.camGoal[1], k);
    this.cam.position.copy(this.camPos);
    this.cam.lookAt(this.camLook);
    this.renderer.render(this.world, this.cam);
    this.frames++;
    this.canvas.dataset.frames = String(this.frames);
    const away = this.camPos.distanceTo(this.camGoal[0]) + this.camLook.distanceTo(this.camGoal[1]);
    if (away > 0.02) this.raf = requestAnimationFrame(this.frame);
  };

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
    let live = true;
    loadAthlete().then(
      (g) => live && setModel(g),
      () => live && setModel("pucks"),
    );
    return () => {
      live = false;
      ro.disconnect();
      el.removeEventListener("webglcontextlost", lost);
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

  return (
    <div className="fr-3d">
      <canvas ref={canvas} role="img" aria-label={props.label} data-athlete="loading" />
      {model === null && <span className="fr-3d-wait">Loading the players…</span>}
    </div>
  );
}

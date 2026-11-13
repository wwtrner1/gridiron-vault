import { useSyncExternalStore } from "react";
import type { PhotoRead } from "./photo";
import type { Jpeg, ScanBox } from "./scan";

/**
 * The scan being read, kept outside the review screen (Wes, 2026-11-13): a
 * coach who leaves Upload while pages are being found or plays read keeps
 * the job running, and the plays wait here until they come back, or go
 * straight to the Vault marked "Needs a check" when they asked for that.
 * It lives for the visit (a closed tab loses it; the bar warns before that).
 * Type-only imports, so the bar in `App.tsx` adds nothing heavy to the first download.
 */
export type ScanFormat = "vault" | "photo";

export type ScanItem = {
  id: string;
  page: number;
  box: ScanBox;
  crop: Jpeg;
  state: "found" | "reading" | "read" | "failed" | "empty";
  read?: PhotoRead;
  /** The read as it came back, before the coach's fixes (what the reader learns from). */
  original?: PhotoRead;
  /** The coach checked and fixed it (green check). */
  checked?: boolean;
  keep: boolean;
  name: string;
  format: ScanFormat;
};
export type ScanPage = { n: number; url: string; aspect: number; reason?: string; error?: string };
export type ScanPhase =
  | { kind: "opening" }
  | { kind: "finding"; page: number; of: number }
  | { kind: "ready" }
  | { kind: "saved"; count: number; book?: string }
  | { kind: "error"; text: string; plans?: boolean };

export type ScanJob = {
  id: string;
  files: File[];
  started: boolean;
  phase: ScanPhase;
  pages: ScanPage[];
  items: ScanItem[];
  note: string;
  reading: boolean;
  /** Read every kept play when the pages are found, then save them to the Vault to check there. */
  toVault: boolean;
  /** A single photo with one play goes to the one-play review instead. */
  single?: File;
  /** Where the plays file: "new", "none" or a playbook id; and the new playbook's name. */
  target: string;
  newName: string;
};

export const scanLabel = (files: File[]) => (files.length === 1 ? files[0].name : `${files.length} scanned pages`);
export const scanBookName = (files: File[]) => (files.length === 1 ? files[0].name.replace(/\.[a-z0-9]+$/i, "") : "Scanned plays");

let job: ScanJob | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const scanJob = {
  get: () => job,
  start(files: File[]): ScanJob {
    job = {
      id: `scan-${Date.now().toString(36)}`,
      files,
      started: false,
      phase: { kind: "opening" },
      pages: [],
      items: [],
      note: "",
      reading: false,
      toVault: false,
      target: "new",
      newName: scanBookName(files),
    };
    emit();
    return job;
  },
  /** Changes the job only while it is still the current one, so a cleared job's runner writes nowhere. */
  set(id: string, patch: Partial<ScanJob> | ((j: ScanJob) => Partial<ScanJob>)) {
    if (!job || job.id !== id) return false;
    job = { ...job, ...(typeof patch === "function" ? patch(job) : patch) };
    emit();
    return true;
  },
  item(id: string, itemId: string, patch: Partial<ScanItem>) {
    return scanJob.set(id, (j) => ({ items: j.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }));
  },
  live: (id: string) => job?.id === id,
  clear() {
    job = null;
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useScanJob = () => useSyncExternalStore(scanJob.subscribe, scanJob.get, scanJob.get);

export const scanBusy = (j: ScanJob | null) => !!j && (j.phase.kind === "opening" || j.phase.kind === "finding" || j.reading);

/* -------------------------------------------- scanned plays in the Vault */

/** Tag on a scanned play saved without the coach checking it. */
export const TO_CHECK = "to-check";
/** Tag once the coach checked it (in the review or by saving it in the Designer). */
export const CHECKED = "checked";

/** The tags a play saves with once the coach has looked it over: "to-check" becomes "checked". */
export const markChecked = (tags: string[]) => (tags.includes(TO_CHECK) ? [...tags.filter((t) => t !== TO_CHECK), CHECKED] : tags);

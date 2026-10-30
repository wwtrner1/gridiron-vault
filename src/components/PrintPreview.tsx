import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { jsPDF } from "jspdf";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { coachError } from "../lib/api";
import { printRules } from "../lib/printMode";

/** Pages turned into pictures: a blob URL each and the page's size in inches. */
type Pages = { urls: string[]; sizes: { w: number; h: number }[]; total: number };

/** Most pages a preview draws; a longer PDF still downloads and prints whole from the PDF itself. */
const MAX_PAGES = 40;

async function pictures(doc: jsPDF, dpi: number, maxPages = MAX_PAGES): Promise<Pages> {
  const { renderPdf } = await import("../lib/scanPdf");
  const data = new Uint8Array(doc.output("arraybuffer"));
  const first = doc.internal.pageSize;
  const edge = Math.max(first.getWidth(), first.getHeight(), 11) * dpi;
  const { pages, sizes, total } = await renderPdf(data, maxPages, edge);
  const urls = await Promise.all(
    pages.map(
      (c) =>
        new Promise<string>((resolve, reject) =>
          c.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("The preview page could not be drawn."))), "image/png"),
        ),
    ),
  );
  return { urls, sizes: sizes.map((s) => ({ w: s.w / 72, h: s.h / 72 })), total };
}

const drop = (p: Pages | null) => p?.urls.forEach((u) => URL.revokeObjectURL(u));

type PdfProps = {
  title: string;
  /** Builds the PDF exactly as Download saves it, so the preview is the print. */
  build: () => Promise<jsPDF>;
  /** File name for Download, with .pdf. */
  filename: string;
  /** Problems to fix before printing (cut-off players or routes), shown above the pages. */
  warnings?: React.ReactNode;
  /** A line under the title, e.g. "Print at Actual size (100%)". */
  note?: string;
  /** After a download or print, e.g. to count the export. */
  onDone?: (how: "download" | "print") => void;
  onClose: () => void;
};

/**
 * Print preview of a PDF before it downloads or prints: the real file, drawn
 * page by page by PDF.js, so what the coach sees is exactly what the printer
 * gets. Print sends the same pages to the browser's print dialog on paper of
 * the page's own size, so nothing is scaled.
 */
export function PdfPreview({ title, build, filename, warnings, note, onDone, onClose }: PdfProps) {
  const [doc, setDoc] = useState<jsPDF | null>(null);
  const [pages, setPages] = useState<Pages | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [actual, setActual] = useState(false);
  const [printing, setPrinting] = useState<Pages | null>(null);
  const live = useRef(true);
  const shown = useRef<Pages | null>(null);

  useEffect(() => {
    live.current = true;
    (async () => {
      try {
        const made = await build();
        if (!live.current) return;
        setDoc(made);
        const pics = await pictures(made, 150);
        if (!live.current) return drop(pics);
        shown.current = pics;
        setPages(pics);
      } catch (e) {
        console.error("Print preview failed", e);
        if (live.current) setProblem(coachError(e, "The preview could not be drawn. Download the PDF instead, or try again."));
      }
    })();
    return () => {
      live.current = false;
      drop(shown.current);
    };
    // The preview draws once per opening; closing and opening again picks up new settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Print: full-resolution pages in a print-only layer, one sheet of paper per page at the page's own size.
  useEffect(() => {
    if (!printing) return;
    const done = () => {
      drop(printing);
      setPrinting(null);
    };
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 250);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  async function print() {
    if (!doc) return;
    try {
      setPrinting(await pictures(doc, 300, Number.MAX_SAFE_INTEGER));
      onDone?.("print");
    } catch (e) {
      setProblem(coachError(e, "The pages could not be sent to the printer. Download the PDF and print it from there."));
    }
  }

  function download() {
    if (!doc) return;
    doc.save(filename);
    onDone?.("download");
  }

  const more = pages && pages.total > pages.urls.length ? pages.total - pages.urls.length : 0;
  return (
    <Modal
      title={`Print preview · ${title}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-ghost" onClick={download} disabled={!doc}>
            <Icon name="download" size={15} /> Download PDF
          </button>
          <button type="button" className="btn btn-primary" onClick={print} disabled={!pages || !!printing}>
            <Icon name="print" size={15} /> {printing ? "Opening print…" : "Print"}
          </button>
        </>
      }
    >
      <div className="pp">
        <div className="pp-bar">
          <p className="pp-note">
            {pages
              ? `${pages.total} ${pages.total === 1 ? "page" : "pages"}, exactly as ${pages.total === 1 ? "it prints" : "they print"}.`
              : problem
                ? ""
                : "Building the pages…"}
            {note ? ` ${note}` : ""}
          </p>
          <label className="switch">
            <input type="checkbox" checked={actual} onChange={(e) => setActual(e.target.checked)} />
            Actual size
          </label>
        </div>
        {warnings}
        {problem && (
          <p className="pp-problem" role="alert">
            {problem}
          </p>
        )}
        <div className={`pp-pages${actual ? " is-actual" : ""}`} aria-busy={!pages && !problem}>
          {!pages && !problem && <div className="pp-wait" aria-hidden="true" />}
          {pages?.urls.map((u, i) => (
            <figure key={u} className="pp-page" style={{ width: actual ? `${pages.sizes[i].w}in` : undefined, aspectRatio: `${pages.sizes[i].w} / ${pages.sizes[i].h}` }}>
              <img src={u} alt={`Page ${i + 1} of ${pages.total}`} />
              <figcaption>
                Page {i + 1} · {fmt(pages.sizes[i].w)} × {fmt(pages.sizes[i].h)} in
              </figcaption>
            </figure>
          ))}
          {more > 0 && <p className="pp-note">{more} more {more === 1 ? "page is" : "pages are"} in the PDF; Download or Print gives you every page.</p>}
        </div>
      </div>
      {printing && <PrintLayer pages={printing} />}
    </Modal>
  );
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** The pages as the printer gets them, hidden on screen; named @page rules give each its own paper size and no margin. */
function PrintLayer({ pages }: { pages: Pages }) {
  const css = pages.sizes.map((s, i) => `@page pp-${i} { size: ${s.w}in ${s.h}in; margin: 0; }`).join("\n");
  return createPortal(
    <div className="pp-print" aria-hidden="true">
      <style>{css}</style>
      {pages.urls.map((u, i) => (
        <img key={u} src={u} alt="" style={{ page: `pp-${i}`, width: `${pages.sizes[i].w}in`, height: `${pages.sizes[i].h}in` } as React.CSSProperties} />
      ))}
    </div>,
    document.body,
  );
}

type PageProps = {
  /** What is printing, for the bar ("Practice script"). */
  title: string;
  /** Wide pages (the Call Sheet) preview on landscape paper. */
  landscape?: boolean;
  onClose: () => void;
};

/**
 * Print preview of a page that prints itself (Call Sheet, Practice,
 * Assignments, roster, depth chart, schedule): the page's own print styles
 * are put on screen inside a sheet of paper, with Print and Close in a bar
 * above it. Print opens the browser's dialog; after it, or on Close, the page comes back.
 */
export function PagePreview({ title, landscape, onClose }: PageProps) {
  const printBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const style = document.createElement("style");
    style.dataset.printPreview = "";
    style.textContent = printRules();
    document.head.appendChild(style);
    root.classList.add("is-print-preview");
    if (landscape) root.classList.add("is-print-landscape");
    const scroll = window.scrollY;
    window.scrollTo(0, 0);
    const opener = document.activeElement as HTMLElement | null;
    printBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Printed (or cancelled in the dialog): back to the page.
    window.addEventListener("afterprint", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("afterprint", onClose);
      style.remove();
      root.classList.remove("is-print-preview", "is-print-landscape");
      window.scrollTo(0, scroll);
      opener?.focus?.();
    };
  }, [landscape, onClose]);

  return createPortal(
    <div className="pp-pagebar" role="dialog" aria-label={`Print preview: ${title}`}>
      <div>
        <b>Print preview · {title}</b>
        <span>This is what prints, on {landscape ? "landscape" : "portrait"} letter paper. Long pages carry on to the next sheet.</span>
      </div>
      <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
        Close
      </button>
      <button ref={printBtn} type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
        <Icon name="print" size={14} /> Print
      </button>
    </div>,
    document.body,
  );
}

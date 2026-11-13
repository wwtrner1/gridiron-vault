import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { scanBusy, scanJob, scanLabel, useScanJob } from "../lib/scanJob";

/**
 * A scan keeps reading while the coach works elsewhere (lib/scanJob.ts).
 * This bar, on every screen but Upload, says how far it has got and takes
 * them back to the review, or to the Vault once the plays went there. It
 * also asks before the tab closes while plays are being read or wait unsaved.
 */
export function ScanJobBar() {
  const job = useScanJob();
  const { pathname } = useLocation();
  const busy = scanBusy(job);
  const waiting = !!job && job.items.some((it) => it.state === "read" && it.keep) && job.phase.kind !== "saved";

  useEffect(() => {
    if (!busy && !waiting) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, waiting]);

  if (!job || pathname === "/upload" || job.single) return null;
  const label = scanLabel(job.files);
  const kept = job.items.filter((it) => it.keep && it.state !== "empty");
  const read = kept.filter((it) => it.state === "read").length;

  let text: string;
  let to = "/upload";
  let go = "Back to the review";
  if (job.phase.kind === "saved") {
    text = `${job.phase.count} scanned ${job.phase.count === 1 ? "play" : "plays"} went to your Vault${job.phase.book ? ` in ${job.phase.book}` : ""}, marked Needs a check.`;
    to = "/vault";
    go = "Open the Vault";
  } else if (job.phase.kind === "opening") text = `Opening ${label}…`;
  else if (job.phase.kind === "finding") text = `Finding plays in ${label}: page ${job.phase.page} of ${job.phase.of}…`;
  else if (job.reading) text = `Reading plays from ${label}: ${read} of ${kept.length} read${job.toVault ? ". They go to your Vault when done." : "…"}`;
  else if (job.phase.kind === "error") text = `The scan of ${label} stopped.`;
  else text = read ? `${read} ${read === 1 ? "play" : "plays"} from ${label} ${read === 1 ? "is" : "are"} read and waiting for you.` : `${kept.length} plays found in ${label}, ready to read.`;

  return (
    <div className="scan-bar" role="status" aria-live="polite">
      {busy && <span className="scan-bar-dot" aria-hidden="true" />}
      <span>{text}</span>
      <Link to={to} className="btn btn-ghost btn-sm" onClick={() => job.phase.kind === "saved" && scanJob.clear()}>
        {go}
      </Link>
      {job.phase.kind === "saved" && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => scanJob.clear()} aria-label="Dismiss">
          Dismiss
        </button>
      )}
    </div>
  );
}

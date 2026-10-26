import type { ReactNode } from "react";
import { FORMAT_PARTS, formatStore, usePlayFormat } from "../lib/playFormat";
import type { FormatPart } from "../lib/playFormat";

/**
 * The saved play format, from the Grid1ron Design canvas: where it came
 * from, and which parts carry over (Colors, Player fills, Letters, Line
 * style, Field). Each screen adds its own actions underneath.
 */
export function FormatPanel({ dark = false, children }: { dark?: boolean; children?: ReactNode }) {
  const { format, parts } = usePlayFormat();
  const toggle = (id: FormatPart) =>
    formatStore.setParts(parts.includes(id) ? parts.filter((p) => p !== id) : [...parts, id]);

  return (
    <div className={`pf${dark ? " pf-dark" : ""}`}>
      <p className="pf-from">
        {format ? (
          <>
            From <b>{format.sourceName}</b>
          </>
        ) : (
          "No format saved yet. Open the play that looks right and save its format."
        )}
      </p>
      <div className="pf-parts" role="group" aria-label="Parts of the format to copy">
        {FORMAT_PARTS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip${parts.includes(p.id) ? " is-on" : ""}`}
            aria-pressed={parts.includes(p.id)}
            title={p.hint}
            onClick={() => toggle(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

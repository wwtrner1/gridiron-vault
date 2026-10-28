import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Tooltip } from "./Tooltip";
import { useStore } from "../lib/store";
import { loadWork, workTabs, type WorkTabId } from "../lib/workTabs";

type Props = {
  current: WorkTabId;
  /** "dark" sits in the Designer's top bar; "light" under a Shell page's top bar. */
  tone?: "dark" | "light";
  /** The Designer saves unsaved changes before it leaves, so it takes over the click. */
  onGo?: (href: string) => void;
};

/**
 * Tabs between the pages a coach works across in one sitting: the Designer,
 * the playbook, its wristbands and the Call Sheet. Each tab keeps
 * the playbook and Call Sheet the coach was last on (lib/workTabs.ts). They
 * are links, so the browser's back button and new tabs work as usual.
 */
export function WorkTabs({ current, tone = "light", onGo }: Props) {
  const books = useStore((s) => s.playbooks);
  const sheets = useStore((s) => s.sheets);
  const plays = useStore((s) => s.plays);
  const playIds = useMemo(() => new Set(plays.map((p) => p.id)), [plays]);
  // Read on every render: the Designer and Call Sheet write the context as the coach moves around.
  const tabs = workTabs(loadWork(), books, sheets, playIds);

  return (
    <nav className={`worktabs is-${tone}`} aria-label="Work tabs">
      {tabs.map((t) => (
        <Tooltip key={t.id} title={t.label} hint={t.hint} side="bottom">
          <Link
            to={t.href}
            className={t.id === current ? "is-on" : ""}
            aria-current={t.id === current ? "page" : undefined}
            onClick={(e) => {
              if (t.id === current) {
                e.preventDefault();
                return;
              }
              if (!onGo || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onGo(t.href);
            }}
          >
            {t.label}
          </Link>
        </Tooltip>
      ))}
    </nav>
  );
}

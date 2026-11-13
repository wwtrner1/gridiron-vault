import { Link } from "react-router-dom";
import { Tooltip } from "./Tooltip";

const TABS = [
  { to: "/practice", id: "plan", label: "Practice plan", hint: "Tonight's timed script with plays and drills in every period." },
  { to: "/drills", id: "drills", label: "Drill Vault", hint: "Drills with animated diagrams, coaching points and film. Add your own." },
] as const;

/** Tabs between the practice script and the Drill Vault, under the Shell top bar. */
export function PracticeTabs({ current }: { current: "plan" | "drills" }) {
  return (
    <nav className="worktabs is-light" aria-label="Practice tabs">
      {TABS.map((t) => (
        <Tooltip key={t.id} title={t.label} hint={t.hint} side="bottom">
          <Link to={t.to} className={t.id === current ? "is-on" : ""} aria-current={t.id === current ? "page" : undefined}>
            {t.label}
          </Link>
        </Tooltip>
      ))}
    </nav>
  );
}

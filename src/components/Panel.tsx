import { createContext, useContext, useId, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

type Props = {
  title: string;
  /** Names the panel inside a PanelGroup when its title changes (the picked element's name). */
  id?: string;
  icon?: string;
  count?: number | string;
  /** A short summary of the current setting, shown on the head while the panel is closed. */
  hint?: string;
  /** Marks the head when something inside needs a look (a warning). The words are read by screen readers. */
  alert?: string;
  defaultOpen?: boolean;
  dense?: boolean;
  children: React.ReactNode;
};

type Group = { open: string | null; toggle: (id: string) => void };
const GroupContext = createContext<Group | null>(null);

/**
 * Panels that fold as one (Wes, 2026-11-21, every page and every Vault): all
 * start closed and opening one closes the others. The open one is kept while
 * the group stays on screen, so picking another element keeps the same
 * section open. A page that needs to open a section itself (a warning that
 * points at one) passes `open` and `onOpenChange` and owns the state.
 */
export function PanelGroup({
  children,
  initial = null,
  open: controlled,
  onOpenChange,
}: {
  children: ReactNode;
  initial?: string | null;
  open?: string | null;
  onOpenChange?: (id: string | null) => void;
}) {
  const [own, setOwn] = useState<string | null>(initial);
  const open = controlled !== undefined ? controlled : own;
  const toggle = (id: string) => {
    const next = open === id ? null : id;
    setOwn(next);
    onOpenChange?.(next);
  };
  return <GroupContext.Provider value={{ open, toggle }}>{children}</GroupContext.Provider>;
}

/** Foldable tool drawer. Groups related controls so the rail stays readable. */
export function Panel({ title, id, icon, count, hint, alert, defaultOpen = true, dense, children }: Props) {
  const group = useContext(GroupContext);
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const key = id ?? title;
  const open = group ? group.open === key : ownOpen;
  const toggle = () => (group ? group.toggle(key) : setOwnOpen((v) => !v));
  const bodyId = useId();
  return (
    <section className={`panel${open ? " is-open" : ""}${dense ? " is-dense" : ""}`} data-panel={key}>
      <button type="button" className="panel-head" onClick={toggle} aria-expanded={open} aria-controls={bodyId}>
        {icon && <Icon name={icon} size={15} />}
        <span>{title}</span>
        {hint && !open && <em className="panel-hint">{hint}</em>}
        {alert && <i className="panel-alert" role="img" aria-label={alert} title={alert} />}
        {count !== undefined && <b className="panel-count">{count}</b>}
        <Icon name="chevron" size={15} className="panel-caret" />
      </button>
      <div className="panel-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

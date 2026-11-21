import { createContext, useContext, useId, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

type Props = {
  title: string;
  /** Names the panel inside a PanelGroup when its title changes (the picked element's name). */
  id?: string;
  icon?: string;
  count?: number | string;
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
 * section open.
 */
export function PanelGroup({ children, initial = null }: { children: ReactNode; initial?: string | null }) {
  const [open, setOpen] = useState<string | null>(initial);
  return <GroupContext.Provider value={{ open, toggle: (id) => setOpen((o) => (o === id ? null : id)) }}>{children}</GroupContext.Provider>;
}

/** Foldable tool drawer. Groups related controls so the rail stays readable. */
export function Panel({ title, id, icon, count, defaultOpen = true, dense, children }: Props) {
  const group = useContext(GroupContext);
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const key = id ?? title;
  const open = group ? group.open === key : ownOpen;
  const toggle = () => (group ? group.toggle(key) : setOwnOpen((v) => !v));
  const bodyId = useId();
  return (
    <section className={`panel${open ? " is-open" : ""}${dense ? " is-dense" : ""}`}>
      <button type="button" className="panel-head" onClick={toggle} aria-expanded={open} aria-controls={bodyId}>
        {icon && <Icon name={icon} size={15} />}
        <span>{title}</span>
        {count !== undefined && <b className="panel-count">{count}</b>}
        <Icon name="chevron" size={15} className="panel-caret" />
      </button>
      <div className="panel-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

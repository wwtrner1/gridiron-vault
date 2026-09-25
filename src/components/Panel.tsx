import { useId, useState } from "react";
import { Icon } from "./Icon";

type Props = {
  title: string;
  icon?: string;
  count?: number | string;
  defaultOpen?: boolean;
  dense?: boolean;
  children: React.ReactNode;
};

/** Foldable tool drawer. Groups related controls so the rail stays readable. */
export function Panel({ title, icon, count, defaultOpen = true, dense, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className={`panel${open ? " is-open" : ""}${dense ? " is-dense" : ""}`}>
      <button type="button" className="panel-head" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={bodyId}>
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

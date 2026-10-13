import { cloneElement, useEffect, useId, useRef, useState } from "react";

type Props = {
  title: string;
  hint?: string;
  shortcut?: string;
  side?: "right" | "top" | "bottom";
  children: React.ReactElement<Record<string, unknown>>;
};

/**
 * Hover/focus coach-mark. Every tool explains what it is and how it is used,
 * so nobody has to guess what an icon does. The hint is wired to the control
 * with aria-describedby, so it reads out on keyboard focus too.
 */
export function Tooltip({ title, hint, shortcut, side = "right", children }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    if (side === "right") setPos({ top: r.top + r.height / 2, left: r.right + 12 });
    else if (side === "top") setPos({ top: r.top - 12, left: r.left + r.width / 2 });
    else setPos({ top: r.bottom + 12, left: r.left + r.width / 2 });
    setOpen(true);
  };

  // Escape dismisses the hint without moving focus off the tool.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // On a touch screen a tap would leave the hint stuck open over the tools, so
  // fingers get it from a long press instead, and it clears itself.
  const press = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(press.current), []);

  return (
    <span
      ref={ref}
      className="tip-anchor"
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        window.clearTimeout(press.current);
        press.current = window.setTimeout(() => {
          show();
          press.current = window.setTimeout(() => setOpen(false), 2600);
        }, 480);
      }}
      onPointerUp={(e) => e.pointerType !== "mouse" && !open && window.clearTimeout(press.current)}
      onPointerCancel={() => window.clearTimeout(press.current)}
      onFocusCapture={(e) => (e.target as Element).matches?.(":focus-visible") && show()}
      onBlurCapture={() => setOpen(false)}
    >
      {cloneElement(children, { "aria-describedby": open ? id : undefined })}
      {open && (
        <span role="tooltip" id={id} className={`tip tip-${side}`} style={{ top: pos.top, left: pos.left }}>
          <strong>
            {title}
            {shortcut && <kbd>{shortcut}</kbd>}
          </strong>
          {hint && <em>{hint}</em>}
        </span>
      )}
    </span>
  );
}

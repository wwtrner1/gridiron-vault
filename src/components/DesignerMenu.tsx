import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FocusPopover } from "./FocusBoundary";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

export type MenuId = "edit" | "field" | "teach" | "goto" | "help" | "all";

type Props = {
  id: MenuId;
  /** What the button says ("Edit", "?"). */
  label: ReactNode;
  /** The menu's name for assistive tech and its tooltip. */
  name: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** A dot on the button while something in the menu is switched on (route depths, Vs defense). */
  dot?: boolean;
  tour?: string;
  /** Accessible name for a button whose label is a symbol. */
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
};

/**
 * One of the Designer's top-bar menus (Edit, Field, Teach, Go to, Help). Only
 * one is open at a time: the Designer holds which, so opening one closes the
 * other. The list drops under its own button, keeps focus inside like a
 * dialog, and Escape or a click outside closes it.
 */
export function DesignerMenu({ id, label, name, hint, open, onToggle, onClose, dot, tour, ariaLabel, className, children }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    // Under its button, slid back in when it would run off the right edge.
    setLeft(Math.max(8, Math.min(r.left, window.innerWidth - 300)));
  }, [open]);
  const menuId = `dz-menu-${id}`;
  return (
    <div className={`dz-more${className ? ` ${className}` : ""}`}>
      <Tooltip title={name} hint={dot ? `${hint} The cyan dot means something in it is switched on.` : hint} side="bottom">
        <button
          type="button"
          ref={btn}
          className={`dz-top-btn dz-menu-btn${open ? " is-on" : ""}${dot ? " has-dot" : ""}`}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={ariaLabel}
          data-tour={tour}
        >
          {label}
          {id !== "help" && <Icon name="chevron" size={13} />}
        </button>
      </Tooltip>
      {open && (
        <>
          <div className="stage-menu-scrim" onPointerDown={onClose} aria-hidden="true" />
          <FocusPopover
            onClose={onClose}
            className="dz-more-menu"
            id={menuId}
            role="group"
            aria-label={name}
            style={left === null ? undefined : { left, right: "auto" }}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("button, a")) return;
              // The item is about to unmount: hand focus to the menu's button first, so a
              // dialog opened from here (Field controls, Coverage check) gives it back on close.
              btn.current?.focus();
              onClose();
            }}
          >
            {children}
          </FocusPopover>
        </>
      )}
    </div>
  );
}

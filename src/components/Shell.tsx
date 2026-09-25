import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import { useAuth } from "../lib/auth";
import { useTier } from "../lib/tier";
import { useStore } from "../lib/store";

type Props = {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

const NAV = [
  {
    to: "/vault",
    icon: "folder",
    label: "The Vault",
    hint: "Every play you have drawn, plus the plays other coaches made public.",
  },
  {
    to: "/playbooks",
    icon: "board",
    label: "Playbooks",
    hint: "Group plays into an install order — base, red zone, third down.",
  },
  {
    to: "/grid",
    icon: "table",
    label: "Season Grid",
    hint: "Your live call sheet. Sort it, paint it, print it.",
  },
  {
    to: "/starters",
    icon: "sparkle",
    label: "Starter plays",
    hint: "Fifty-six ready-made plays you can copy and edit as your own.",
  },
];

export function Shell({ title, actions, children }: Props) {
  const { account, signOut } = useAuth();
  const tier = useTier();
  const [open, setOpen] = useState(false);
  const plays = useStore((s) => s.plays);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <aside className={`rail${open ? " is-open" : ""}`} id="rail-nav" aria-label="Playbook navigation">
        <Link to="/" className="rail-brand">
          <Mark />
          <span>
            <b>Grid1ronVault</b>
            <small>PLAYBOOK STUDIO</small>
          </span>
        </Link>

        <div className="rail-group">
          <Link
            to="/build"
            className="rail-link"
            style={{
              background: "var(--cyan)",
              color: "#04212A",
              fontWeight: 700,
            }}
          >
            <Icon name="plus" size={16} />
            Draft a play
          </Link>
        </div>

        <nav className="rail-group" aria-labelledby="rail-playbook">
          <p id="rail-playbook">Playbook</p>
          {NAV.map((item) => (
            <Tooltip key={item.to} title={item.label} hint={item.hint}>
              <NavLink
                to={item.to}
                className={({ isActive }) => `rail-link${isActive ? " is-active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
                {item.to === "/vault" && plays.length > 0 && <b>{plays.length}</b>}
              </NavLink>
            </Tooltip>
          ))}
        </nav>

        <nav className="rail-group" aria-labelledby="rail-account">
          <p id="rail-account">Account</p>
          <NavLink to="/pricing" className={({ isActive }) => `rail-link${isActive ? " is-active" : ""}`}>
            <Icon name="sparkle" size={16} />
            Plans
          </NavLink>
          <NavLink to="/account" className={({ isActive }) => `rail-link${isActive ? " is-active" : ""}`}>
            <Icon name="user" size={16} />
            Your account
          </NavLink>
        </nav>

        <div className="rail-foot">
          {tier.id === "free" && (
            <div className="rail-plan">
              <p>
                You are on Sideline — {plays.length} of {tier.playLimit} plays used.
              </p>
              <Link to="/pricing" className="btn btn-primary btn-sm btn-block">
                Unlock the full kit
              </Link>
            </div>
          )}
          {tier.id === "beta" && (
            <div className="rail-plan">
              <span className="pill pill-cyan">Beta</span>
              <p style={{ marginTop: 8 }}>Every tool is open during beta. Found something broken? Tell us.</p>
            </div>
          )}
          <div className="rail-user">
            <span className="avatar" aria-hidden="true">
              {(account?.name ?? "C").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{account?.name ?? "Guest coach"}</strong>
              <small>{account ? tier.name : "Saved in this browser"}</small>
            </div>
            {account ? (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => signOut()}
                title="Sign out"
                aria-label={`Sign out of ${account.name ?? "your account"}`}
              >
                <Icon name="close" size={15} />
              </button>
            ) : (
              <Link to="/signin" className="btn btn-quiet btn-sm">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="work">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-ghost btn-sm only-narrow"
            onClick={() => setOpen((v) => !v)}
            aria-label="Playbook navigation"
            aria-expanded={open}
            aria-controls="rail-nav"
          >
            <Icon name="multiselect" size={16} />
          </button>
          <h1>{title}</h1>
          <div className="spacer" />
          {actions}
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#16C8E8" />
      <path
        d="M21.5 12.2a6.6 6.6 0 1 0 0 7.6M21.8 19.8V16.4h-3.6"
        fill="none"
        stroke="#04212A"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

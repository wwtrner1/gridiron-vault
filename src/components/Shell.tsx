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

type NavItem = { to: string; icon: string; label: string; hint: string };

/** The side menu, the same on every signed-in page. */
const PLAYBOOK_NAV: NavItem[] = [
  {
    to: "/vault",
    icon: "folder",
    label: "The Vault",
    hint: "Every play you have drawn, plus the plays other coaches made public.",
  },
  {
    to: "/upload",
    icon: "upload",
    label: "Upload plays",
    hint: "Turn a whiteboard photo, screenshot or PowerPoint deck into editable plays.",
  },
  {
    to: "/playbooks",
    icon: "board",
    label: "Playbooks",
    hint: "Group plays into an install order — base, red zone, third down.",
  },
  {
    to: "/assignments",
    icon: "user",
    label: "Assignments",
    hint: "One player's job on every play in a playbook. Print it as a position sheet.",
  },
  {
    to: "/grid",
    icon: "table",
    label: "Season Grid",
    hint: "Your live call sheet. Sort it, paint it, print it.",
  },
  {
    to: "/wristbands",
    icon: "wristband",
    label: "Wristbands",
    hint: "Print quarterback wristband cards from your Season Grid or a playbook.",
  },
  {
    to: "/starters",
    icon: "sparkle",
    label: "Starter plays",
    hint: "Fifty-six ready-made plays you can copy and edit as your own.",
  },
  {
    to: "/language",
    icon: "language",
    label: "Playbook language",
    hint: "Your own names for formations, routes and calls.",
  },
];

const ACCOUNT_NAV: NavItem[] = [
  { to: "/pricing", icon: "sparkle", label: "Plans", hint: "Compare plans and see what your plan includes." },
  { to: "/account", icon: "user", label: "Your account", hint: "Your name, plan, exports and data." },
  { to: "/help", icon: "help", label: "Help & feedback", hint: "Get help, report a problem or tell us what to improve." },
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
            <b>GridIronVault</b>
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
          {PLAYBOOK_NAV.map((item) => (
            <RailLink key={item.to} item={item} onNavigate={() => setOpen(false)}>
              {item.to === "/vault" && plays.length > 0 && <b>{plays.length}</b>}
            </RailLink>
          ))}
        </nav>

        <nav className="rail-group" aria-labelledby="rail-account">
          <p id="rail-account">Account</p>
          {ACCOUNT_NAV.map((item) => (
            <RailLink key={item.to} item={item} onNavigate={() => setOpen(false)} />
          ))}
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

function RailLink({ item, onNavigate, children }: { item: NavItem; onNavigate: () => void; children?: React.ReactNode }) {
  return (
    <Tooltip title={item.label} hint={item.hint}>
      <NavLink
        to={item.to}
        className={({ isActive }) => `rail-link${isActive ? " is-active" : ""}`}
        onClick={onNavigate}
      >
        <Icon name={item.icon} size={16} />
        {item.label}
        {children}
      </NavLink>
    </Tooltip>
  );
}

/** The GridIronVault app icon: the G wrapped around a football. Decorative; the name is always beside it. */
export function Mark({ size = 30 }: { size?: number }) {
  return <img className="brand-mark" src="/icon-192.png" width={size} height={size} alt="" aria-hidden="true" />;
}

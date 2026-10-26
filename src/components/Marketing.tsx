import { Link } from "react-router-dom";
import { Mark } from "./Shell";
import { useAuth } from "../lib/auth";

/** Top nav shared by every marketing page, matching the canvas. */
export function MarketingNav() {
  const { account } = useAuth();
  return (
    <header className="mkt-nav">
      <Link to="/" className="mkt-brand">
        <Mark size={30} />
        <span>
          GridIron<b>Vault</b>
        </span>
      </Link>
      <nav aria-label="Main">
        <Link to="/build">Designer</Link>
        <Link to="/#how">How it works</Link>
        <Link to="/starters">Starter plays</Link>
        <Link to="/pricing">Pricing</Link>
      </nav>
      <div className="mkt-nav-actions">
        {account ? (
          <Link to="/vault" className="btn btn-outline-dark btn-sm">
            Your Vault
          </Link>
        ) : (
          <Link to="/signin" className="btn btn-outline-dark btn-sm">
            Sign in
          </Link>
        )}
        <Link to="/build" className="btn btn-primary btn-sm">
          Start drawing — it is free
        </Link>
      </div>
    </header>
  );
}

const FOOTER_COLUMNS: { id: string; title: string; links: [to: string, label: string][] }[] = [
  {
    id: "foot-product",
    title: "Product",
    links: [["/build", "Designer"], ["/grid", "Call Sheet"], ["/vault", "The Vault"], ["/playbooks", "Playbooks"]],
  },
  {
    id: "foot-learn",
    title: "Learn",
    links: [["/starters", "Starter plays"], ["/starters", "Route tree"], ["/pricing", "Plans"]],
  },
  {
    id: "foot-account",
    title: "Account",
    links: [["/signin", "Sign in"], ["/signin", "Create an account"], ["/account", "Your account"]],
  },
  {
    id: "foot-support",
    title: "Support",
    links: [["/help", "Contact us"], ["/help", "Tell us what to improve →"], ["/privacy", "Privacy Policy"], ["/terms", "Terms of Use"]],
  },
];

/** Footer shared by every marketing page, matching the canvas. */
export function MarketingFooter() {
  return (
    <footer className="mkt">
      <h2 className="sr-only">Site footer</h2>
      <div className="mkt-foot-inner">
        <div className="mkt-foot-brand">
          <Mark size={26} />
          <span>
            GridIron<b>Vault</b>
          </span>
          <small>Playbook studio is designed for football coaches and players.</small>
        </div>
        <div className="mkt-foot-cols">
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.id} aria-labelledby={col.id}>
              <h3 id={col.id}>{col.title}</h3>
              {col.links.map(([to, label]) => (
                <Link key={label} to={to}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <p className="mkt-legal">
          GridIronVault is an independent tool. It is not affiliated with, endorsed by, or sponsored by any league or governing
          body. Diagrams and terminology are provided for coaching and teaching use.
        </p>
      </div>
    </footer>
  );
}

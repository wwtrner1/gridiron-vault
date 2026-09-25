import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";

type Screen = { title: string; icon: string; blurb: string };

/**
 * Side-menu destinations whose screens are still being built. Each one keeps
 * the signed-in shell so the menu works end to end before the screen lands.
 */
export const COMING_SOON: Record<string, Screen> = {
  "/upload": {
    title: "Upload plays",
    icon: "upload",
    blurb: "Drop in a whiteboard photo, a screenshot or a PowerPoint deck and get editable plays back.",
  },
  "/wristbands": {
    title: "Wristbands",
    icon: "wristband",
    blurb: "Build and print quarterback wristband cards, six to ten plays each, from your Season Grid or a playbook.",
  },
  "/language": {
    title: "Playbook language",
    icon: "language",
    blurb: "Save your own names for formations, routes and calls so every screen speaks your playbook.",
  },
  "/help": {
    title: "Help & feedback",
    icon: "help",
    blurb: "Get help, report a problem, or tell us what to improve.",
  },
};

export function ComingSoon({ path }: { path: keyof typeof COMING_SOON }) {
  const screen = COMING_SOON[path];
  return (
    <Shell title={screen.title}>
      <div className="page-head">
        <div>
          <h2>{screen.title}</h2>
          <p>{screen.blurb}</p>
        </div>
      </div>
      <div className="empty">
        <Icon name={screen.icon} size={40} />
        <h3>Coming in the next build</h3>
        <p>This screen is on the way. Your plays are safe in the Vault in the meantime.</p>
        <Link to="/vault" className="btn btn-ghost">
          <Icon name="folder" size={16} /> Back to the Vault
        </Link>
      </div>
    </Shell>
  );
}

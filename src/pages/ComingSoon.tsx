import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";

type Screen = { title: string; icon: string; blurb: string };

/**
 * Side-menu destinations whose screens are still being built. Each one keeps
 * the signed-in shell so the menu works end to end before the screen lands.
 */
export const COMING_SOON: Record<string, Screen> = {};

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

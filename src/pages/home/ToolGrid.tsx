import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { NAV_GROUPS } from "../../lib/nav";
import { CLIPS, CLIP_OF_ROUTE, SHOT_OF_ROUTE, type Watch } from "./tools";

/** The Designer isn't in the side menu's list (the button above it opens it), so the grid adds it to the Plays group. */
const DESIGNER = { to: "/build", icon: "pencil", label: "Designer", hint: "Draw a play: players, routes, blocks and coverage on a real field." };

/**
 * "Every tool, one click away": the side menu's own groups and tools (src/lib/nav.ts), each with a picture of its screen
 * and, where there is a clip of it, a Watch button that opens the video pop-out.
 */
export function ToolGrid({ onWatch }: { onWatch: (w: Watch) => void }) {
  return (
    <section className="ta" id="everything" aria-labelledby="all-h">
      <div className="home-band-head home-rv">
        <p className="home-eyebrow">Everything in the Vault</p>
        <h2 id="all-h">Every tool, one click away</h2>
        <p>The same tools as the side menu inside the app, each with a look at its screen. Jump straight to the one you need, or press Watch to see it work.</p>
      </div>
      {NAV_GROUPS.map((g, gi) => {
        const items = gi === 0 ? [DESIGNER, ...g.items] : g.items;
        return (
          <div className="ta-group" key={g.id}>
            <h3>
              {g.label}
              <span aria-hidden="true">{items.length}</span>
            </h3>
            <ul className="ta-grid">
              {items.map((item) => {
                const clip = CLIP_OF_ROUTE[item.to];
                const shot = SHOT_OF_ROUTE[item.to];
                return (
                  <li key={item.to}>
                    <Link to={item.to} className="ta-card">
                      {shot ? (
                        <img className="ta-shot" src={`/shots/${shot}.webp`} alt="" width={960} height={600} loading="lazy" />
                      ) : (
                        <span className="ta-shot ta-shot-icon" aria-hidden="true">
                          <Icon name={item.icon} size={44} />
                        </span>
                      )}
                      <span className="ta-text">
                        <Icon name={item.icon} size={20} />
                        <b>{item.label}</b>
                        <small>{item.hint}</small>
                      </span>
                    </Link>
                    {clip && CLIPS[clip] && (
                      <button type="button" className="ta-watch" aria-label={`Watch the ${item.label} video`} onClick={() => onWatch({ clip })}>
                        <Icon name="play" size={12} />
                        Watch
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

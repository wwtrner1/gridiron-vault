import { Modal } from "./Modal";
import { ESSENTIALS, EVERYTHING, GROUP_GUIDE, presetName, toolPrefs, useToolPrefs, type ToolKey } from "../lib/toolPrefs";

export type GuideTool = { id: ToolKey; label: string; hint: string };

/**
 * The Tools guide: a table of contents of every designer tool with what it
 * does, and a switch to show or hide it. Hiding only tidies the rail; nothing
 * is deleted and every tool comes back from here.
 */
export function ToolsGuide({
  tools,
  onClose,
  onTour,
}: {
  /** The individual tools inside each group that has them (Modes, Lines, Shapes). */
  tools: Partial<Record<string, GuideTool[]>>;
  onClose: () => void;
  onTour: () => void;
}) {
  const prefs = useToolPrefs();
  const set = presetName(prefs);
  const hiddenCount = prefs.hiddenGroups.length + prefs.hiddenTools.length;

  return (
    <Modal
      title="Your tools"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onTour}>
            Show me how it works
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <p className="lede tg-lede">
        Every tool in the designer, what it does, and whether it shows in your tool panel. Hide what you don't use to keep the panel
        short. Nothing is deleted: switch it back on here any time.
      </p>

      <div className="tg-sets" role="radiogroup" aria-label="Tool set">
        <button
          type="button"
          role="radio"
          aria-checked={set === "essentials"}
          className={`tg-set${set === "essentials" ? " is-on" : ""}`}
          onClick={() => toolPrefs.set(ESSENTIALS)}
        >
          <b>Essentials</b>
          <span>Players, formations, routes and the main line tools. A good start.</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={set === "everything"}
          className={`tg-set${set === "everything" ? " is-on" : ""}`}
          onClick={() => toolPrefs.set(EVERYTHING)}
        >
          <b>Everything</b>
          <span>Every tool, mode and library.</span>
        </button>
        <div className={`tg-set is-static${set === "custom" ? " is-on" : ""}`} aria-live="polite">
          <b>Your own mix</b>
          <span>{set === "custom" ? `${hiddenCount} hidden. Change any switch below.` : "Flip any switch below to make one."}</span>
        </div>
      </div>

      <ol className="tg-list">
        {GROUP_GUIDE.map((g) => {
          const groupOn = !prefs.hiddenGroups.includes(g.id);
          const inner = tools[g.id];
          return (
            <li key={g.id} className={`tg-group${groupOn ? "" : " is-off"}`}>
              <label className="tg-row">
                <input type="checkbox" checked={groupOn} onChange={() => toolPrefs.toggleGroup(g.id)} />
                <span className="tg-name">{g.title}</span>
                <span className="tg-text">{g.text}</span>
              </label>
              {inner && inner.length > 0 && (
                <ul className="tg-tools" aria-label={`${g.title} tools`}>
                  {inner.map((t) => (
                    <li key={t.id}>
                      <label className="tg-row">
                        <input
                          type="checkbox"
                          checked={groupOn && !prefs.hiddenTools.includes(t.id)}
                          disabled={!groupOn}
                          onChange={() => toolPrefs.toggleTool(t.id)}
                        />
                        <span className="tg-name">{t.label}</span>
                        <span className="tg-text">{t.hint}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}

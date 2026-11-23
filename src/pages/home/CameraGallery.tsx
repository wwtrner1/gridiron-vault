import { useId, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { tabKey } from "./tabKeys";
import { CAMERAS, CLIPS, clock, type Watch } from "./tools";

const CAMERA_CLIP = "15-film-room-cameras";

/** The Film Room's twelve 3D cameras: a picture of each from the real app, and what it is for. */
export function CameraGallery({ onWatch }: { onWatch: (w: Watch) => void }) {
  // Opens on the QB cam: the one coaches ask about first.
  const [at, setAt] = useState(CAMERAS.findIndex((c) => c.id === "qb"));
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const cam = CAMERAS[at];
  const clip = CLIPS[CAMERA_CLIP];
  const pick = (i: number) => {
    setAt(i);
    tabs.current[i]?.focus();
  };
  return (
    <section className="cg" id="cameras" aria-labelledby="cg-h">
      <div className="home-band-head home-rv">
        <p className="home-eyebrow">New in the Film Room</p>
        <h2 id="cg-h">Twelve cameras for every play</h2>
        <p>Flip any lesson to 3D, then pick the camera that teaches it best. Press a camera to see its view.</p>
      </div>
      <div className="cg-body home-rv">
        <div className="cg-stage" role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-t${at}`}>
          <figure className="cg-shot">
            {missing[cam.id] ? (
              <div className="cg-blank" role="img" aria-label={`${cam.name} camera`} />
            ) : (
              <img
                key={cam.id}
                src={`/shots/cameras/${cam.id}.webp`}
                alt={`The Film Room in 3D, seen through the ${cam.name} camera`}
                width={960}
                height={540}
                onError={() => setMissing((m) => ({ ...m, [cam.id]: true }))}
              />
            )}
            <figcaption>
              <span aria-hidden="true">{String(at + 1).padStart(2, "0")} / {CAMERAS.length}</span>
              <b>{cam.name}</b>
            </figcaption>
          </figure>
          <div className="cg-copy">
            <h3>{cam.name}</h3>
            <p>{cam.line}</p>
            {clip && (
              <button type="button" className="btn btn-primary" onClick={() => onWatch({ clip: CAMERA_CLIP })}>
                <Icon name="play" size={16} />
                Watch the cameras · {clock(clip.seconds)}
              </button>
            )}
          </div>
        </div>
        <div className="cg-chips" role="tablist" aria-label="Film Room cameras">
          {CAMERAS.map((c, i) => (
            <button
              key={c.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-t${i}`}
              aria-selected={i === at}
              aria-controls={`${id}-p`}
              tabIndex={i === at ? 0 : -1}
              className={`cg-chip${i === at ? " is-on" : ""}`}
              onClick={() => setAt(i)}
              onKeyDown={(e) => {
                const n = tabKey(e, i, CAMERAS.length);
                if (n !== null) pick(n);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

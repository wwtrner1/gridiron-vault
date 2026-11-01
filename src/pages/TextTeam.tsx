import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Shell } from "../components/Shell";
import { useAuth } from "../lib/auth";
import { loadMyTeam } from "../lib/teamSource";
import {
  AUDIENCES,
  hasPlaceholder,
  inGroups,
  logText,
  signed,
  smsHref,
  TEMPLATES,
  TEXT_MAX,
  textContacts,
  type Audience,
  type SentText,
} from "../lib/textTeam";
import { useToast } from "../lib/toast";
import "../styles/textTeam.css";

type Step = "write" | "send" | "done";

const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Text the team: write one message, pick who it is for, then send it from the
 * coach's own phone in groups of 8 (each group opens Messages with the
 * numbers and text filled in). The send is logged on this browser's team
 * history. Only numbers marked OK to text on the roster are used.
 */
export function TextTeam() {
  const { account } = useAuth();
  const toast = useToast();
  const go = useNavigate();
  const team = useMemo(loadMyTeam, []);
  const teamName = team.name.trim() || "My team";
  const who = account?.name && !account.name.includes("@") ? account.name : `${teamName} coaches`;

  const [step, setStep] = useState<Step>("write");
  const [audience, setAudience] = useState<Audience>("all");
  const [template, setTemplate] = useState("");
  const [body, setBody] = useState("");
  const [opened, setOpened] = useState<boolean[]>([]);
  const [logged, setLogged] = useState<SentText | null>(null);

  const contacts = useMemo(() => textContacts(team.players, audience), [team.players, audience]);
  const groups = useMemo(() => inGroups(contacts), [contacts]);
  const message = signed(body, who);
  const count = message.length;
  const open = hasPlaceholder(body);
  const ready = body.trim().length > 0 && count <= TEXT_MAX && !open && contacts.length > 0;

  const counts = useMemo(() => Object.fromEntries(AUDIENCES.map((a) => [a.id, textContacts(team.players, a.id).length])) as Record<Audience, number>, [team.players]);

  const pickTemplate = (id: string) => {
    setTemplate(id);
    setBody(TEMPLATES.find((t) => t.id === id)?.body ?? "");
  };

  const start = () => {
    setOpened(groups.map(() => false));
    setStep("send");
  };
  const sentCount = opened.filter(Boolean).length;
  const next = opened.indexOf(false);
  const all = groups.length > 0 && sentCount === groups.length;

  const finish = () => {
    const saved = logText({ body: body.trim(), contacts: contacts.length, groups: groups.length });
    if (!saved) toast("This browser won't let us save the team history. The texts still went out.", true);
    setLogged(saved);
    setStep("done");
  };

  if (step === "done")
    return (
      <Shell title="Text sent">
        <div className="tt tt-done">
          <header className="tt-hero">
            <span className="tt-hero-mark" aria-hidden="true">
              <Icon name="check" size={28} strokeWidth={2.5} />
            </span>
            <p className="eyebrow">{teamName}</p>
            <h2>
              The team
              <br />
              has the call.
            </h2>
            <p className="tt-quote">“{body.trim()}”</p>
          </header>
          <section className="tt-card" aria-label="What was sent">
            <div className="tt-row">
              <span>Texted from your phone</span>
              <b className="mono">
                {contacts.length} · {groups.length} {groups.length === 1 ? "group" : "groups"}
              </b>
            </div>
            <div className="tt-row">
              <span>Saved to team history</span>
              <span className="mono tt-muted">{logged ? stamp(logged.at) : "Not saved"}</span>
            </div>
          </section>
          <aside className="tt-card tt-upsell">
            <span className="pill pill-violet">PROGRAM PLAN</span>
            <h3>Skip the groups. One tap, every parent.</h3>
            <p>Texts go out from the team's own number, replies stay private, and parents opt out with STOP.</p>
            <Link to="/pricing">See the Program plan</Link>
          </aside>
          <div className="tt-foot">
            <Link to="/roster" className="btn btn-dark btn-lg btn-block">
              Back to My team
            </Link>
          </div>
        </div>
      </Shell>
    );

  if (step === "send")
    return (
      <Shell title="Send in groups">
        <div className="tt">
          <div className="tt-top">
            <button type="button" className="tt-back" aria-label="Back to message" onClick={() => setStep("write")}>
              <Icon name="prev" size={18} />
            </button>
            <div>
              <p className="eyebrow">Step 2 of 2</p>
              <h2>Send in {groups.length} {groups.length === 1 ? "group" : "groups"}</h2>
            </div>
          </div>
          <p className="tt-lede">Tap each group. Your Messages app opens with the numbers and text filled in. Hit send, then come back.</p>
          <div className="tt-progress">
            <div className="tt-bar" role="progressbar" aria-label="Groups opened" aria-valuemin={0} aria-valuemax={groups.length} aria-valuenow={sentCount}>
              <div style={{ width: `${groups.length ? Math.round((sentCount / groups.length) * 100) : 0}%` }} />
            </div>
            <b className="mono">
              {sentCount}/{groups.length}
            </b>
          </div>
          <ul className="tt-groups">
            {groups.map((g, i) => {
              const isOpened = opened[i];
              const isNext = i === next;
              return (
                <li key={i} className="tt-card tt-group">
                  <div className="tt-group-head">
                    <h3>Group {i + 1}</h3>
                    <span className={`tt-state ${isOpened ? "is-sent" : isNext ? "is-next" : ""}`}>{isOpened ? "Opened" : isNext ? "Next" : "Waiting"}</span>
                  </div>
                  <p className="tt-names">
                    {g.length} {g.length === 1 ? "contact" : "contacts"}: {g.map((c) => c.label).join(", ")}
                  </p>
                  <a
                    className={`btn btn-lg btn-block ${isNext ? "btn-primary" : "btn-ghost"}`}
                    href={smsHref(g.map((c) => c.phone), message)}
                    aria-label={`${isOpened ? "Open again" : "Open in Messages"}: group ${i + 1}`}
                    onClick={() => setOpened((o) => o.map((v, j) => v || j === i))}
                  >
                    {isOpened ? "Open again" : "Open in Messages"}
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="tt-fine">Groups of 8 keep group texts reliable on mixed iPhone and Android phones. Everyone in a group can see each other's numbers.</p>
          <div className="tt-foot">
            {all ? (
              <button type="button" className="btn btn-dark btn-lg btn-block" onClick={finish}>
                Done: log it
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => go("/roster")}>
                Finish later
              </button>
            )}
          </div>
        </div>
      </Shell>
    );

  return (
    <Shell title="Text the team">
      <div className="tt">
        <div className="tt-top">
          <Link to="/roster" className="tt-back" aria-label="Back to My team">
            <Icon name="prev" size={18} />
          </Link>
          <div>
            <p className="eyebrow">{teamName}</p>
            <h2>Text the team</h2>
          </div>
        </div>

        <fieldset className="tt-set">
          <legend className="eyebrow">Send to</legend>
          <div className="chip-row tt-chips">
            {AUDIENCES.map((a) => (
              <button key={a.id} type="button" className={`chip tt-chip${audience === a.id ? " is-on" : ""}`} aria-pressed={audience === a.id} onClick={() => setAudience(a.id)}>
                {a.label} · {counts[a.id]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="tt-set">
          <legend className="eyebrow">Quick start</legend>
          <div className="chip-row tt-chips">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" className={`chip tt-chip${template === t.id ? " is-on" : ""}`} aria-pressed={template === t.id} onClick={() => pickTemplate(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="tt-set">
          <label className="eyebrow" htmlFor="tt-msg">
            Message
          </label>
          <textarea id="tt-msg" className="textarea tt-msg" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="tt-meta">
            <span>Signed “— {who}” automatically</span>
            <span className={`mono${count > TEXT_MAX ? " tt-over" : ""}`}>
              {count}/{TEXT_MAX}
            </span>
          </div>
          {open && (
            <p className="tt-warn" role="status">
              Fill in the [brackets] before you send.
            </p>
          )}
        </div>

        {contacts.length === 0 && (
          <p className="tt-warn" role="status">
            No numbers to text yet. Mark a parent or player “OK to text” with their phone on the <Link to="/roster">roster</Link>.
          </p>
        )}

        <div className="tt-foot">
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!ready} onClick={start}>
            Next: send from my phone
          </button>
          <p className="tt-fine tt-center">
            {contacts.length} {contacts.length === 1 ? "contact" : "contacts"} in {groups.length} {groups.length === 1 ? "group" : "groups"}
          </p>
        </div>
      </div>
    </Shell>
  );
}

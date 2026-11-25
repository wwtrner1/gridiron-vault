import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Shell } from "../components/Shell";
import { api, coachError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { showPhone } from "../lib/teamHub";
import { loadMyTeam } from "../lib/teamSource";
import {
  AUDIENCES,
  failReason,
  inGroups,
  logText,
  openPlaceholders,
  outcome,
  signed,
  signer,
  signupsFor,
  smsHref,
  tally,
  TEMPLATES,
  TEXT_MAX,
  textContacts,
  tidy,
  type Audience,
  type SentText,
  type TeamText,
} from "../lib/textTeam";
import { useTeamTexts } from "../lib/useTeamTexts";
import { useToast } from "../lib/toast";
import { FamilyTexts } from "./frontOffice/FamilyTexts";
import "../styles/frontOffice.css";
import "../styles/textTeam.css";

type Step = "write" | "send" | "done" | "result";

const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** When to ask again about a text still on its way, in seconds after the send. */
const RECHECK = [3, 8, 20, 45];

const STATUS_WORD = { sending: "Sending", sent: "Sent", delivered: "Delivered", failed: "Not delivered" } as const;

/** Phones open `sms:` links; a computer usually has nothing to open them with. */
const onPhone = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);

/**
 * Text the team. Signed in with texting from GridIronVault switched on, it is one tap: the text goes out from
 * GridIronVault's number to every family that signed up on the team's link, and each family's status comes back
 * (Delivered, Sent, Sending, Not delivered and why). Until that's switched on, or signed out, the coach sends it
 * from their own phone in groups of 8, and the page says "opened in Messages", never "sent", because it can't see
 * whether they pressed send.
 */
export function TextTeam() {
  const { account } = useAuth();
  const toast = useToast();
  const go = useNavigate();
  const team = useMemo(() => loadMyTeam(), []);
  const teamName = team.name.trim() || "My team";
  const who = signer(account?.name, teamName);
  const server = useTeamTexts(team.id);
  const live = Boolean(server.texts?.sms);

  const [step, setStep] = useState<Step>("write");
  const [audience, setAudience] = useState<Audience>("all");
  const [template, setTemplate] = useState("");
  const [body, setBody] = useState("");
  const [opened, setOpened] = useState<boolean[]>([]);
  const [logged, setLogged] = useState<SentText | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState<TeamText | null>(null);
  const latest = useRef<TeamText | null>(null);
  latest.current = result;

  // Who the text reaches: families who signed up when it goes from GridIronVault, else the roster's "OK to text" numbers.
  const signups = useMemo(() => server.texts?.signups ?? [], [server.texts]);
  const contacts = useMemo(() => textContacts(team.players, audience), [team.players, audience]);
  const reach = live ? signupsFor(signups, audience).length : contacts.length;
  const counts = useMemo(
    () => Object.fromEntries(AUDIENCES.map((a) => [a.id, live ? signupsFor(signups, a.id).length : textContacts(team.players, a.id).length])) as Record<Audience, number>,
    [live, signups, team.players],
  );
  const groups = useMemo(() => inGroups(contacts), [contacts]);
  const message = signed(body, who);
  const count = message.length;
  const open = openPlaceholders(body);
  const ready = body.trim().length > 0 && count <= TEXT_MAX && open.length === 0 && reach > 0;

  const pickTemplate = (id: string) => {
    setTemplate(id);
    setBody(TEMPLATES.find((t) => t.id === id)?.body ?? "");
  };

  /* ---------------------------------------------- one tap from GridIronVault --- */
  const sendNow = () => {
    setBusy(true);
    setProblem("");
    api
      .sendTeamText(team.id, body, audience)
      .then(({ text, ...rest }) => {
        server.setTexts(rest);
        setResult(text);
        setStep("result");
      })
      .catch((e: unknown) => {
        setProblem(coachError(e, "The text didn't go out. Try again in a minute."));
        // A send cut off on its way may still have reached some families: the history below shows what happened.
        server.reload();
      })
      .finally(() => setBusy(false));
  };

  // Ask again a few times while any family's text is still on its way; after that the history keeps the last word.
  const resultId = result?.id;
  useEffect(() => {
    if (step !== "result" || !resultId) return;
    let alive = true;
    const timers = RECHECK.map((s) =>
      window.setTimeout(() => {
        const now = latest.current;
        if (!alive || !now || !now.recipients.some((r) => ["sending", "sent"].includes(outcome(r.status)))) return;
        api
          .teamTextStatus(team.id, now.id)
          .then(({ text }) => alive && setResult((was) => (was?.id === text.id ? text : was)))
          .catch(() => undefined);
      }, s * 1000),
    );
    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [step, resultId, team.id]);

  /* ------------------------------------------------- the coach's own phone --- */
  const start = () => {
    setOpened(groups.map(() => false));
    setStep("send");
  };
  const sentCount = opened.filter(Boolean).length;
  const next = opened.indexOf(false);
  const all = groups.length > 0 && sentCount === groups.length;

  const finish = () => {
    const saved = logText({ body: tidy(body), contacts: contacts.length, groups: groups.length });
    if (!saved) toast("This browser won't let us save the team history.", true);
    setLogged(saved);
    setStep("done");
  };

  const list = server.texts;
  const signupPanel = account && list && (
    <div className="tt-card tt-signup">
      <FamilyTexts
      team={{ id: team.id, name: teamName }}
      list={list}
      onChange={(nextList) => server.setTexts({ ...list, ...nextList })}
      renew={() => api.renewMyTeamLink(team.id)}
      remove={(id) => api.removeMyTeamSignup(id)}
      defaultOpen={signups.length === 0}
      />
    </div>
  );

  if (step === "result" && result) {
    const t = tally(result.recipients);
    const total = result.recipients.length;
    const reached = t.delivered + t.sent + t.sending;
    return (
      <Shell title="Text sent">
        <div className="tt tt-done">
          <header className="tt-hero">
            <span className="tt-hero-mark" aria-hidden="true">
              <Icon name={reached ? "check" : "close"} size={28} strokeWidth={2.5} />
            </span>
            <p className="eyebrow">{teamName}</p>
            <h2>{reached === 0 ? "The text didn't go out." : reached === total ? `Sent to ${plural(total, "family", "families")}.` : `Sent to ${reached} of ${total}.`}</h2>
            <p className="tt-quote">“{result.body}”</p>
          </header>
          <section className="tt-card" aria-label="Who got it">
            <div className="tt-row">
              <span>Delivered</span>
              <b className="mono">{t.delivered}</b>
            </div>
            {t.sent + t.sending > 0 && (
              <div className="tt-row">
                <span>On its way</span>
                <b className="mono">{t.sent + t.sending}</b>
              </div>
            )}
            {t.failed > 0 && (
              <div className="tt-row">
                <span>Not delivered</span>
                <b className="mono tt-over">{t.failed}</b>
              </div>
            )}
          </section>
          <ul className="tt-card tt-recips" aria-label="Each family">
            {result.recipients.map((r, i) => {
              const o = outcome(r.status);
              return (
                <li key={`${r.phone}-${i}`}>
                  <div>
                    <b>{r.name}</b>
                    <small>
                      {r.player ? `${r.player} · ` : ""}
                      {showPhone(r.phone)}
                    </small>
                    {o === "failed" && <small className="tt-why">{failReason(r.status, r.code)}</small>}
                  </div>
                  <span className={`tt-state is-${o}`}>{STATUS_WORD[o]}</span>
                </li>
              );
            })}
          </ul>
          <p className="tt-fine">Sent turns to Delivered when the family's carrier confirms it. Some carriers never confirm, so Sent is as far as those go.</p>
          <div className="tt-foot">
            <Link to="/roster" className="btn btn-dark btn-lg btn-block">
              Back to My team
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-lg btn-block"
              onClick={() => {
                setBody("");
                setTemplate("");
                setResult(null);
                setStep("write");
              }}
            >
              Write another
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (step === "done")
    return (
      <Shell title="Texts opened">
        <div className="tt tt-done">
          <header className="tt-hero">
            <span className="tt-hero-mark" aria-hidden="true">
              <Icon name="check" size={28} strokeWidth={2.5} />
            </span>
            <p className="eyebrow">{teamName}</p>
            <h2>
              Opened in
              <br />
              Messages.
            </h2>
            <p className="tt-quote">“{tidy(body)}”</p>
          </header>
          <section className="tt-card" aria-label="What was opened">
            <div className="tt-row">
              <span>Opened in Messages</span>
              <b className="mono">
                {contacts.length} · {plural(groups.length, "group")}
              </b>
            </div>
            <div className="tt-row">
              <span>Saved to team history</span>
              <span className="mono tt-muted">{logged ? stamp(logged.at) : "Not saved"}</span>
            </div>
          </section>
          <p className="tt-fine">GridIronVault can't see inside your Messages app, so check there that each group went.</p>
          <aside className="tt-card tt-upsell">
            <span className="pill pill-violet">ONE TAP</span>
            <h3>Skip the groups next time.</h3>
            <p>
              {account
                ? "Once texting from GridIronVault is switched on, families who signed up on your team's link get every text in one tap, from any computer or phone."
                : "Sign in and share your team's sign-up link. Once texting from GridIronVault is switched on, every text is one tap from any computer or phone."}
            </p>
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
              <h2>Send in {plural(groups.length, "group")}</h2>
            </div>
          </div>
          <p className="tt-lede">Tap each group. Your Messages app opens with the numbers and text filled in. Hit send, then come back.</p>
          {!onPhone() && (
            <p className="tt-warn" role="status">
              These buttons open a phone's Messages app, so on most computers nothing happens. Open GridIronVault on your phone to send them.
            </p>
          )}
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
                    {plural(g.length, "contact")}: {g.map((c) => c.label).join(", ")}
                  </p>
                  <a
                    className={`btn btn-lg btn-block ${isNext ? "btn-primary" : "btn-ghost"}`}
                    href={smsHref(
                      g.map((c) => c.phone),
                      message,
                    )}
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
                Done
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
          {open.length > 0 && (
            <p className="tt-warn" role="status">
              Replace {open.join(", ")} with the real {open.length === 1 ? "detail" : "details"} before you send.
            </p>
          )}
        </div>

        {problem && (
          <p className="tt-warn" role="alert">
            {problem}
          </p>
        )}
        {server.problem && (
          <p className="tt-warn" role="status">
            {server.problem}{" "}
            <button type="button" className="btn btn-quiet btn-sm" onClick={server.reload}>
              Try again
            </button>
          </p>
        )}

        {live ? (
          <>
            {reach === 0 && (
              <p className="tt-warn" role="status">
                {signups.length === 0
                  ? "No families have signed up yet. Send them the sign-up link below: each family signs up once, then every text is one tap."
                  : "Nobody in that group has signed up yet. Pick Everyone, or share the sign-up link below."}
              </p>
            )}
            <div className="tt-foot">
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!ready || busy} onClick={sendNow}>
                {busy ? "Sending…" : reach ? `Send to ${plural(reach, "family", "families")}` : "Send"}
              </button>
              <p className="tt-fine tt-center">From GridIronVault's team number, signed with your name. Families reply STOP to opt out.</p>
            </div>
            {signupPanel}
            <TextHistory texts={list?.texts ?? []} />
          </>
        ) : (
          <>
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
                {plural(contacts.length, "contact")} in {plural(groups.length, "group")}
              </p>
            </div>
            {signupPanel && (
              <>
                <p className="tt-fine">
                  One-tap texting from GridIronVault isn't switched on yet. Share the sign-up link now, and families who sign up get every text in one tap once it is.
                </p>
                {signupPanel}
              </>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

/** The last texts sent from GridIronVault's number for this team, with how many reached families. */
function TextHistory({ texts }: { texts: TeamText[] }) {
  if (!texts.length) return null;
  return (
    <div className="tt-card">
      <div className="tt-recent-head">Last texts</div>
      <ul className="tt-recent">
        {texts.slice(0, 5).map((t) => {
          const n = tally(t.recipients);
          return (
            <li key={t.id}>
              <div className="tt-recent-top">
                <span>{t.body}</span>
                <span className="mono">{stamp(t.at)}</span>
              </div>
              <small>
                {n.delivered} delivered{n.sent + n.sending ? ` · ${n.sent + n.sending} on its way` : ""}
                {n.failed ? ` · ${n.failed} not delivered` : ""}
              </small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, type TextList } from "../../lib/api";
import { FamilyTexts } from "./FamilyTexts";
import { familyContacts, MESSAGE_LIMITS, type Delivery, type HubMessage, type HubPlayer, type HubState, type HubTeam, type MessageChannel } from "../../lib/teamHub";
import { useToast } from "../../lib/toast";

const SEEN_KEY = "grid1ronvault.hub.v1";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** Longer mailto: links get cut off by some mail apps; past this the coach copies the addresses instead. */
const MAILTO_MAX = 1800;

function lastSeen(orgId: string): string {
  try {
    return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, string>)[orgId] ?? "";
  } catch {
    return "";
  }
}
function markSeen(orgId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, string>;
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...all, [orgId]: new Date().toISOString() }));
  } catch {
    /* storage blocked: everything just reads as seen next visit */
  }
}

/**
 * Team messages: the coaches' board (only staff see it) and announcements to
 * players and families. The server emails the roster's contacts and texts the
 * numbers that signed up on the team's text link when the site has that set up; until then the coach's own email app and phone do
 * the sending and the announcement is still kept here.
 */
export function MessagesTab({ hub, team }: { hub: HubState; team: HubTeam }) {
  const toast = useToast();
  const [messages, setMessages] = useState<HubMessage[] | null>(null);
  const [delivery, setDelivery] = useState<Delivery>({ email: false, sms: false });
  const [players, setPlayers] = useState<HubPlayer[]>([]);
  const [texts, setTexts] = useState<TextList | null>(null);
  const [failed, setFailed] = useState("");
  const [channel, setChannel] = useState<MessageChannel>("staff");
  const [seen] = useState(() => lastSeen(hub.org.id));

  useEffect(() => {
    Promise.all([api.messages(hub.org.id), api.roster(team.id), api.textSignups(team.id)])
      .then(([m, r, t]) => {
        setMessages(m.messages);
        setDelivery(m.delivery);
        setPlayers(r.players);
        setTexts(t);
        markSeen(hub.org.id);
      })
      .catch((e: Error) => setFailed(e.message));
  }, [hub.org.id, team.id]);

  const contacts = useMemo(() => familyContacts(players), [players]);
  const shown = (messages ?? []).filter((m) => m.channel === channel && (m.teamId === team.id || m.teamId === null));
  const unread = (c: MessageChannel) => (messages ?? []).filter((m) => m.channel === c && !m.mine && m.createdAt > seen && (m.teamId === team.id || m.teamId === null)).length;

  if (failed && !messages)
    return (
      <p className="hint" role="alert">
        {failed}
      </p>
    );
  if (!messages) return <p role="status">Opening messages…</p>;

  return (
    <section className="hub-panel" aria-labelledby="hub-messages">
      <div className="hub-head">
        <h3 id="hub-messages">{team.name} messages</h3>
      </div>
      <div className="chip-row" role="group" aria-label="Who the messages are for">
        {(["staff", "family"] as const).map((c) => (
          <button key={c} type="button" className={`chip${channel === c ? " is-on" : ""}`} aria-pressed={channel === c} onClick={() => setChannel(c)}>
            <Icon name={c === "staff" ? "message" : "users"} size={13} /> {c === "staff" ? "Coaches' board" : "Players & families"}
            {unread(c) > 0 && <span className="pill pill-cyan">{unread(c)} new</span>}
          </button>
        ))}
      </div>

      <Composer
        key={channel}
        channel={channel}
        hub={hub}
        team={team}
        delivery={delivery}
        contacts={contacts}
        signedUp={texts?.signups.length ?? 0}
        onPosted={(res, note) => {
          setMessages(res.messages);
          setDelivery(res.delivery);
          toast(note);
        }}
      />

      {channel === "family" && texts && <FamilyTexts team={team} list={texts} onChange={setTexts} />}

      {shown.length === 0 ? (
        <p className="hint">
          {channel === "staff"
            ? "Nothing on the board yet. Notes here are for coaches only: practice changes, who's driving, what to install."
            : "No announcements yet. They're kept here so every coach can see what families were told."}
        </p>
      ) : (
        <ul className="hub-feed">
          {shown.map((m) => (
            <li key={m.id} className={m.createdAt > seen && !m.mine ? "is-new" : ""}>
              <div className="hub-feed-head">
                <b>{m.authorName}</b>
                <small>
                  {when(m.createdAt)}
                  {m.teamId === null && " · Whole Front Office"}
                </small>
                {(m.mine || hub.role === "director") && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() =>
                      void api
                        .deleteMessage(m.id)
                        .then((r) => setMessages(r.messages))
                        .catch((e: Error) => toast(e.message))
                    }
                    aria-label="Remove this message"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>
              {m.subject && <b className="hub-feed-subject">{m.subject}</b>}
              <p>{m.body}</p>
              {m.channel === "family" && (
                <small className="hub-feed-sent">
                  {m.emailed || m.texted
                    ? [m.emailed && `Emailed ${m.emailed}`, m.texted && `texted ${m.texted}`].filter(Boolean).join(", ")
                    : "Sent from the coach's own email or phone"}
                </small>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Composer({
  channel,
  hub,
  team,
  delivery,
  contacts,
  signedUp,
  onPosted,
}: {
  channel: MessageChannel;
  hub: HubState;
  team: HubTeam;
  delivery: Delivery;
  contacts: { emails: string[]; phones: string[] };
  signedUp: number;
  onPosted: (res: { messages: HubMessage[]; delivery: Delivery }, note: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [everyone, setEveryone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const family = channel === "family";
  const ready = body.trim().length > 0;

  const post = async (opts: { email: boolean; sms: boolean }) => {
    setBusy(true);
    setError("");
    try {
      const res = await api.postMessage(hub.org.id, { teamId: !family && everyone ? null : team.id, channel, subject: family ? subject : "", body, ...opts });
      const parts = [res.emailed && `emailed to ${res.emailed}`, res.texted && `texted to ${res.texted}`].filter(Boolean);
      onPosted(res, family ? (parts.length ? `Announcement ${parts.join(" and ")}.` : "Announcement saved for your staff.") : "Posted to the coaches' board.");
      setSubject("");
      setBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const [copied, setCopied] = useState("");
  const copy = (text: string, what: string) =>
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(what);
        window.setTimeout(() => setCopied(""), 2500);
      })
      .catch(() => setError("This browser blocked copying. Open a player on the Roster tab to see their contacts."));

  const full = `${body.trim()}\n\n— ${team.name} coaches`;
  const mailto = `mailto:?bcc=${encodeURIComponent(contacts.emails.join(","))}&subject=${encodeURIComponent(subject || `${team.name} update`)}&body=${encodeURIComponent(full)}`;
  const smsLink = `sms:${contacts.phones.join(",")}?&body=${encodeURIComponent(`${team.name}: ${body.trim()}`)}`;

  return (
    <form
      className="hub-compose"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void post({ email: family && email && delivery.email, sms: family && sms && delivery.sms && signedUp > 0 });
      }}
    >
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
      {family && (
        <label className="field">
          <span>Subject</span>
          <input className="input" value={subject} maxLength={MESSAGE_LIMITS.subject} onChange={(e) => setSubject(e.target.value)} placeholder="Saturday's game moved to 10 AM" />
        </label>
      )}
      <label className="field">
        <span>{family ? "Message to players and families" : "Note for the coaches"}</span>
        <textarea
          className="textarea"
          value={body}
          maxLength={MESSAGE_LIMITS.body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={family ? "Arrive by 9:15 in white jerseys. Bring water." : "Install Trips Right Bunch this week. I'll bring cones."}
        />
      </label>

      {family ? (
        <>
          <p className="hint">
            {team.name} has {contacts.emails.length} email {contacts.emails.length === 1 ? "address" : "addresses"} on the roster and {signedUp}{" "}
            {signedUp === 1 ? "phone" : "phones"} signed up for team texts.
          </p>
          <div className="hub-send">
            <div>
              <label className="check">
                <input type="checkbox" checked={email && delivery.email} onChange={(e) => setEmail(e.target.checked)} disabled={!delivery.email} /> <Icon name="mail" size={14} /> Email families
                {!delivery.email && <small> (from your own email app below)</small>}
              </label>
              <label className="check">
                <input type="checkbox" checked={sms && delivery.sms && signedUp > 0} onChange={(e) => setSms(e.target.checked)} disabled={!delivery.sms || !signedUp} /> <Icon name="phone" size={14} /> Text families who signed up
                {!delivery.sms && <small> (from your phone below)</small>}
              </label>
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !ready}>
              {(email && delivery.email) || (sms && delivery.sms && signedUp > 0) ? "Send announcement" : "Save announcement"}
            </button>
          </div>
          {(!delivery.email || !delivery.sms) && (
            <div className="hub-manual">
              {!delivery.email && (
                <div>
                  <b>Email from your own app</b>
                  <div className="fo-actions">
                    {mailto.length <= MAILTO_MAX ? (
                      <a className={`btn btn-quiet btn-sm${!ready || !contacts.emails.length ? " is-disabled" : ""}`} href={ready && contacts.emails.length ? mailto : undefined} aria-disabled={!ready || !contacts.emails.length}>
                        <Icon name="mail" size={13} /> Open my email (Bcc families)
                      </a>
                    ) : null}
                    <button type="button" className="btn btn-quiet btn-sm" disabled={!contacts.emails.length} onClick={() => copy(contacts.emails.join(", "), "Addresses copied. Paste them in Bcc.")}>
                      <Icon name="copy" size={13} /> Copy addresses
                    </button>
                  </div>
                </div>
              )}
              {!delivery.sms && (
                <div>
                  <b>Text from your phone</b>
                  <div className="fo-actions">
                    <a className={`btn btn-quiet btn-sm${!ready || !contacts.phones.length ? " is-disabled" : ""}`} href={ready && contacts.phones.length ? smsLink : undefined} aria-disabled={!ready || !contacts.phones.length}>
                      <Icon name="phone" size={13} /> Open Messages
                    </a>
                    <button type="button" className="btn btn-quiet btn-sm" disabled={!contacts.phones.length} onClick={() => copy(contacts.phones.join(", "), "Numbers copied.")}>
                      <Icon name="copy" size={13} /> Copy numbers
                    </button>
                  </div>
                </div>
              )}
              <small className="hint">Then press Save announcement so your staff can see what went out.</small>
              {copied && (
                <small className="hint" role="status">
                  {copied}
                </small>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="hub-send">
          {hub.role === "director" ? (
            <label className="check">
              <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Every coach in {hub.org.name}, not just {team.name}
            </label>
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !ready}>
            <Icon name="message" size={13} /> Post
          </button>
        </div>
      )}
    </form>
  );
}

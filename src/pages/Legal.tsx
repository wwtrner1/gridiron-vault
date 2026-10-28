import { Link } from "react-router-dom";
import { MarketingFooter, MarketingNav } from "../components/Marketing";
import { SUPPORT_EMAIL } from "../lib/site";
import "../styles/home.css";
import "../styles/help.css";
import "../styles/legal.css";

/*
 * Plain-language Privacy Policy and Terms of Use (Phase 6). They describe what
 * the app actually does today; update them whenever data handling changes.
 * Drafted without a lawyer — have one review before charging for plans.
 */

const UPDATED = "October 28, 2026";

function Contact() {
  return SUPPORT_EMAIL ? (
    <>
      email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or use the <Link to="/help">Help &amp; feedback</Link> form
    </>
  ) : (
    <>
      use the <Link to="/help">Help &amp; feedback</Link> form
    </>
  );
}

function LegalPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="marketing">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <MarketingNav />
      <main id="main">
        <section className="help-hero" aria-labelledby="legal-h">
          <p className="home-eyebrow">{eyebrow}</p>
          <h1 id="legal-h">{title}</h1>
          <p>Last updated {UPDATED}. Written in plain words — if anything is unclear, ask us.</p>
        </section>
        <article className="legal-body">{children}</article>
      </main>
      <MarketingFooter />
    </div>
  );
}

export function Privacy() {
  return (
    <LegalPage eyebrow="Privacy Policy" title="Your playbook stays yours.">
      <h2>The short version</h2>
      <ul>
        <li>We keep what it takes to run your account and your playbook — nothing more.</li>
        <li>We don't sell your data, show ads, or share your plays with other coaches unless you choose to.</li>
        <li>You can delete your account, and everything saved with it, any time from Your account.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Account:</b> your name, email and password. Passwords are stored by our sign-in provider in scrambled form; we
          never see them.
        </li>
        <li>
          <b>Mobile number:</b> one per account, so each login belongs to one coach. We text a code to it when you add it and
          when you sign in on a new device.
        </li>
        <li>
          <b>Devices:</b> a random code each browser makes for itself, kept in that browser and in a cookie only our site can
          read, and stored on our side only as a one-way fingerprint, so we can recognise up to five devices you've confirmed.
        </li>
        <li>
          <b>Recently deleted work:</b> a play, playbook or Call Sheet you delete is kept for 30 days so it can be put back if
          it was a mistake, then removed. Deleting your account removes your work at once.
        </li>
        <li>
          <b>Visits:</b> to count visitors and how long people stay, each page view sends us the page name, the site you came
          from, your device type and how many seconds the page was in view. We keep no IP address and set no cookie for this,
          and the visitor count uses a code that changes every day, so we can't follow you from one day to the next. If your
          browser sends Do Not Track or Global Privacy Control, nothing is sent.
        </li>
        <li>
          <b>Sign-up record:</b> when you delete your account we keep your email, sign-up date and a one-way fingerprint of
          your phone number and of your email (not the number, and none of your plays), so one person can't open an endless run of free trials.
        </li>
        <li>
          <b>Your work:</b> plays, playbooks and Call Sheets you save to your account.
        </li>
        <li>
          <b>What you send to Griddy:</b> your messages, any file of plays you attach, a whiteboard photo, and — so Griddy can
          find your plays — the names, formations and tags of the plays in your Vault go to our AI provider, and the answer
          comes back to you. We don't keep the photo or the conversation.
        </li>
        <li>
          <b>Feedback:</b> whatever you write on Help &amp; feedback, plus an optional email and screenshot.
        </li>
        <li>
          <b>Team texts:</b> when a parent, guardian or player signs up on a team's texts link, we keep the mobile number,
          the names they enter, the team and when they agreed, so the team's coaches can text them updates.
        </li>
        <li>
          <b>Usage counts:</b> how many AI requests and text codes your account used today, to keep the daily limits fair.
        </li>
      </ul>
      <p>
        Some things never leave your browser: plays you make before signing in, your activity counts on Your account, and
        the Call Sheet's autocomplete memory.
      </p>

      <h2>Who helps us run GridIronVault</h2>
      <ul>
        <li>
          <b>Netlify</b> hosts the site and stores accounts, plays and feedback.
        </li>
        <li>
          <b>Twilio</b> sends the text-message codes and team texts.
        </li>
        <li>
          <b>Anthropic</b> (Claude) powers Griddy: it reads your messages, play calls and whiteboard photos.
        </li>
      </ul>
      <p>Each only gets what it needs for that job.</p>

      <h2>Text messages</h2>
      <p>
        No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text
        messaging opt-in data and consent will not be shared with any third parties. Your number is used only for the
        texts you signed up for: sign-in codes, and team updates from the coaches of a team you joined. Reply STOP to any
        team text to stop them, or ask the team's coach to take you off.
      </p>

      <h2>Players and kids</h2>
      <p>
        Accounts are for coaches, 18 and older. Players appear on plays by position letter or number, not by name, and we
        don't knowingly collect information from children. If you think a child made an account, tell us and we'll delete
        it.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <b>Download</b> a copy of your plays from Your account → Download a backup.
        </li>
        <li>
          <b>Delete everything</b> from Your account → Delete my account. It removes your sign-in, phone number, devices,
          and every play, playbook and Call Sheet saved to your account.
        </li>
        <li>
          <b>Forget a device</b> from Your account → Devices.
        </li>
      </ul>

      <h2>Changes and questions</h2>
      <p>
        If this policy changes, we'll update the date at the top and tell signed-in coaches about anything important. For
        questions, <Contact />.
      </p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage eyebrow="Terms of Use" title="The ground rules.">
      <h2>Using GridIronVault</h2>
      <ul>
        <li>Accounts are for coaches and staff, 18 and older. One account per person, tied to one mobile number.</li>
        <li>Keep your password and devices safe — you're responsible for what happens on your account.</li>
        <li>
          GridIronVault is in <b>beta</b>. It's free while we test, features may change, and things may break. Download a
          backup of anything you can't afford to lose.
        </li>
      </ul>

      <h2>Team texts</h2>
      <ul>
        <li>
          Parents, guardians and players can sign up on a team's link to get texts from that team's coaches, sent by
          GridIronVault: game and practice times, schedule changes, cancellations and reminders.
        </li>
        <li>Message frequency varies, usually 1 to 4 a week during the season. Message and data rates may apply.</li>
        <li>
          Reply <b>STOP</b> to any team text to cancel; you'll get one text confirming it. Reply <b>START</b> to sign up
          again, or <b>HELP</b> for help. Signing up is never a condition of joining a team.
        </li>
        <li>Carriers aren't liable for delayed or undelivered messages.</li>
        <li>Coaches may only use team texts for their own team's updates, never for advertising.</li>
      </ul>

      <h2>Your plays belong to you</h2>
      <p>
        You own the plays, playbooks, notes and files you create or upload. You let us store, display and process them only
        to run the service for you — for example to show them on your devices, print wristbands, or read a whiteboard photo.
        Nothing you make is shown to other coaches unless you share it.
      </p>

      <h2>Only upload what you have the right to use</h2>
      <p>
        Don't upload playbooks, images or video you don't own or have permission to use, and don't use GridIronVault for
        anything unlawful, abusive, or to get around its limits (for example, making extra accounts or overloading the
        service). We may remove content or close accounts that break these rules.
      </p>

      <h2>Copyright concerns</h2>
      <p>
        If you believe something on GridIronVault infringes your copyright, <Contact /> with: the work, where it appears on
        GridIronVault, your contact details, and a statement that you believe in good faith the use isn't authorised. We'll
        review it and take it down if it infringes.
      </p>

      <h2>Our part</h2>
      <p>
        GridIronVault and its design, code and starter content belong to us. Football concepts, formations and route names
        are common coaching language and free for everyone. GridIronVault is independent — not affiliated with any league or
        governing body.
      </p>

      <h2>No guarantees</h2>
      <p>
        The service is provided "as is." We work hard to keep your plays safe, but we can't promise it will always be
        available or error-free. To the extent the law allows, we aren't liable for lost data, lost games, or indirect
        damages, and our total liability is limited to what you paid us in the past 12 months.
      </p>

      <h2>Plans and changes</h2>
      <p>
        Paid plans aren't live yet. When they are, prices and billing terms will be shown before you pay, and payments will
        be handled by a payment processor — card numbers never touch GridIronVault. We may update these terms; if a change
        matters, we'll tell signed-in coaches before it takes effect. Leaving is always free: delete your account any time.
      </p>

      <h2>Questions</h2>
      <p>
        <Contact />. See also our <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}

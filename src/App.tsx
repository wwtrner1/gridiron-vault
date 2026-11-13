import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Suspense, useEffect, useState } from "react";
import { ToastProvider } from "./lib/toast";
import { GriddyProvider } from "./components/Griddy";
import { CarryOver } from "./components/CarryOver";
import { StorageWatch } from "./components/StorageWatch";
import { ScanJobBar } from "./components/ScanJobBar";
import { PlaybookSync } from "./lib/playbookSync";
import { PlaySync } from "./lib/playSync";
import { BrandSync } from "./lib/brand";
import { TermSync } from "./lib/terms";
import { SheetSync } from "./lib/sheetSync";
import { PhoneGate } from "./components/PhoneGate";
import { NewPassword } from "./components/NewPassword";
import { Landing } from "./pages/Landing";
import { NotFound } from "./pages/NotFound";
import { useFreePrint } from "./lib/guard";
import { useTier } from "./lib/tier";
import { notePage } from "./lib/lastPage";
import { useVisitCounter } from "./lib/visits";
import { COMING_SOON, ComingSoon } from "./pages/ComingSoon";
import { TourProvider } from "./components/Tour";
import { lazyPage, PageLoading, warmPages, warmPart } from "./lib/lazyPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applySeo } from "./lib/seo";
import { getPageMetadata } from "./lib/pageMetadata";
import { useAuth } from "./lib/auth";
import { useCaptureLog } from "./lib/captureLog";
import { setTraceUser } from "./lib/activity";

// Every screen but the home page loads on first visit (see lib/lazyPage).
const Pricing = lazyPage(() => import("./pages/Pricing"), "Pricing");
/** My team's account sync renders nothing, and its roster code (lib/teamHub) belongs with the My team and Front Office screens, not the first download. */
const MyTeamSync = lazyPage(() => import("./lib/teamSource"), "MyTeamSync");
const Builder = lazyPage(() => import("./pages/Builder"), "Builder");
const Vault = lazyPage(() => import("./pages/Vault"), "Vault");
const Playbooks = lazyPage(() => import("./pages/Playbooks"), "Playbooks");
const SeasonGrid = lazyPage(() => import("./pages/SeasonGrid"), "SeasonGrid");
const Starters = lazyPage(() => import("./pages/Starters"), "Starters");
const Account = lazyPage(() => import("./pages/Account"), "Account");
const SignIn = lazyPage(() => import("./pages/SignIn"), "SignIn");
const Help = lazyPage(() => import("./pages/Help"), "Help");
const Wristbands = lazyPage(() => import("./pages/Wristbands"), "Wristbands");
const PlaybookLanguage = lazyPage(() => import("./pages/PlaybookLanguage"), "PlaybookLanguage");
const Upload = lazyPage(() => import("./pages/Upload"), "Upload");
const Assignments = lazyPage(() => import("./pages/Assignments"), "Assignments");
const Practice = lazyPage(() => import("./pages/Practice"), "Practice");
const Coverage = lazyPage(() => import("./pages/Coverage"), "Coverage");
const Team = lazyPage(() => import("./pages/Team"), "Team");
const Join = lazyPage(() => import("./pages/Join"), "Join");
const Admin = lazyPage(() => import("./pages/Admin"), "Admin");
const Tools = lazyPage(() => import("./pages/Tools"), "Tools");
const FrontOffice = lazyPage(() => import("./pages/FrontOffice"), "FrontOffice");
const MyTeam = lazyPage(() => import("./pages/MyTeam"), "MyTeam");
const TextTeam = lazyPage(() => import("./pages/TextTeam"), "TextTeam");
const Tutorials = lazyPage(() => import("./pages/Tutorials"), "Tutorials");
const Privacy = lazyPage(() => import("./pages/Legal"), "Privacy");
const Terms = lazyPage(() => import("./pages/Legal"), "Terms");


const NAMES: Record<string, string> = {
  "/": "Home",
  "/build": "Designer",
  "/vault": "The Vault",
  "/playbooks": "Playbooks",
  "/grid": "Call Sheet",
  "/starters": "Starter plays",
  "/pricing": "Plans",
  "/account": "Your account",
  "/signin": "Sign in",
  "/help": "Help & feedback",
  "/privacy": "Privacy Policy",
  "/terms": "Terms of Use",
  "/wristbands": "Wristbands",
  "/language": "Playbook language",
  "/upload": "Upload plays",
  "/assignments": "Assignments",
  "/team": "Player playbook",
  "/join": "Team texts sign-up",
  "/practice": "Practice",
  "/coverage": "Coverage report",
  "/admin": "Admin",
  "/tools": "More tools",
  "/front-office": "Front Office",
  "/roster": "My team",
  "/roster/text": "Text the team",
  "/tutorials": "Tutorials",
  ...Object.fromEntries(Object.entries(COMING_SOON).map(([p, s]) => [p, s.title])),
};

/**
 * A single-page app swaps the view without a page load, so a screen reader
 * gets no announcement. This sets the document title and speaks the new page
 * name through a live region.
 */
/** Old /game/:id links (bookmarks, schedule entries) land on that Call Sheet. */
function GameDayMoved() {
  const { id } = useParams();
  return <Navigate to={id ? `/grid?sheet=${encodeURIComponent(id)}` : "/grid"} replace />;
}

function RouteChrome() {
  const { pathname } = useLocation();
  const [spoken, setSpoken] = useState("");
  useVisitCounter();
  useEffect(() => {
    notePage(pathname);
    const key = pathname.startsWith("/build") ? "/build" : pathname.startsWith("/team/") ? "/team" : pathname.startsWith("/join/") ? "/join" : pathname;
    document.title = getPageMetadata(pathname).title;
    applySeo(pathname);
    setSpoken(`${NAMES[key] ?? "Page not found"} page`);
    if (!pathname.startsWith("/build")) window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {spoken}
    </p>
  );
}

/** Public reading pages: the offline warm-up waits until the visitor opens a tool screen. */
const BROWSING_ONLY = new Set(["/", "/pricing", "/privacy", "/terms"]);

export function App() {
  const { pathname } = useLocation();
  const { account } = useAuth();
  useFreePrint(useTier().watermark);
  // The owner's audit: capture signals while signed in, and the trace code exported PDFs carry.
  useCaptureLog(Boolean(account));
  useEffect(() => setTraceUser(account?.id), [account?.id]);
  // A visitor reading the home page, plans or legal pages hasn't opened a tool yet: don't spend
  // their data (about 1.5 MB of screens and PDF libraries) until they do. warmPages runs once.
  const browsing = BROWSING_ONLY.has(pathname);
  useEffect(() => {
    if (browsing) return;
    const t = window.setTimeout(warmPages, 2500);
    return () => window.clearTimeout(t);
  }, [browsing]);
  // Printing at the field with no signal: wristband cards and the export preview need the PDF
  // libraries, which no screen pulls in until a coach presses Print. Warm them after the screens.
  useEffect(() => {
    warmPart(() => import("jspdf"));
    warmPart(() => import("svg2pdf.js"));
    warmPart(() => import("./lib/scanPdf").then((m) => fetch(m.PDF_WORKER_URL)));
  }, []);
  return (
    <ToastProvider>
      <GriddyProvider>
      <TourProvider>
      <RouteChrome />
      <CarryOver />
      <StorageWatch />
      <ScanJobBar />
      <PlaySync />
      <PlaybookSync />
      <Suspense fallback={null}>
        <MyTeamSync />
      </Suspense>
      <BrandSync />
      <TermSync />
      <SheetSync />
      <PhoneGate />
      <NewPassword />
      {/* One screen failing shows a way back instead of a blank page; Griddy and the rest stay up. */}
      <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/build" element={<Builder />} />
        <Route path="/build/:id" element={<Builder />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/playbooks" element={<Playbooks />} />
        <Route path="/grid" element={<SeasonGrid />} />
        <Route path="/grid/:id" element={<SeasonGrid />} />
        <Route path="/starters" element={<Starters />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/account" element={<Account />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/help" element={<Help />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/wristbands" element={<Wristbands />} />
        <Route path="/language" element={<PlaybookLanguage />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/assignments" element={<Assignments />} />
        <Route path="/team/:token" element={<Team />} />
        <Route path="/join/:token" element={<Join />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/coverage" element={<Coverage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/front-office" element={<FrontOffice />} />
        <Route path="/roster" element={<MyTeam />} />
        <Route path="/roster/text" element={<TextTeam />} />
        <Route path="/tutorials" element={<Tutorials />} />
        {/* Game Day was retired: old links open the Call Sheet they pointed at. */}
        <Route path="/game" element={<Navigate to="/grid" replace />} />
        <Route path="/game/:id" element={<GameDayMoved />} />
        {Object.keys(COMING_SOON).map((p) => (
          <Route key={p} path={p} element={<ComingSoon path={p} />} />
        ))}
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      </TourProvider>
      </GriddyProvider>
    </ToastProvider>
  );
}

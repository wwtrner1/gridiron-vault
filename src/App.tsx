import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ToastProvider } from "./lib/toast";
import { GriddyProvider } from "./components/Griddy";
import { CarryOver } from "./components/CarryOver";
import { PlaybookSync } from "./lib/playbookSync";
import { MyTeamSync } from "./lib/teamSource";
import { SheetSync } from "./lib/sheetSync";
import { PhoneGate } from "./components/PhoneGate";
import { NewPassword } from "./components/NewPassword";
import { Landing } from "./pages/Landing";
import { Pricing } from "./pages/Pricing";
import { Builder } from "./pages/Builder";
import { Vault } from "./pages/Vault";
import { Playbooks } from "./pages/Playbooks";
import { SeasonGrid } from "./pages/SeasonGrid";
import { Starters } from "./pages/Starters";
import { Account } from "./pages/Account";
import { SignIn } from "./pages/SignIn";
import { NotFound } from "./pages/NotFound";
import { Help } from "./pages/Help";
import { Privacy, Terms } from "./pages/Legal";
import { Wristbands } from "./pages/Wristbands";
import { PlaybookLanguage } from "./pages/PlaybookLanguage";
import { Upload } from "./pages/Upload";
import { Assignments } from "./pages/Assignments";
import { Practice } from "./pages/Practice";
import { Team } from "./pages/Team";
import { Join } from "./pages/Join";
import { Admin } from "./pages/Admin";
import { useFreePrint } from "./lib/guard";
import { useTier } from "./lib/tier";
import { notePage } from "./lib/lastPage";
import { useVisitCounter } from "./lib/visits";
import { COMING_SOON, ComingSoon } from "./pages/ComingSoon";
import { Tools } from "./pages/Tools";
import { FrontOffice } from "./pages/FrontOffice";
import { MyTeam } from "./pages/MyTeam";

const TITLES: Record<string, string> = {
  "/": "GridIronVault — Flag Football Playbook Studio",
  "/build": "Designer — GridIronVault",
  "/vault": "The Vault — GridIronVault",
  "/playbooks": "Playbooks — GridIronVault",
  "/grid": "Call Sheet — GridIronVault",
  "/starters": "Starter plays — GridIronVault",
  "/pricing": "Plans — GridIronVault",
  "/account": "Your account — GridIronVault",
  "/signin": "Sign in — GridIronVault",
  "/help": "Help & feedback — GridIronVault",
  "/privacy": "Privacy Policy — GridIronVault",
  "/terms": "Terms of Use — GridIronVault",
  "/wristbands": "Wristbands — GridIronVault",
  "/language": "Playbook language — GridIronVault",
  "/upload": "Upload plays — GridIronVault",
  "/assignments": "Assignments — GridIronVault",
  "/team": "Your playbook — GridIronVault",
  "/join": "Team texts sign-up — GridIronVault",
  "/practice": "Practice — GridIronVault",
  "/admin": "Admin — GridIronVault",
  "/tools": "More tools — GridIronVault",
  "/front-office": "Front Office — GridIronVault",
  "/roster": "My team — GridIronVault",
  ...Object.fromEntries(Object.entries(COMING_SOON).map(([p, s]) => [p, `${s.title} — GridIronVault`])),
};

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
  "/admin": "Admin",
  "/tools": "More tools",
  "/front-office": "Front Office",
  "/roster": "My team",
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
    document.title = TITLES[key] ?? "GridIronVault";
    setSpoken(`${NAMES[key] ?? "Page not found"} page`);
    if (!pathname.startsWith("/build")) window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {spoken}
    </p>
  );
}

export function App() {
  useFreePrint(useTier().watermark);
  return (
    <ToastProvider>
      <GriddyProvider>
      <RouteChrome />
      <CarryOver />
      <PlaybookSync />
      <MyTeamSync />
      <SheetSync />
      <PhoneGate />
      <NewPassword />
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
        <Route path="/admin" element={<Admin />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/front-office" element={<FrontOffice />} />
        <Route path="/roster" element={<MyTeam />} />
        {/* Game Day was retired: old links open the Call Sheet they pointed at. */}
        <Route path="/game" element={<Navigate to="/grid" replace />} />
        <Route path="/game/:id" element={<GameDayMoved />} />
        {Object.keys(COMING_SOON).map((p) => (
          <Route key={p} path={p} element={<ComingSoon path={p} />} />
        ))}
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </GriddyProvider>
    </ToastProvider>
  );
}

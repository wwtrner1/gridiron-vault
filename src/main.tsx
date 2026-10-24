import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/griddy.css";
import "./styles/team.css";
// Catch the browser's install prompt early, whichever page the coach lands on.
import "./lib/install";

// On the old netlify.app address public/handoff.js is packing this browser's plays and forwarding to
// gridiron-vault.com; the app stays asleep there so it can't write over what is being carried.
const handingOff = (window as unknown as { __g1vHandoff?: boolean }).__g1vHandoff === true;

if (!handingOff) {
  createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
  );
}

// Installable app: the service worker makes it open fast and work with a weak signal (public/sw.js).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* the site works the same without it */
    });
  });
}

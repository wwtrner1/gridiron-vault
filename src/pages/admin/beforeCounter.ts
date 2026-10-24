/**
 * Traffic from before GridIronVault's own visitor counter existed, copied from
 * Netlify Web Analytics (the owner read it off the Netlify dashboard on 2026-10-24).
 * Netlify only keeps 30 days, so this is all the history there is. It is raw: it
 * includes bots and crawlers, so it overstates real coaches.
 */
export const BEFORE_COUNTER = {
  source: "Netlify Web Analytics",
  from: "2026-09-24",
  to: "2026-10-24",
  pageviews: 1560,
  uniqueVisitors: 521,
  bandwidthMb: 392,
  dailyUniques: "10 on Sep 24, rising to 91 on Oct 24",
  topPages: [
    { name: "/", n: 780 },
    { name: "/index.html", n: 212 },
    { name: "/robots.txt", n: 118 },
    { name: "/vault", n: 110 },
    { name: "/build", n: 52 },
    { name: "/upload", n: 13 },
    { name: "/signin", n: 13 },
    { name: "/pricing", n: 12 },
    { name: "/starters", n: 11 },
  ],
  sources: [
    { name: "Direct", n: 1093 },
    { name: "app.netlify.com", n: 12 },
    { name: "facebook.com", n: 9 },
    { name: "github.com", n: 1 },
  ],
  countries: [
    { name: "United States", n: 1423 },
    { name: "France", n: 45 },
    { name: "Germany", n: 36 },
    { name: "Netherlands", n: 34 },
    { name: "Canada", n: 4 },
  ],
} as const;

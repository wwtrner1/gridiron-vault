/*
 * Metricool site tracking: shows which social posts send people to the public
 * pages. Loaded from our own origin (the CSP allows no inline scripts), and only
 * on the home and pricing pages: never on a tool screen, a team link or a guide.
 * Do Not Track and Global Privacy Control switch it off, like the visitor counter.
 */
(function () {
  var path = location.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/" && path !== "/pricing") return;
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;
  function loadScript(a) {
    var b = document.getElementsByTagName("head")[0],
      c = document.createElement("script");
    c.type = "text/javascript";
    c.src = "https://tracker.metricool.com/resources/be.js";
    c.onreadystatechange = a;
    c.onload = a;
    b.appendChild(c);
  }
  loadScript(function () {
    beTracker.t({ hash: "3727a27473556813a5e301c758aade49" });
  });
})();

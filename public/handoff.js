/*
 * Hand-off from gridiron-vault.netlify.app to gridiron-vault.com.
 * localStorage belongs to one origin, so plays saved under the netlify.app
 * address can't be read from gridiron-vault.com. Loaded first thing from
 * index.html; on any other host it does nothing. On the old host it packs this
 * browser's GridIronVault data into the link (#carry=…), forwards to the same
 * page on gridiron-vault.com, and src/components/CarryOver.tsx unpacks it there.
 * It sends the data once per browser (so a play deleted on the new address
 * can't come back from a stale copy); add ?recarry=1 to send it again.
 * Keep the packing block in step with old-address/move.js.
 */
(function () {
  if (location.hostname !== "gridiron-vault.netlify.app") return;
  // main.tsx checks this so the app doesn't start on the old address while the data is packed.
  window.__g1vHandoff = true;
  var SENT = "grid1ronvault.handedOff.v1";
  var params = new URLSearchParams(location.search);
  var again = params.get("recarry") === "1";
  params.delete("recarry");
  var search = params.toString() ? "?" + params.toString() : "";
  var dest = "https://gridiron-vault.com" + location.pathname + search;
  var go = function (hash) {
    location.replace(dest + (hash || location.hash));
  };

  // Everything a coach saved in this browser: the workspace, plus every other
  // GridIronVault setting. Sign-in (gotrue.*) is never touched.
  var PREFIXES = ["snapline.", "grid1ronvault.", "nextplay."];
  var WS = "snapline.workspace.v1";
  var PRESETS = "grid1ronvault.playerPresets.v1";
  var collect = function (withKeys) {
    var ws = JSON.parse(localStorage.getItem(WS) || "null");
    var presets = JSON.parse(localStorage.getItem(PRESETS) || "null");
    var hasWs = ws && ((ws.plays && ws.plays.length) || (ws.playbooks && ws.playbooks.length) || (ws.sheets && ws.sheets.length));
    var keys = {};
    var n = 0;
    if (withKeys) {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("gotrue.") === 0 || k === WS || k === PRESETS || k === "grid1ronvault.handedOff.v1") continue;
        if (!PREFIXES.some(function (p) { return k.indexOf(p) === 0; })) continue;
        var v = localStorage.getItem(k);
        if (typeof v === "string") { keys[k] = v; n++; }
      }
    }
    if (!hasWs && !n && !(presets && presets.length)) return null;
    return JSON.stringify({ v: 2, ws: hasWs ? ws : null, presets: presets, keys: keys });
  };
  var b64url = function (bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  var encode = async function (payload) {
    try {
      var stream = new Blob([payload]).stream().pipeThrough(new CompressionStream("gzip"));
      return "gz." + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
    } catch (e) {
      return "raw." + b64url(new TextEncoder().encode(payload));
    }
  };
  // Link too big? Retry with just the plays, then give up and forward plain.
  var LIMIT = 1500000;
  var build = async function () {
    var data = null;
    try {
      var full = collect(true);
      if (full) data = await encode(full);
      if (data && data.length > LIMIT) {
        var lean = collect(false);
        data = lean ? await encode(lean) : null;
      }
    } catch (e) {
      data = null;
    }
    return data && data.length <= LIMIT ? data : null;
  };

  var run = async function () {
    // Identity links (#confirmation_token, #recovery_token…) keep their hash and carry nothing.
    if (/^#\w+_token=/.test(location.hash)) return go();
    try {
      if (!again && localStorage.getItem(SENT)) return go();
    } catch (e) {
      return go();
    }
    var data = await build();
    if (data) {
      try { localStorage.setItem(SENT, String(Date.now())); } catch (e) { /* storage blocked: nothing was readable anyway */ }
    }
    go(data ? "#carry=" + data : "");
  };
  run().catch(function () { go(); });
})();

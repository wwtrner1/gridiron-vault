/*
 * The old address (gridi1ronvault.netlify.app) forwards every link straight to
 * the same page on gridiron-vault.com (no stop at gridiron-vault.netlify.app on
 * the way). Plays and settings a coach saved in this browser under the old
 * address can't be read from the new one, so they ride along in the link
 * (#carry=…) and the app unpacks them there (src/components/CarryOver.tsx).
 * public/handoff.js does the same for gridiron-vault.netlify.app; keep the two
 * packing blocks in step.
 */
(async function () {
  var NEW = "https://gridiron-vault.com";
  var dest = NEW + location.pathname + location.search;
  document.getElementById("go").href = dest;
  // Identity links (#confirmation_token, #recovery_token…) keep their hash.
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

  if (/^#\w+_token=/.test(location.hash)) return go();
  var data = null;
  try {
    if (collect(true)) document.getElementById("msg").textContent = "Moving your plays to the new address…";
    data = await build();
  } catch (e) {
    data = null;
  }
  go(data ? "#carry=" + data : "");
})();

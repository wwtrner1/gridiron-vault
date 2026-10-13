/*
 * The old address (gridi1ronvault.netlify.app) forwards every link to the same
 * page on the new one. Plays a coach saved in this browser under the old
 * address can't be read from the new one, so they ride along in the link
 * (#carry=…) and the app unpacks them there (src/components/CarryOver.tsx).
 */
(async function () {
  var NEW = "https://gridiron-vault.netlify.app";
  var dest = NEW + location.pathname + location.search;
  document.getElementById("go").href = dest;
  // Identity links (#confirmation_token, #recovery_token…) keep their hash.
  var go = function (hash) {
    location.replace(dest + (hash || location.hash));
  };

  var payload = null;
  try {
    var ws = JSON.parse(localStorage.getItem("snapline.workspace.v1") || "null");
    var presets = JSON.parse(localStorage.getItem("grid1ronvault.playerPresets.v1") || "null");
    var has = ws && ((ws.plays && ws.plays.length) || (ws.playbooks && ws.playbooks.length) || (ws.sheets && ws.sheets.length));
    if (has && !/^#\w+_token=/.test(location.hash)) payload = JSON.stringify({ v: 1, ws: ws, presets: presets });
  } catch (e) {
    payload = null;
  }
  if (!payload) return go();

  document.getElementById("msg").textContent = "Moving your plays to the new address…";
  var b64url = function (bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  var data;
  try {
    var stream = new Blob([payload]).stream().pipeThrough(new CompressionStream("gzip"));
    data = "gz." + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
  } catch (e) {
    data = "raw." + b64url(new TextEncoder().encode(payload));
  }
  // A Vault too big for one link just forwards; plays saved to an account are on the new address anyway.
  go(data.length > 1500000 ? "" : "#carry=" + data);
})();

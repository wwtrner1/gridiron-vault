// /partners: the Copy email button. Kept in its own file because the CSP allows scripts from our origin only.
document.addEventListener("DOMContentLoaded", function () {
  var copyBtn = document.getElementById("copy");
  var email = document.getElementById("email");
  if (!copyBtn || !email) return;
  copyBtn.addEventListener("click", function () {
    var done = function () {
      copyBtn.textContent = "Copied";
      setTimeout(function () { copyBtn.textContent = "Copy email"; }, 1800);
    };
    var fallback = function () {
      var range = document.createRange();
      range.selectNodeContents(email);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      copyBtn.textContent = "Selected";
    };
    try { navigator.clipboard.writeText(email.textContent).then(done, fallback); } catch (e) { fallback(); }
  });
});

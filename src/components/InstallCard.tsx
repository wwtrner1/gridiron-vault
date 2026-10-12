import { promptInstall, useInstall } from "../lib/install";

/** Account page: put GridIronVault on the home screen like an app. */
export function InstallCard() {
  const install = useInstall();
  return (
    <section className="card">
      <h3>GridIronVault on your phone</h3>
      {install === "installed" ? (
        <p>You're using the installed app.</p>
      ) : install === "prompt" ? (
        <>
          <p>Add it to your home screen: it opens full screen, without the browser bar, and starts quickly at the field.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void promptInstall()}>
            Install the app
          </button>
        </>
      ) : install === "ios" ? (
        <p>
          In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. GridIronVault opens full screen from your home screen, like an app.
        </p>
      ) : (
        <p>
          On a phone or tablet, open this site in Chrome (Android) or Safari (iPhone and iPad) and add it to the home screen. On a
          laptop, use the install button in the address bar of Chrome or Edge.
        </p>
      )}
    </section>
  );
}

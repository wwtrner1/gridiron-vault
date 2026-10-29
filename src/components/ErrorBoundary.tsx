import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Changing it (the route's path) clears a caught error, so moving to another screen tries again. */
  resetKey?: string;
  /** "screen": one page broke, the rest of the app stays. "app": nothing else could draw. */
  scope?: "screen" | "app";
};
type State = { failed: boolean };

/**
 * Without this, one broken screen blanks the whole app to white. A coach
 * gets a plain way back instead; plays saved in this browser are untouched,
 * since nothing here clears storage.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("A screen failed to draw", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const app = this.props.scope === "app";
    return (
      // The crash card replaces the whole screen (Shell included), so it is the page's main landmark.
      <main id="main" className="crash">
        <div className="crash-card" role="alert">
          <p className="eyebrow">Something broke</p>
          <h1>{app ? "GridIronVault hit a problem" : "This screen hit a problem"}</h1>
          <p>
            Plays you saved are safe: nothing was deleted. Reloading usually fixes it. If it keeps happening, tell us on Help &amp; feedback
            what you pressed just before.
          </p>
          <div className="crash-acts">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            {/* A full page load, not a router link: the router may be what broke. */}
            <a className="btn btn-ghost" href="/vault">
              Go to the Vault
            </a>
            <a className="btn btn-quiet" href="/help">
              Help &amp; feedback
            </a>
          </div>
        </div>
      </main>
    );
  }
}

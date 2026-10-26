import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Mark } from "../components/Shell";

export function NotFound() {
  return (
    <main className="notfound">
      <Mark size={40} />
      <span className="pill">Fourth and long</span>
      <h1>That page is not in the book</h1>
      <p>The link you followed does not point anywhere. Here is where most coaches were headed.</p>
      <div className="notfound-links">
        <Link to="/build" className="btn btn-primary">
          <Icon name="cursor" size={16} /> Open the designer
        </Link>
        <Link to="/vault" className="btn btn-ghost">
          <Icon name="board" size={16} /> The Vault
        </Link>
        <Link to="/grid" className="btn btn-ghost">
          <Icon name="table" size={16} /> Call Sheet
        </Link>
        <Link to="/" className="btn btn-quiet">
          Back to the front page
        </Link>
      </div>
    </main>
  );
}

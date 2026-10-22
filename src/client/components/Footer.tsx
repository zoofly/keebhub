import { Link } from "react-router";

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface px-4 py-6 text-center text-sm text-muted">
      <p>
        © {new Date().getFullYear()} Keebhub · A Prime Digital Academy project ·{" "}
        <Link to="/about">About</Link>
      </p>
    </footer>
  );
}

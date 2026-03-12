import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <h1 className="text-3xl font-bold">404</h1>
        <p className="mt-2 text-[var(--text-secondary)]">Page not found</p>
        <Link to="/" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white">Go Home</Link>
      </div>
    </div>
  );
}

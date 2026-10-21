import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <span>404 / SIGNAL LOST</span>
      <h1>Nothing on this route.</h1>
      <Link href="/">Return home →</Link>
    </main>
  );
}

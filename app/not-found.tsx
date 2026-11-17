import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <header className="page-heading"><h1>Page not found</h1></header>
      <Link className="text-link" href="/">Back to home</Link>
    </>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="text-center py-20">
      <p className="text-5xl mb-3">🏀</p>
      <h1 className="text-2xl font-bold mb-2">Air ball. Page not found.</h1>
      <p className="text-gray-400 mb-5">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary">
        Back to Home
      </Link>
    </div>
  );
}

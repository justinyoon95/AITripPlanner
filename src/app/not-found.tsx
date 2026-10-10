import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main id="main" className="shell empty-state">
      <h1>A little off the map.</h1>
      <p>
        We couldn&apos;t find this page. Let&apos;s get you back to planning.
      </p>
      <Link href="/trips/new" className={buttonVariants()}>
        Plan a trip
      </Link>
    </main>
  );
}

import Link from "next/link";
export function SiteFooter() {
  return (
    <footer className="site-footer shell">
      <Link href="/" className="footer-brand">
        TripPlannerAI
      </Link>
      <span>A little planning. A lot of possibility.</span>
      <span>Sample trip planner · No account needed</span>
    </footer>
  );
}

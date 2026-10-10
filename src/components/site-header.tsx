import Link from "next/link";
import { ArrowUpRight, Compass } from "lucide-react";
import { buttonVariants } from "./ui/button";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link href="/" className="brand" aria-label="TripPlannerAI home">
          <Compass size={27} strokeWidth={1.8} />
          <span>
            TripPlanner<span className="brand-accent">AI</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/trips/new" className="nav-link">
            Trip planner
          </Link>
          <Link
            href="/trips/new"
            className={buttonVariants({ variant: "default" })}
          >
            Plan your trip <ArrowUpRight size={16} />
          </Link>
        </nav>
      </div>
    </header>
  );
}

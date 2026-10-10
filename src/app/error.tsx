"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="shell empty-state">
      <h1>A pause in the journey.</h1>
      <p>Something went wrong opening this page. Please try again.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}

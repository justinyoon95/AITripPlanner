import { notFound } from "next/navigation";
import { z } from "zod";
import { PreviewLoader } from "@/components/trips/preview-loader";
export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();
  return (
    <main id="main" className="shell itinerary-page">
      <PreviewLoader id={tripId} />
    </main>
  );
}

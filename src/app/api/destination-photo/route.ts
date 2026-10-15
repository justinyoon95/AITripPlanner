import { z } from "zod";
import { resolveCity } from "@/lib/geography";
import {
  destinationPhoto,
  trackDestinationPhoto,
  PhotoProviderError,
} from "@/lib/destination-photos";
export const runtime = "nodejs";
const querySchema = z.object({
  id: z.string().regex(/^\d{1,12}$/),
  q: z.string().trim().min(2).max(200),
});
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success)
    return Response.json(
      { error: "Select a recognized destination." },
      { status: 400 },
    );
  let city;
  try {
    city = resolveCity(parsed.data.q, parsed.data.id);
  } catch {
    return Response.json(
      { error: "Destination could not be verified." },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      { photo: await destinationPhoto(city) },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    return Response.json(
      { photo: null, error: "Destination photography is unavailable." },
      {
        status: error instanceof PhotoProviderError ? 429 : 503,
        headers: {
          "Cache-Control": "no-store",
          ...(error instanceof PhotoProviderError
            ? { "Retry-After": String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const schema = z.strictObject({
    token: z.string().min(20).max(2400),
    eventId: z.uuid(),
  });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return new Response(null, { status: 400 });
  }
  let body;
  try {
    body = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!body.success) return new Response(null, { status: 400 });
  try {
    await trackDestinationPhoto(body.data.token, body.data.eventId);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}

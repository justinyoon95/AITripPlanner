import { z } from "zod";
import { resolveCity, searchCities } from "@/lib/geography";
import { GenerationError } from "@/lib/ai/errors";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = z
    .string()
    .trim()
    .min(2)
    .max(100)
    .safeParse(url.searchParams.get("q"));
  if (!query.success)
    return Response.json(
      { error: "Enter 2 to 100 characters." },
      { status: 400 },
    );
  try {
    const value =
      url.searchParams.get("resolve") === "yes"
        ? { destination: resolveCity(query.data) }
        : { destinations: searchCities(query.data) };
    return Response.json(value, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof GenerationError
            ? error.message
            : "Destination search is unavailable. Retry.",
      },
      { status: error instanceof GenerationError ? error.status : 503 },
    );
  }
}

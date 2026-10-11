import { resolveAirport } from "@/lib/geography";
import { GenerationError } from "@/lib/ai/errors";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams
    .get("code")
    ?.trim()
    .toUpperCase();
  if (!code || !/^[A-Z]{3}$/.test(code))
    return Response.json(
      { error: "Enter a three-letter IATA airport code." },
      { status: 400 },
    );
  try {
    return Response.json(
      { airport: resolveAirport(code) },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof GenerationError
            ? error.message
            : "Airport lookup unavailable.",
      },
      { status: error instanceof GenerationError ? error.status : 503 },
    );
  }
}

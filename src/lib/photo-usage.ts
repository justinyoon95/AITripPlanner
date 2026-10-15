import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  photoId: z.string().regex(/^[\w-]{1,80}$/),
  download: z.string().max(1500),
  expires: z.number().int(),
});
export function validDownloadURL(download: string, photoId: string) {
  const url = new URL(download);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.unsplash.com" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== `/photos/${photoId}/download`
  )
    throw new Error("Invalid tracking URL");
  return download;
}
function signature(body: string, key: string) {
  return createHmac("sha256", key)
    .update(`tripplannerai-photo-use:${body}`)
    .digest("hex");
}
export function photoUsageToken(
  photoId: string,
  download: string,
  key: string,
) {
  validDownloadURL(download, photoId);
  const body = Buffer.from(
    JSON.stringify({ photoId, download, expires: Date.now() + 30 * 60_000 }),
  ).toString("base64url");
  return `${body}.${signature(body, key)}`;
}
export function readPhotoUsageToken(token: string, key: string) {
  const [body, mac, extra] = token.split(".");
  if (
    !body ||
    !mac ||
    extra ||
    !/^[a-f0-9]{64}$/.test(mac) ||
    !timingSafeEqual(
      Buffer.from(mac, "hex"),
      Buffer.from(signature(body, key), "hex"),
    )
  )
    throw new Error("Invalid photo use");
  const payload = payloadSchema.parse(
    JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
  );
  if (
    payload.expires < Date.now() ||
    payload.expires > Date.now() + 30 * 60_000
  )
    throw new Error("Expired photo use");
  validDownloadURL(payload.download, payload.photoId);
  return payload;
}

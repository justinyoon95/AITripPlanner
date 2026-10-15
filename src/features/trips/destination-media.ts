import { z } from "zod";

const providerURL = (host: string) =>
  z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host;
  });
export const destinationPhotoSchema = z.object({
  photoId: z.string().regex(/^[\w-]{1,80}$/),
  usageToken: z.string().min(20).max(2400),
  cityId: z.string().regex(/^\d+$/),
  url: providerURL("images.unsplash.com"),
  alt: z.string().min(1).max(300),
  photographer: z.string().min(1).max(100),
  photographerURL: providerURL("unsplash.com"),
  photoURL: providerURL("unsplash.com"),
});
export type DestinationPhoto = z.infer<typeof destinationPhotoSchema>;
export const DEFAULT_DESTINATION_PHOTO =
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=900&q=80";
// Identity verified against the official photo page, not inferred from a CDN ID.
export const DEFAULT_PHOTO_CREDIT = {
  photographer: "Luca Bravo",
  photographerURL:
    "https://unsplash.com/@lucabravo?utm_source=tripplannerai&utm_medium=referral",
  photoURL:
    "https://unsplash.com/photos/wooden-boat-on-lago-di-braies-O453M2Liufs?utm_source=tripplannerai&utm_medium=referral",
};

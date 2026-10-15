"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Destination } from "@/features/trips/planning-schema";
import {
  DEFAULT_DESTINATION_PHOTO,
  DEFAULT_PHOTO_CREDIT,
  type DestinationPhoto as Photo,
} from "@/features/trips/destination-media";
import { requestDestinationPhoto } from "@/features/trips/photo-client";

export function DestinationPhoto({
  destination,
  variant = "card",
}: {
  destination?: Destination;
  variant?: "card" | "hero";
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const currentId = useRef(destination?.id);
  const usage = useRef<{ photoId: string; eventId: string } | null>(null);
  useEffect(() => {
    if (currentId.current !== destination?.id) usage.current = null;
    currentId.current = destination?.id;
    if (!destination) return;
    let active = true;
    void requestDestinationPhoto(destination)
      .then((value) => {
        if (active) setPhoto(value);
      })
      .catch(() => {
        if (active) setPhoto(null);
      });
    return () => {
      active = false;
    };
  }, [destination]);
  const selected = photo?.cityId === destination?.id ? photo : null;
  const visible =
    selected && loaded === selected.url && failed !== selected.url;
  return (
    <div
      className={`destination-photo ${variant === "hero" ? "destination-photo--hero" : "aside-photo"}`}
    >
      <Image
        src={DEFAULT_DESTINATION_PHOTO}
        alt={visible ? "" : "A peaceful lakeside destination in the mountains"}
        aria-hidden={!!visible}
        fill
        unoptimized
        loading={variant === "hero" ? "eager" : "lazy"}
        sizes={variant === "hero" ? "100vw" : "(max-width: 900px) 100vw, 360px"}
      />
      {selected && (
        <Image
          key={selected.url}
          src={selected.url}
          alt={visible ? selected.alt : ""}
          aria-hidden={!visible}
          fill
          unoptimized
          sizes={
            variant === "hero" ? "100vw" : "(max-width: 900px) 100vw, 360px"
          }
          className={`city-photo ${visible ? "is-visible" : ""}`}
          onLoad={() => {
            if (currentId.current !== selected.cityId) return;
            setLoaded(selected.url);
            setFailed(null);
            if (usage.current?.photoId === selected.photoId) return;
            const eventId = crypto.randomUUID();
            usage.current = { photoId: selected.photoId, eventId };
            void fetch("/api/destination-photo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: selected.usageToken, eventId }),
              keepalive: true,
            }).catch(() => {});
          }}
          onError={() => setFailed(selected.url)}
        />
      )}
      {
        <span className="photo-credit">
          {!visible && destination && <>Default travel photograph | </>}
          Photo by{" "}
          <a
            href={
              visible
                ? selected.photographerURL
                : DEFAULT_PHOTO_CREDIT.photographerURL
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            {visible
              ? selected.photographer
              : DEFAULT_PHOTO_CREDIT.photographer}
          </a>{" "}
          on{" "}
          <a
            href={visible ? selected.photoURL : DEFAULT_PHOTO_CREDIT.photoURL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Unsplash
          </a>
        </span>
      }
    </div>
  );
}

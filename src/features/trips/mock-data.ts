import type { Interest } from "./types";

export const activityTemplates: Record<
  Interest,
  { name: string; description: string; durationMinutes: number }[]
> = {
  Food: [
    {
      name: "A taste of the local market",
      description:
        "Browse a neighborhood food market and stop for a casual lunch featuring regional flavors.",
      durationMinutes: 90,
    },
    {
      name: "Regional flavors in the neighborhood",
      description:
        "Settle into a local restaurant and try a regional specialty at an easy pace.",
      durationMinutes: 90,
    },
  ],
  Shopping: [
    {
      name: "Independent shops & local finds",
      description:
        "Explore a shopping district, with time for small boutiques and locally made souvenirs.",
      durationMinutes: 120,
    },
    {
      name: "Browse an artisan market",
      description:
        "Look for handmade goods and discover the makers behind them.",
      durationMinutes: 90,
    },
  ],
  Nature: [
    {
      name: "A walk on the greener side",
      description:
        "Take a scenic walk through a public park or nearby green space, with time to enjoy the views.",
      durationMinutes: 120,
    },
    {
      name: "Fresh air & a scenic lookout",
      description: "Find a public viewpoint and enjoy a relaxed outdoor break.",
      durationMinutes: 90,
    },
  ],
  Culture: [
    {
      name: "Discover the historic quarter",
      description:
        "Explore local architecture and neighborhood streets to get a feel for the city's history.",
      durationMinutes: 120,
    },
    {
      name: "A little art & history",
      description:
        "Visit a local museum or gallery and spend time with the exhibits that interest you.",
      durationMinutes: 120,
    },
  ],
  Nightlife: [
    {
      name: "Discover the local music scene",
      description:
        "Explore the local music scene and find a venue to return to for a performance. Check event times and age restrictions before visiting.",
      durationMinutes: 120,
    },
    {
      name: "The city's lively side",
      description:
        "Explore a lively central neighborhood and find a spot to enjoy its atmosphere.",
      durationMinutes: 90,
    },
  ],
  Relaxation: [
    {
      name: "A slow moment at a cafe",
      description:
        "Ease into the day with a drink, a quiet seat, and no rush to move on.",
      durationMinutes: 60,
    },
    {
      name: "A little time to unwind",
      description:
        "Leave space for a peaceful break in a public garden or a favorite neighborhood spot.",
      durationMinutes: 90,
    },
  ],
};

import { activityTemplates } from "./mock-data";
import {
  DAY_MS,
  itinerarySchema,
  tripDayCount,
  tripInputSchema,
} from "./schema";
import type { Itinerary, TripInput } from "./types";
import { travelWindow } from "./travel-planning";
import { clock } from "./calendar";

export function generateMockItinerary(
  rawInput: TripInput,
  id: string,
  now = new Date(),
): Itinerary {
  const input = tripInputSchema.parse(rawInput);
  const count = tripDayCount(input.startDate, input.endDate);
  const slots =
    input.pace === "relaxed"
      ? ["10:00", "16:00"]
      : input.pace === "moderate"
        ? ["09:00", "13:00", "18:00"]
        : ["09:00", "12:00", "15:00", "19:00"];
  const activityBudget = (input.budget * 0.55) / (count * slots.length);
  const days = Array.from({ length: count }, (_, dayIndex) => {
    const date = new Date(
      Date.parse(`${input.startDate}T00:00:00Z`) + dayIndex * DAY_MS,
    )
      .toISOString()
      .slice(0, 10);
    const window = travelWindow(input, date);
    const activityCount = window.travelOnly
      ? 0
      : window.constrained
        ? Math.min(
            slots.length,
            Math.max(1, Math.floor((window.end - window.start) / 120)),
          )
        : slots.length;
    const dailySlots = window.constrained
      ? Array.from({ length: activityCount }, (_, index) =>
          clock(
            window.start +
              index * Math.floor((window.end - window.start) / activityCount),
          ),
        )
      : slots;
    let previousEnd = window.start;
    return {
      id: `${id}-day${dayIndex + 1}`,
      number: dayIndex + 1,
      date: new Date(
        Date.parse(`${input.startDate}T00:00:00Z`) + dayIndex * DAY_MS,
      )
        .toISOString()
        .slice(0, 10),
      title: [
        "Get to know the city",
        "Follow your curiosity",
        "A little off the beaten path",
        "Make it your own",
      ][dayIndex % 4],
      activities: dailySlots.map((suggestedTime, slotIndex) => {
        let start =
          Number(suggestedTime.slice(0, 2)) * 60 +
          Number(suggestedTime.slice(3));
        const availableMinutes =
          window.end -
          window.start -
          window.appointments.reduce(
            (sum, slot) =>
              sum +
              Math.max(
                0,
                Math.min(window.end, slot.end) -
                  Math.max(window.start, slot.start),
              ),
            0,
          );
        const duration = Math.min(
          90,
          Math.floor(availableMinutes / Math.max(1, activityCount)),
        );
        start = Math.max(previousEnd, start);
        for (const slot of [...window.appointments].sort(
          (a, b) => a.start - b.start,
        ))
          if (start < slot.end && start + duration > slot.start)
            start = slot.end;
        if (start + duration > window.end) {
          start = previousEnd;
          for (const slot of [...window.appointments].sort(
            (a, b) => a.start - b.start,
          ))
            if (start < slot.end && start + duration > slot.start)
              start = slot.end;
        }
        previousEnd = start + duration;
        const time = clock(start);
        const index = dayIndex * slots.length + slotIndex;
        const evening = Number(time.slice(0, 2)) >= 18;
        const daytimeInterests = input.interests.filter(
          (interest) => interest !== "Nightlife",
        );
        const pool =
          !evening && daytimeInterests.length
            ? daytimeInterests
            : input.interests;
        const category =
          evening && input.interests.includes("Nightlife")
            ? "Nightlife"
            : pool[index % pool.length];
        const templates = activityTemplates[category];
        const template =
          templates[Math.floor(index / pool.length) % templates.length];
        return {
          ...template,
          name: `${template.name}${slotIndex ? ` (${slotIndex + 1})` : ""}`,
          durationMinutes:
            window.constrained || window.appointments.length
              ? duration
              : template.durationMinutes,
          category,
          id: `${id}-day${dayIndex + 1}-slot${slotIndex + 1}`,
          time,
          estimatedCost:
            Math.floor(
              activityBudget * (category === "Nature" ? 0.3 : 1) * 100,
            ) / 100,
        };
      }),
    };
  });
  return itinerarySchema.parse({
    id,
    source: "mock",
    createdAt: now.toISOString(),
    input,
    days,
  });
}

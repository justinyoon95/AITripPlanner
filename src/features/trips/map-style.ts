import type { StyleSpecification } from "maplibre-gl";
export const offlineMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    land: {
      type: "geojson",
      data: "/world-land.geojson",
      attribution: "Natural Earth (public domain)",
    },
  },
  layers: [
    {
      id: "water",
      type: "background",
      paint: { "background-color": "#c9e2e8" },
    },
    {
      id: "land",
      type: "fill",
      source: "land",
      paint: { "fill-color": "#e7eee3" },
    },
    {
      id: "coast",
      type: "line",
      source: "land",
      paint: { "line-color": "#8fa5a0", "line-width": 0.6 },
    },
  ],
};

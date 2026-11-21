import type { ExpressionSpecification, FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

export type MapTheme = "dark" | "light";

// Actual streets divide a quiet ground plane into blocks. Building footprints and
// service paths are opt-in; the simplified map never invents or straightens roads.
export function tourSafeMapStyle(theme: MapTheme, detail = false): StyleSpecification {
  const c = theme === "dark" ? {
    ground: "#22352c", park: "#2c4532", water: "#182f32", building: "#2c4436",
    outline: "#38503f", road: "#42584a", major: "#597060", casing: "#192b24",
    text: "#c0cdb4", muted: "#8fa58b",
  } : {
    ground: "#e3ebdc", park: "#cbdcbd", water: "#c2dbd6", building: "#d2dfc9",
    outline: "#bbcfb0", road: "#f9faf4", major: "#ffffff", casing: "#c7d6bf",
    text: "#496349", muted: "#647b5e",
  };
  const name: ExpressionSpecification = ["coalesce", ["get", "name:ko"], ["get", "name"], ["get", "name:en"], ""];
  const local: FilterSpecification = ["in", "class", "minor", "tertiary"];
  const main: FilterSpecification = ["in", "class", "motorway", "trunk", "primary", "secondary"];
  const road = (id: string, filter: FilterSpecification, minzoom: number, major: boolean): LayerSpecification[] => [
    { id: `${id}-edge`, type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom, filter,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.casing, "line-width": ["interpolate", ["linear"], ["zoom"], 10, major ? 2 : 1, 14, major ? 9 : 6, 16, major ? 19 : 13, 19, major ? 45 : 32] } },
    { id, type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom, filter,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": major ? c.major : c.road, "line-width": ["interpolate", ["linear"], ["zoom"], 10, major ? 1 : 0.5, 14, major ? 4 : 2.5, 16, major ? 10 : 6, 19, major ? 31 : 20] } },
  ];
  return {
    version: 8, name: `TripFit ${theme}`,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": c.ground } },
      { id: "vegetation", type: "fill", source: "openmaptiles", "source-layer": "landcover", filter: ["in", "class", "wood", "grass"], paint: { "fill-color": c.park, "fill-opacity": 0.7 } },
      { id: "park", type: "fill", source: "openmaptiles", "source-layer": "park", paint: { "fill-color": c.park } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": c.water } },
      { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": c.water, "line-width": 3 } },
      { id: "buildings", type: "fill", source: "openmaptiles", "source-layer": "building", minzoom: 15,
        layout: { visibility: detail ? "visible" : "none" }, paint: { "fill-color": c.building, "fill-outline-color": c.outline } },
      ...road("local-streets", local, 14, false),
      ...road("main-streets", main, 0, true),
      { id: "small-paths", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 16,
        filter: ["in", "class", "path", "service", "track"], layout: { visibility: detail ? "visible" : "none" },
        paint: { "line-color": c.muted, "line-width": 1, "line-dasharray": [2, 3], "line-opacity": 0.6 } },
      { id: "water-label", type: "symbol", source: "openmaptiles", "source-layer": "water_name",
        layout: { "text-field": [...name], "text-font": ["Noto Sans Regular"], "text-size": 13, "text-letter-spacing": 0.2, "text-padding": 60 },
        paint: { "text-color": c.muted, "text-halo-color": c.water, "text-halo-width": 2 } },
      { id: "park-label", type: "symbol", source: "openmaptiles", "source-layer": "park", minzoom: 14,
        layout: { "text-field": [...name], "text-font": ["Noto Sans Regular"], "text-size": 13, "text-padding": 70, "text-letter-spacing": 0.12 },
        paint: { "text-color": c.muted, "text-halo-color": c.park, "text-halo-width": 2 } },
      { id: "road-label", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", minzoom: 14,
        filter: ["in", "class", "primary", "secondary", "tertiary"],
        layout: { "symbol-placement": "line", "text-field": [...name], "text-font": ["Noto Sans Regular"], "text-size": 11, "symbol-spacing": 600, "text-padding": 24 },
        paint: { "text-color": c.text, "text-halo-color": c.ground, "text-halo-width": 2 } },
      { id: "place-label", type: "symbol", source: "openmaptiles", "source-layer": "place", maxzoom: 14,
        filter: ["in", "class", "city", "town", "suburb"],
        layout: { "text-field": [...name], "text-font": ["Noto Sans Regular"], "text-size": 14, "text-padding": 80 },
        paint: { "text-color": c.text, "text-halo-color": c.ground, "text-halo-width": 2 } },
    ],
  };
}

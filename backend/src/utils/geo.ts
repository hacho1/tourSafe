import type { Coordinates } from "../../../shared/models.js";
export function haversine(a: Coordinates, b: Coordinates): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const x =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(
    6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x))),
  );
}
export function validCoordinates(
  lat: number | null,
  lng: number | null,
): lat is number {
  return (
    lat !== null &&
    lng !== null &&
    lat >= 33 &&
    lat <= 39.5 &&
    lng >= 124 &&
    lng <= 132
  );
}
// KMA Lambert conformal conic projection, grid spacing 5 km.
export function toWeatherGrid({ lat, lng }: Coordinates): {
  nx: number;
  ny: number;
} {
  const d = Math.PI / 180,
    re = 6371.00877 / 5;
  const slat1 = 30 * d,
    slat2 = 60 * d,
    olon = 126 * d,
    olat = 38 * d;
  const sn =
    Math.log(Math.cos(slat1) / Math.cos(slat2)) /
    Math.log(
      Math.tan(Math.PI / 4 + slat2 / 2) / Math.tan(Math.PI / 4 + slat1 / 2),
    );
  const sf =
    (Math.pow(Math.tan(Math.PI / 4 + slat1 / 2), sn) * Math.cos(slat1)) / sn;
  const ro = (re * sf) / Math.pow(Math.tan(Math.PI / 4 + olat / 2), sn);
  const ra = (re * sf) / Math.pow(Math.tan(Math.PI / 4 + (lat * d) / 2), sn);
  let theta = lng * d - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + 43 + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5),
  };
}

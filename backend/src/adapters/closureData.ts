import { readFile } from "node:fs/promises";
import type { TouristSpot } from "../../../shared/models.js";
import { config } from "../config.js";
import { confirmed, list, str } from "../utils/data.js";
export async function applyClosures(spots: TouristSpot[]): Promise<void> {
  if (!config.closureFile) return;
  const rows = list(JSON.parse(await readFile(config.closureFile, "utf8")));
  for (const row of rows) {
    const sourceUrl = str(row.sourceUrl),
      checkedAt = str(row.checkedAt),
      validUntil = str(row.validUntil);
    if (
      !sourceUrl ||
      !/^https:\/\//.test(sourceUrl) ||
      !checkedAt ||
      !validUntil ||
      !Number.isFinite(Date.parse(checkedAt)) ||
      !Number.isFinite(Date.parse(validUntil)) ||
      Date.parse(validUntil) < Date.now() ||
      row.closed !== true
    )
      continue;
    const spot = spots.find((s) => s.id === row.placeId);
    if (spot)
      spot.closure = confirmed(
        true,
        {
          kind: "PUBLIC_DATA",
          name: str(row.sourceName) || "공식 운영 공지 · 수동 확인",
          url: sourceUrl,
        },
        checkedAt,
      );
  }
}

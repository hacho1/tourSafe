import { Router } from "express";
import type { Region } from "../../../shared/models.js";
import { config } from "../config.js";
import { getRecommendations } from "../services/recommendations.js";
import { findRegions } from "../adapters/kakaoMapApi.js";
import { validCoordinates } from "../utils/geo.js";

export const api = Router();
api.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
api.get("/health", (_req, res) =>
  res.json({
    ok: true,
    mode: config.tourKey ? "LIVE" : config.useMock ? "DEMO" : "LIVE",
    mapSearch: !!config.kakaoKey,
  }),
);
api.get("/recommendations", async (req, res, next) => {
  const lat =
    typeof req.query.lat === "string" && req.query.lat.trim()
      ? Number(req.query.lat)
      : null;
  const lng =
    typeof req.query.lng === "string" && req.query.lng.trim()
      ? Number(req.query.lng)
      : null;
  const radius = Number(req.query.radius ?? 3000);
  if (
    !validCoordinates(lat, lng) ||
    lng === null ||
    ![1000, 3000, 5000, 10000].includes(radius) ||
    (req.query.withKids !== undefined &&
      !["true", "false"].includes(String(req.query.withKids)))
  ) {
    res
      .status(400)
      .json({
        message:
          "대한민국 내의 올바른 좌표와 검색 반경(1·3·5·10km)을 입력해 주세요.",
      });
    return;
  }
  try {
    res.json(
      await getRecommendations({
        lat,
        lng,
        radius,
        withKids: req.query.withKids !== "false",
      }),
    );
  } catch (error) {
    next(error);
  }
});
const presets: Region[] = [
  {
    name: "서울 성수",
    address: "기본 위치 · 서울특별시 성동구",
    lat: 37.5445,
    lng: 127.0374,
  },
  {
    name: "서울 광화문",
    address: "서울특별시 종로구",
    lat: 37.5759,
    lng: 126.9769,
  },
  {
    name: "부산 해운대",
    address: "부산광역시 해운대구",
    lat: 35.1631,
    lng: 129.1636,
  },
  {
    name: "제주 시청",
    address: "제주특별자치도 제주시",
    lat: 33.4996,
    lng: 126.5312,
  },
];
api.get("/regions", async (req, res) => {
  const query =
    typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
  if (config.kakaoKey && query.length >= 2) {
    try {
      res.json({ regions: await findRegions(query), preset: false });
    } catch {
      res
        .status(502)
        .json({
          message:
            "지역 검색에 실패했습니다. 잠시 후 다시 시도하거나 기본 위치를 사용해 주세요.",
        });
    }
  } else
    res.json({
      regions: presets.filter((r) => !query || r.name.includes(query)),
      preset: true,
    });
});

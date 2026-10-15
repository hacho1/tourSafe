import { Router } from "express";
import type { Region } from "../../../shared/models.js";
import { config } from "../config.js";
import { getRecommendations } from "../services/recommendations.js";
import { findRegions } from "../adapters/kakaoMapApi.js";
import { findTourRegions, getTouristIdentity } from "../adapters/tourApi.js";
import { validCoordinates } from "../utils/geo.js";
import { HOSPITAL_REGIONS } from "../../../shared/hospitals.js";
import { getHospitals } from "../services/hospitals.js";
import { getMapFacilities, getMapWeather } from "../services/mapFacilities.js";
import { searchUnlocatedToilets } from '../adapters/publicFacilities.js';

export const api = Router();
api.get('/map-facilities', async (req, res, next) => {
  const lat = typeof req.query.lat === 'string' && req.query.lat.trim() ? Number(req.query.lat) : null;
  const lng = typeof req.query.lng === 'string' && req.query.lng.trim() ? Number(req.query.lng) : null;
  const area = typeof req.query.area === 'string' ? req.query.area.trim() : '';
  if (!validCoordinates(lat, lng) || lng === null || area.length > 80) {
    res.status(400).json({ message: '대한민국 내의 올바른 좌표를 입력해 주세요.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  try { res.json(await getMapFacilities({ lat, lng }, area)); } catch (error) { next(error); }
});
api.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
api.get('/map-weather', async (req, res, next) => {
  const lat = typeof req.query.lat === 'string' && req.query.lat.trim() ? Number(req.query.lat) : null;
  const lng = typeof req.query.lng === 'string' && req.query.lng.trim() ? Number(req.query.lng) : null;
  if (!validCoordinates(lat, lng) || lng === null) { res.status(400).json({ message: '대한민국 내의 올바른 좌표를 입력해 주세요.' }); return; }
  try { res.json(await getMapWeather({ lat, lng })); } catch (error) { next(error); }
});
api.get('/tourist-spots/:id', async (req, res) => {
  if (!/^\d{1,16}$/.test(req.params.id)) { res.status(400).json({ message: '공공 관광정보의 장소 번호를 확인해 주세요.' }); return; }
  try { res.json(await getTouristIdentity(req.params.id)); }
  catch { res.status(502).json({ message: '최신 장소 정보를 확인하지 못했어요. 저장한 정보는 그대로 남아 있어요.' }); }
});
api.get('/toilet-addresses', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const offset = req.query.offset === undefined ? 0 : typeof req.query.offset === 'string' ? Number(req.query.offset) : NaN;
  if (query.length < 2 || query.length > 80 || !Number.isInteger(offset) || offset < 0 || offset > 100000) { res.status(400).json({ message: '검색어는 2~80자로 입력해 주세요.' }); return; }
  try { res.json(await searchUnlocatedToilets(query, offset)); }
  catch { res.status(503).json({ message: '전국 주소 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }); }
});
api.get("/health", (_req, res) =>
  res.json({
    ok: true,
    mode: config.tourKey ? "LIVE" : config.useMock ? "DEMO" : "LIVE",
    mapSearch: !!config.kakaoKey,
    placeSearch: !!config.kakaoKey || !!config.tourKey,
  }),
);
api.get("/hospitals", async (req, res) => {
  if (req.query.lat !== undefined || req.query.lng !== undefined) {
    const lat = typeof req.query.lat === 'string' && req.query.lat.trim() ? Number(req.query.lat) : null;
    const lng = typeof req.query.lng === 'string' && req.query.lng.trim() ? Number(req.query.lng) : null;
    if (!validCoordinates(lat, lng) || lng === null) {
      res.status(400).json({ message: '대한민국 내의 올바른 좌표를 입력해 주세요.' });
      return;
    }
    try { res.json(await getHospitals({ lat, lng })); }
    catch { res.status(502).json({ message: '이 위치의 병원 정보를 불러오지 못했어요. 잠시 후 다시 시도하거나 위치를 직접 선택해 주세요.' }); }
    return;
  }
  const region = HOSPITAL_REGIONS.find((item) => item.id === (req.query.region ?? "seongsu"));
  if (!region) {
    res.status(400).json({ message: "지원하는 병원 조회 지역을 선택해 주세요." });
    return;
  }
  try {
    res.json(await getHospitals(region.id));
  } catch {
    res.status(502).json({ message: "병원 정보를 가져오지 못했어요. 연결 상태와 공공데이터 서비스 승인을 확인한 뒤 다시 시도해 주세요." });
  }
});
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
  if ((config.kakaoKey || config.tourKey) && query.length >= 2) {
    try {
      res.json({ regions: config.kakaoKey ? await findRegions(query) : await findTourRegions(query), preset: false });
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
      preset: !config.kakaoKey && !config.tourKey,
    });
});

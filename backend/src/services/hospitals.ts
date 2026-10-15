import { HOSPITAL_REGIONS, type Hospital, type HospitalRegionId, type HospitalResponse } from "../../../shared/hospitals.js";
import { config } from "../config.js";
import { getHospitalDetail, getHospitalList, type HospitalFetch } from "../adapters/hospitalApi.js";
import { demoHospitals } from "../mock/hospitals.js";
import { fetchData } from "../utils/http.js";
import type { Coordinates } from '../../../shared/models.js';
import { validCoordinates } from '../utils/geo.js';
import { regionAtCoordinates, type CoordinateRegion } from '../adapters/kakaoMapApi.js';

interface HospitalDependencies {
  getConfig: () => { hospitalKey: string; useMock: boolean };
  fetch: HospitalFetch;
  now?: () => Date;
  resolveRegion?: (point: Coordinates) => Promise<CoordinateRegion>;
}

export function createHospitalService({ getConfig, fetch, now = () => new Date(), resolveRegion = regionAtCoordinates }: HospitalDependencies) {
  return async function getHospitals(target: HospitalRegionId | Coordinates): Promise<HospitalResponse> {
    const nearby = typeof target !== 'string';
    const preset = typeof target === 'string' ? HOSPITAL_REGIONS.find(item => item.id === target) : null;
    if (!nearby && !preset) throw new Error('INVALID_HOSPITAL_REGION');
    const origin = typeof target === 'string' ? preset! : target;
    if (!validCoordinates(origin.lat, origin.lng)) throw new Error('INVALID_COORDINATES');
    const regionId = nearby ? 'nearby' as const : target as HospitalRegionId;
    const { hospitalKey, useMock } = getConfig();
    const base = {
      regionId,
      origin: { lat: origin.lat, lng: origin.lng },
      originName: nearby ? '선택한 위치' : preset!.originName,
    };
    if (!hospitalKey) {
      const demo = useMock && !nearby;
      return {
        ...base,
        mode: demo ? "DEMO" : "LIVE",
        status: demo ? "OK" : "NOT_CONFIGURED",
        fetchedAt: now().toISOString(),
        hospitals: demo && regionId === "seongsu" ? demoHospitals() : [],
        partial: false,
        detailFailures: 0,
        message: demo
          ? regionId === "seongsu"
            ? "성수의 가상 병·의원 예시예요. 진료과목·시간·위치는 가상 자료이며 실제 방문에 사용하지 마세요."
            : "현재 성수 예시만 제공해요. 선택한 지역의 실제 병·의원 정보는 아직 연결되지 않았어요."
          : "병·의원 정보가 아직 연결되지 않았어요. 이 지역에 병원이 없다는 뜻은 아니에요.",
      };
    }

    // A configured live API must succeed; never mask an upstream failure with fixtures.
    const region = nearby ? { ...await resolveRegion(origin), ...base.origin } : preset!;
    const list = await getHospitalList(region, hospitalKey, fetch);
    const candidates = nearby ? list.hospitals.filter(item => item.distanceMeters <= 5000) : list.hospitals;
    const nearest = candidates.slice(0, 12);
    const hospitals = new Array<Hospital>(nearest.length);
    let next = 0;
    let detailFailures = 0;
    async function enrich() {
      while (next < nearest.length) {
        const index = next++;
        const hospital = nearest[index]!;
        try {
          hospitals[index] = await getHospitalDetail(hospital, hospitalKey, fetch);
        } catch {
          detailFailures += 1;
          hospitals[index] = { ...hospital, detailStatus: "ERROR" };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, nearest.length) }, enrich));
    const partial = nearby || list.partial || list.hospitals.length > 12 || detailFailures > 0;
    const messages = [
      nearby ? `${region.province} ${region.district} 조회 자료 중 선택한 위치에서 직선 5km 이내의 일부 병원을 표시해요. 인접 시군구는 포함하지 않아요.` : "선택한 지역의 조회 자료를 기준점과의 직선거리순으로 표시해요. 실제 이동 거리와 달라요.",
      "제공된 진료시간은 현재 접수·진료 가능 여부를 보장하지 않아요. 방문 전 병원에 확인해 주세요.",
    ];
    if (list.partial) messages.push("목록 일부만 확인했어요. 이 지역의 모든 병·의원을 포함하지 않을 수 있어요.");
    if (candidates.length > 12) messages.push("조회된 목록 중 기준점에서 가까운 12곳을 표시해요.");
    if (detailFailures > 0) messages.push(`${detailFailures}곳의 상세 조회에 실패해 해당 진료과목·시간을 미확인으로 표시해요.`);
    if (hospitals.length === 0) messages.push("이번 조회에서 표시할 병·의원 정보를 찾지 못했어요. 실제로 병원이 없다는 뜻은 아니에요.");
    return {
      ...base,
      mode: "LIVE",
      status: "OK",
      fetchedAt: now().toISOString(),
      hospitals,
      partial,
      detailFailures,
      message: messages.join(" "),
    };
  };
}

export const getHospitals = createHospitalService({
  getConfig: () => ({ hospitalKey: config.hospitalKey, useMock: config.useMock }),
  fetch: fetchData,
});

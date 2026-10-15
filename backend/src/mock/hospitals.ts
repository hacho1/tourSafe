import { HOSPITAL_REGIONS, type Hospital } from "../../../shared/hospitals.js";
import { normalizeHospitalHours } from "../adapters/hospitalApi.js";
import { haversine } from "../utils/geo.js";

/** Fictional fixtures are restricted to the explicitly labelled Seongsu demo. */
export function demoHospitals(): Hospital[] {
  const origin = HOSPITAL_REGIONS[0];
  const fixtures = [
    {
      id: "demo-hospital-family", name: "예시 온가족의원", lat: 37.5452, lng: 127.0381,
      departments: ["가정의학과", "내과"],
      hours: { dutyTime1s: "0900", dutyTime1c: "1800", dutyTime2s: "0900", dutyTime2c: "1800",
        dutyTime3s: "0900", dutyTime3c: "1800", dutyTime4s: "0900", dutyTime4c: "1800",
        dutyTime5s: "0900", dutyTime5c: "1800", dutyTime6s: "0900", dutyTime6c: "1300",
        dutyTime7s: "1000", dutyTime7c: "1400" },
    },
    {
      id: "demo-hospital-children", name: "예시 새싹소아의원", lat: 37.5432, lng: 127.0402,
      departments: ["소아청소년과"],
      hours: {},
    },
    {
      id: "demo-hospital-evening", name: "예시 저녁진료의원", lat: 37.5468, lng: 127.0345,
      departments: ["내과", "이비인후과"],
      hours: { dutyTime1s: "1800", dutyTime1c: "0100", dutyTime2s: "1800", dutyTime2c: "0100",
        dutyTime3s: "1800", dutyTime3c: "0100", dutyTime4s: "1800", dutyTime4c: "0100",
        dutyTime5s: "1800", dutyTime5c: "0100" },
    },
    {
      id: "demo-hospital-unknown", name: "예시 진료정보미확인의원", lat: 37.5415, lng: 127.035,
      departments: [],
      hours: {},
    },
  ];
  return fixtures.map((item): Hospital => ({
    id: item.id, name: item.name, lat: item.lat, lng: item.lng,
    address: "성수 체험용 가상 위치 · 실제 주소 아님",
    phone: null,
    departments: [...item.departments],
    hours: normalizeHospitalHours(item.hours),
    distanceMeters: haversine(origin, item),
    source: { kind: "DEMO_DATA", name: "TourSafe 가상 병·의원 예시", url: null },
    updatedAt: null,
    detailStatus: "OK",
  })).sort((a, b) => a.distanceMeters - b.distanceMeters);
}

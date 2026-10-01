import { confirmed, emptySafety, unavailable, unknown } from "../utils/data.js";
import type { DataSource, SafetyEnvironment } from "../../../shared/models.js";
export const demoSource: DataSource = {
  kind: "DEMO_DATA",
  name: "TourSafe 시연용 데이터",
  url: null,
};
export const demoAt = "2026-10-01T14:00:00+09:00";
export const mockSafetyData: Record<string, SafetyEnvironment> = {
  "demo-park": {
    ...emptySafety(),
    strollerAccessible: confirmed(true, demoSource, demoAt),
    shade: confirmed(true, demoSource, demoAt),
    benches: confirmed(true, demoSource, demoAt),
    toilet: confirmed(true, demoSource, demoAt),
    nursingRoom: unavailable(demoSource, demoAt),
    pedestrianSeparation: confirmed(true, demoSource, demoAt),
  },
  "demo-museum": {
    ...emptySafety(),
    strollerAccessible: confirmed(true, demoSource, demoAt),
    benches: confirmed(true, demoSource, demoAt),
    toilet: confirmed(true, demoSource, demoAt),
    nursingRoom: confirmed(true, demoSource, demoAt),
    shade: unknown(),
  },
  "demo-forest": {
    ...emptySafety(),
    shade: confirmed(true, demoSource, demoAt),
    benches: confirmed(true, demoSource, demoAt),
    toilet: confirmed(true, demoSource, demoAt),
    nursingRoom: unavailable(demoSource, demoAt),
  },
  "demo-garden": {
    ...emptySafety(),
    toilet: confirmed(true, demoSource, demoAt),
    shade: unknown(),
    benches: confirmed(true, demoSource, demoAt),
  },
};

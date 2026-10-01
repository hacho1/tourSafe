import type { Coordinates } from "../../../shared/models.js";
import { config } from "../config.js";
import { getStandardFacilities } from "./standardData.js";
export const getToilets = (center: Coordinates) =>
  getStandardFacilities(
    "https://api.data.go.kr/openapi/tn_pubr_public_toilet_api",
    config.toiletKey,
    "TOILET",
    center,
  );

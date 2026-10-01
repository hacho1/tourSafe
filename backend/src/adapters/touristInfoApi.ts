import type { Coordinates } from "../../../shared/models.js";
import { config } from "../config.js";
import { getStandardFacilities } from "./standardData.js";
export const getTouristInfo = (center: Coordinates) =>
  getStandardFacilities(
    "https://api.data.go.kr/openapi/tn_pubr_public_trsmic_api",
    config.touristInfoKey,
    "TOURIST_INFO",
    center,
  );

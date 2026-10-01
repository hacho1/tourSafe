import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "127.0.0.1",
  useMock: process.env.USE_MOCK_DATA !== "false",
  tourKey: process.env.TOUR_API_KEY || "",
  tourBase:
    process.env.TOUR_API_BASE_URL ||
    "https://apis.data.go.kr/B551011/KorService2",
  weatherKey: process.env.WEATHER_API_KEY || "",
  medicalKey: process.env.MEDICAL_API_KEY || "",
  touristInfoKey: process.env.TOURIST_INFO_API_KEY || "",
  toiletKey: process.env.TOILET_API_KEY || "",
  kakaoKey: process.env.KAKAO_REST_API_KEY || "",
  closureFile: process.env.CLOSURE_DATA_FILE || "",
};

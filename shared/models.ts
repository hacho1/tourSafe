export type VerificationStatus = "CONFIRMED" | "NOT_AVAILABLE" | "UNKNOWN";
export type DataSourceKind = "PUBLIC_DATA" | "KAKAO_MAP" | "DEMO_DATA";
export interface DataSource {
  kind: DataSourceKind;
  name: string;
  url: string | null;
}
export interface Evidence<T> {
  value: T | null;
  status: VerificationStatus;
  source: DataSource | null;
  updatedAt: string | null;
}
export interface Coordinates {
  lat: number;
  lng: number;
}
export type FacilityType = "MEDICAL" | "POLICE" | "TOURIST_INFO" | "TOILET";
export interface SupportFacility extends Coordinates {
  id: string;
  name: string;
  type: FacilityType;
  address: string | null;
  phone: string | null;
  source: DataSource;
  updatedAt: string | null;
  distanceMeters: number;
  distanceType: "STRAIGHT_LINE";
  openingHours: string | null;
  holidays: string | null;
  languages: string | null;
  emergency: boolean | null;
  locationNote?: string;
}
export interface WeatherInfo {
  temperature: Evidence<number>;
  precipitation: Evidence<number>;
  precipitationProbability: Evidence<number>;
  windSpeed: Evidence<number>;
  condition: Evidence<string>;
  severeAlert: Evidence<boolean>;
}
export interface SafetyEnvironment {
  strollerAccessible: Evidence<boolean>;
  railing: Evidence<boolean>;
  watersideProtection: Evidence<boolean>;
  shade: Evidence<boolean>;
  benches: Evidence<boolean>;
  drinkingWater: Evidence<boolean>;
  lighting: Evidence<boolean>;
  pedestrianSeparation: Evidence<boolean>;
  toilet: Evidence<boolean>;
  nursingRoom: Evidence<boolean>;
}
export interface TouristSpot extends Coordinates {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  description: string | null;
  imageUrl: string | null;
  category: string;
  indoor: boolean | null;
  source: DataSource;
  updatedAt: string | null;
  openingHours: Evidence<string>;
  holidays: Evidence<string>;
  openNow: Evidence<boolean>;
  closure: Evidence<boolean>;
  safety: SafetyEnvironment;
  visitDetails?: VisitFacilityDetail[];
  distanceMeters: number;
}
export interface VisitFacilityDetail {
  id: string;
  label: string;
  text: string;
  source: DataSource;
  updatedAt: string | null;
}
export interface PlaceAmenities {
  safety: Partial<SafetyEnvironment>;
  details: VisitFacilityDetail[];
}
export interface ScoreComponent {
  key: string;
  label: string;
  maxPoints: number;
  knownWeight: number;
  earnedPoints: number | null;
  detail: string;
}
export interface SafetyScore {
  total: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  coverage: number;
  grade: "PRIORITY" | "RECOMMENDED" | "CHECK" | "HOLD" | "UNKNOWN";
  hardFilter: string[];
  components: ScoreComponent[];
}
export interface AdapterStatus {
  key: string;
  name: string;
  status: "OK" | "ERROR" | "NOT_CONFIGURED" | "DEMO";
  message: string;
}
export interface Recommendation {
  checkedAt?: string;
  spot: TouristSpot;
  facilities: SupportFacility[];
  weather: WeatherInfo;
  score: SafetyScore;
  statuses: AdapterStatus[];
}
export interface SearchResponse {
  mode: "LIVE" | "DEMO";
  generatedAt: string;
  origin: Coordinates;
  radiusMeters: number;
  recommendations: Recommendation[];
  statuses: AdapterStatus[];
}
export interface Region extends Coordinates {
  name: string;
  address: string | null;
}
export interface SearchOptions extends Coordinates {
  radius: number;
  withKids: boolean;
}

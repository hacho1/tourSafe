import type { DataSource, Evidence, PlaceAmenities, SafetyEnvironment, TouristSpot } from '../../../shared/models.js';
import { confirmed, unavailable, unknown } from './data.js';

/** Presence in a provider's facility field is not a live operating/safety assessment. */
const uncertain = /없|않|미설치|미제공|미운영|불가|불가능|폐쇄|중단|공사|예정|철거|계획|확인|문의|인근|주변|외부|근처|안내판|표지판|방문\s*전|할\s*수\s*있/;
const nouns: Partial<Record<keyof SafetyEnvironment, RegExp>> = {
  toilet: /화장실/, nursingRoom: /수유실/, benches: /벤치/, drinkingWater: /음수대/,
  shade: /그늘막|차양시설/, lighting: /가로등|보안등|조명시설/,
};
export function listedAmenities(text: string, source: DataSource, updatedAt: string | null): PlaceAmenities['safety'] {
  const safety: PlaceAmenities['safety'] = {};
  // Only explicitly listed facilities are interpreted; descriptions of routes are kept as text.
  for (const part of text.split(/[+\n;,；]/).map(value => value.trim()).filter(Boolean)) {
    if (uncertain.test(part) || /(?:^|[^\d])0\s*(?:개|곳|대|실)/.test(part)) continue;
    for (const [key, noun] of Object.entries(nouns)) {
      if (noun.test(part)) safety[key as keyof SafetyEnvironment] = confirmed(true, source, updatedAt);
    }
  }
  return safety;
}
export function nursingEvidence(text: string, source: DataSource): Evidence<boolean> | undefined {
  // This field is specifically about nursing rooms. A missing value is never "none".
  if (/^(?:수유실\s*)?(?:없음|미설치|미제공|없습니다)[.!]?$/.test(text.trim())) return unavailable(source);
  if (!uncertain.test(text) && (/수유실/.test(text) || /^(?:있음|설치|제공|이용가능)$/.test(text.trim()))) return confirmed(true, source);
  return undefined;
}
export function mergeVisitFacilities(spot: TouristSpot, additions: PlaceAmenities[]): TouristSpot {
  const safety = { ...spot.safety };
  const conflict = new Set<keyof SafetyEnvironment>();
  for (const addition of additions) for (const [name, fact] of Object.entries(addition.safety)) {
    const key = name as keyof SafetyEnvironment;
    if (!fact || fact.status === 'UNKNOWN' || fact.value === null || conflict.has(key)) continue;
    if (safety[key].status !== 'UNKNOWN' && safety[key].value !== fact.value) {
      safety[key] = unknown(); conflict.add(key);
    } else safety[key] = fact;
  }
  return { ...spot, safety, visitDetails: [...(spot.visitDetails || []), ...additions.flatMap(item => item.details)] };
}

import type { Region } from '../../../shared/models';
export interface HelpLocation extends Region { kind: 'gps' | 'manual' | 'map' | 'saved'; sourceName?: string; savedAt?: string }
export const helpLocationLabel = (location: HelpLocation) => location.kind === 'gps' ? '확인한 내 위치' : location.name;
export const helpLocationContext = (location: HelpLocation) => location.kind === 'saved' ? '저장한 방문지 기준' : location.kind === 'gps' ? '마지막으로 확인한 위치' : location.kind === 'map' ? '지도 중심 기준' : '선택한 장소 기준';

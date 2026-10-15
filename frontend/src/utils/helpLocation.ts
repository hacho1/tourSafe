import type { Region } from '../../../shared/models';
export interface HelpLocation extends Region { kind: 'gps' | 'manual' | 'map' }
export const helpLocationLabel = (location: HelpLocation) => location.kind === 'gps' ? '확인한 내 위치' : location.name;

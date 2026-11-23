import type { TouristSpot } from '../../../shared/models';
import { VisitPlanEditor } from './VisitPlanEditor';

export function FamilyPreparationCard({ place, formId, onOpenSaved }: {
  place: TouristSpot;
  formId: string;
  onOpenSaved?: (placeId: string) => void;
}) {
  return <VisitPlanEditor place={place} formId={formId} onOpenSaved={onOpenSaved} />;
}

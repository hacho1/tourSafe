import { CircleAlert, X } from "lucide-react";
import { useSavedPlaces } from "../hooks/useSavedPlaces";

export function SavedFeedback() {
  const { error, clearError } = useSavedPlaces();
  if (!error) return null;
  return <div className="saved-feedback" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{error}</p><button type="button" onClick={clearError} aria-label="저장 안내 닫기"><X size={18} /></button></div>;
}

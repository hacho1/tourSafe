import { useEffect, useState } from 'react';
import type { Recommendation } from '../../../shared/models';
import { currentRecommendation, RECOMMENDATION_TTL } from '../utils/recommendationFreshness';
export function useCurrentRecommendation(item: Recommendation) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const deadline = Date.parse(item.checkedAt || '') + RECOMMENDATION_TTL;
    const timer = Number.isFinite(deadline) ? window.setTimeout(refresh, Math.max(0, deadline - Date.now())) : undefined;
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [item.checkedAt]);
  return currentRecommendation(item, now);
}

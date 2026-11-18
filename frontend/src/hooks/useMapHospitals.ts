import { useEffect, useState } from 'react';
import type { Coordinates } from '../../../shared/models';
import type { HospitalResponse } from '../../../shared/hospitals';
import { fetchHospitals, hospitalFetchErrorMessage } from '../services/hospitals';
import { hospitalResponseIssue } from '../utils/hospital';
import { useConnection } from './useConnection';
import { useAppServer } from './useAppServer';

export function useMapHospitals(origin: Coordinates) {
  const online = useConnection();
  const server = useAppServer();
  const [revision, setRevision] = useState(0);
  const key = `${origin.lat}:${origin.lng}:${revision}:${online}:${server}`;
  const [load, setLoad] = useState<{ key: string; data: HospitalResponse | null; error: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchHospitals(origin, controller.signal).then(data => {
      const issue = hospitalResponseIssue(data, origin);
      if (issue || data.mode !== 'LIVE') throw new Error('INVALID_MAP_HOSPITAL_RESPONSE');
      if (!controller.signal.aborted) setLoad({ key, data, error: data.status !== 'OK' ? data.message : '' });
    }).catch(error => {
      if (!controller.signal.aborted) setLoad({ key, data: null, error: hospitalFetchErrorMessage(error) });
    });
    return () => controller.abort();
  }, [key, origin.lat, origin.lng]);
  const current = load?.key === key ? load : null;
  return { data: current?.data ?? null, loading: !current, error: current?.error || '', refresh: () => setRevision(n => n + 1) };
}

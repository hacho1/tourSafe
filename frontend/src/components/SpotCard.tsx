import {
  ArrowUpRight,
  Heart,
  MapPin,
  CircleCheck,
  CircleHelp,
  Hospital,
  Shield,
  Info,
  CloudSun,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { Recommendation } from "../../../shared/models";
import { distance } from "../utils/format";
import { Suitability } from "./TravelNeeds";
import { useCurrentRecommendation } from '../hooks/useCurrentRecommendation';
export function SpotImage({
  src,
  name,
  className = "",
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`image-placeholder ${className}`}>
      <MapPin size={38} />
      <span>{failed ? "사진을 불러오지 못했어요" : "사진 미제공"}</span>
    </div>
  );
}
export function SpotCard({
  item,
  saved,
  onSave,
  onOpen,
  index,
  comparing = false,
  onCompare,
  onPlan,
}: {
  item: Recommendation;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  index: number;
  comparing?: boolean;
  onCompare?: () => void;
  onPlan?: () => void;
}) {
  const current = useCurrentRecommendation(item);
  const { spot, score, weather, facilities } = current;
  const assessmentId = useId();
  const warningId = useId();
  const demo = spot.source.kind === "DEMO_DATA";
  return (
    <article
      className="spot-card"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <button
        className={`save-button ${saved ? "saved" : ""}`}
        onClick={onSave}
        aria-pressed={saved}
        aria-label={`${spot.name} ${saved ? "저장 취소" : "저장"}`}
      >
        <Heart size={20} fill={saved ? "currentColor" : "none"} />
      </button>
      <button
        className="card-main"
        onClick={onOpen}
        aria-label={`${spot.name} 상세 보기`}
        aria-describedby={score.hardFilter.length ? `${assessmentId} ${warningId}` : assessmentId}
      >
        <div className="card-image">
          <SpotImage
            src={spot.imageUrl}
            name={demo ? `${spot.name} 시연용 이미지` : spot.name}
          />
          <div className="image-shade" />
          <span className="card-category">{spot.category}</span>
          {demo && spot.imageUrl && (
            <span className="image-demo">AI 시연 이미지</span>
          )}
        </div>
        <div className="card-content">
          <div className="card-title-row">
            <h3>{spot.name}</h3>
            <ArrowUpRight size={20} />
          </div>
          <p className="card-distance">
            <MapPin size={13} /> {current.offlineSnapshotAt ? '저장 당시 검색 위치 기준' : distance(spot.distanceMeters)}{" "}
            <span>{current.offlineSnapshotAt ? '· 현재 거리 미확인' : '· 직선거리'}</span>
          </p>
          <Suitability id={assessmentId} item={current} compact />
          {score.hardFilter.length > 0 && <p id={warningId} className="card-condition-warning">방문 주의: {score.hardFilter.join(" · ")}</p>}
          <div className="card-conditions">
            <span
              className={spot.openNow.value === true ? "positive" : "muted"}
            >
              {spot.openNow.value === true ? (
                <CircleCheck size={14} />
              ) : (
                <CircleHelp size={14} />
              )}
              {spot.openNow.value === true
                ? "조회 당시 등록 운영시간 내"
                : spot.openNow.value === false
                  ? "조회 당시 등록 운영시간 외"
                  : "운영 여부 확인 필요"}
            </span>
            <span>
              <CloudSun size={15} />
              {weather.temperature.value !== null
                ? `${weather.temperature.value}°C`
                : "날씨 미확인"}
            </span>
          </div>
          <div className="card-facilities">
            {(
              [
                ["MEDICAL", Hospital, "의료"],
                ["POLICE", Shield, "경찰"],
                ["TOURIST_INFO", Info, "관광지원 안내소"],
              ] as const
            ).map(([type, Icon, label]) => {
              const facility = facilities
                .filter((f) => f.type === type)
                .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
              return (
                <span key={type}>
                  <Icon size={14} />
                  <span>
                    {label}{" "}
                    <b>
                      {facility ? distance(facility.distanceMeters) : "미확인"}
                    </b>
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </button>
      {onCompare && <div className="candidate-card-actions"><button type="button" aria-pressed={comparing} aria-label={`${spot.name} 비교 ${comparing ? '선택 해제' : '선택'}`} onClick={onCompare}>{comparing ? '비교에 담음' : '후보 비교에 담기'}</button><button type="button" onClick={onPlan || onOpen} aria-label={`${spot.name} 가족 준비 카드 · 방문 전 확인 목록 열기`}>가족 준비 카드</button></div>}
    </article>
  );
}

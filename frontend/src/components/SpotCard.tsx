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
import { useEffect, useState } from "react";
import type { Recommendation } from "../../../shared/models";
import { CONFIDENCE } from "../config/constants";
import { distance } from "../utils/format";
import { ScoreBadge } from "./ScoreBadge";
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
}: {
  item: Recommendation;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  index: number;
}) {
  const { spot, score, weather, facilities } = useCurrentRecommendation(item);
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
      >
        <div className="card-image">
          <SpotImage
            src={spot.imageUrl}
            name={demo ? `${spot.name} 시연용 이미지` : spot.name}
          />
          <div className="image-shade" />
          <span className="card-grade">
            <ScoreBadge score={score} compact />
          </span>
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
            <MapPin size={13} /> {distance(spot.distanceMeters)}{" "}
            <span>· 직선거리</span>
          </p>
          <div className="card-score-row">
            <ScoreBadge score={score} />
            <span className={`confidence ${score.confidence.toLowerCase()}`}>
              정보 {CONFIDENCE[score.confidence]} <b>{score.coverage}%</b>
            </span>
          </div>
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
                ["TOURIST_INFO", Info, "안내소"],
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
    </article>
  );
}

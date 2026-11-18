import { deviceLocation } from '../services/deviceLocation';
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ChevronDown,
  LocateFixed,
  MapPin,
  Search,
  LoaderCircle,
  ArrowRight,
  CircleAlert,
} from "lucide-react";
import type { Region } from "../../../shared/models";
import { Modal } from "./Modal";
import { TravelNeedsSettings } from "./TravelNeeds";
import { searchRegions } from "../services/api";
import { DEFAULT_REGION } from "../config/constants";
import { createSearchLocationController } from "../utils/searchLocation";

const LOCATION_SHARING_NOTICE = "관광지 찾기를 누르면 주변 조회를 위해 좌표를 서버로 보내요.";

interface Props {
  region: Region;
  onRegion: (region: Region) => void;
  radius: number;
  onRadius: (radius: number) => void;
  withKids: boolean;
  onKids: (value: boolean) => void;
  loading: boolean;
  onSearch: () => void;
  active?: boolean;
}
export function SearchPanel({
  region,
  onRegion,
  radius,
  onRadius,
  loading,
  onSearch,
  active = true,
}: Props) {
  const [open, setOpen] = useState(false),
    [locating, setLocating] = useState(false),
    [message, setMessage] = useState("");
  const [locationRequest] = useState(() => createSearchLocationController());
  useLayoutEffect(() => {
    if (!active) {
      locationRequest.cancel();
      setLocating(false);
      setOpen(false);
      setMessage("");
    }
    return () => locationRequest.cancel();
  }, [active, locationRequest]);

  function cancelLocation() {
    locationRequest.cancel();
    setLocating(false);
  }
  function close() {
    cancelLocation();
    setMessage("");
    setOpen(false);
  }
  function locate() {
    if (!active) return;
    setLocating(true);
    setMessage("");
    locationRequest.request(
      deviceLocation(),
      (confirmedRegion) => {
        setLocating(false);
        onRegion(confirmedRegion);
        setOpen(false);
      },
      (errorMessage) => {
        setLocating(false);
        setMessage(errorMessage);
      },
    );
  }
  return (
    <>
      <form
        className="search-panel"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <div className="search-location">
          <span className="field-label">어디에서 출발하시나요?</span>
          <button
            type="button"
            className="location-button"
            onClick={() => setOpen(true)}
          >
            <MapPin size={19} />
            <span>{region.name}</span>
            <ChevronDown size={16} />
          </button>
          <span className="location-note">
            {region.address || "선택한 위치"}
          </span>
        </div>
        <div className="search-family"><TravelNeedsSettings /></div>
        <fieldset className="search-radius">
          <legend className="field-label">얼마나 가까운 곳으로 갈까요?</legend>
          <div className="radius-options">
            {[1000, 3000, 5000, 10000].map((r) => (
              <label key={r} className={r === radius ? "selected" : ""}>
                <input
                  type="radio"
                  name="radius"
                  value={r}
                  checked={r === radius}
                  onChange={() => onRadius(r)}
                />
                {r / 1000}km
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="primary search-submit"
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <Search size={18} />
          )}
          {loading ? "찾는 중" : "관광지 찾기"}
        </button>
      </form>
      <p className="small muted">{LOCATION_SHARING_NOTICE}</p>
      {message && !open && (
        <p className="inline-notice" role="status">
          <CircleAlert size={16} />
          {message}
        </p>
      )}
      {open && active && (
        <Modal
          title="출발 위치 선택"
          onClose={close}
          className="region-dialog"
        >
          <RegionSearch
            onSelect={(r) => {
              close();
              onRegion(r);
            }}
            onLocate={locate}
            onCancelLocate={() => {
              cancelLocation();
              setMessage("위치 확인을 취소했어요. 지역을 직접 선택할 수 있어요.");
            }}
            locating={locating}
            message={message}
          />
        </Modal>
      )}
    </>
  );
}
function RegionSearch({
  onSelect,
  onLocate,
  onCancelLocate,
  locating,
  message,
}: {
  onSelect: (r: Region) => void;
  onLocate: () => void;
  onCancelLocate: () => void;
  locating: boolean;
  message: string;
}) {
  const [query, setQuery] = useState(""),
    [regions, setRegions] = useState<Region[]>([]),
    [preset, setPreset] = useState(true),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      searchRegions(query, controller.signal)
        .then((r) => {
          if (!controller.signal.aborted) {
            setRegions(r.regions);
            setPreset(r.preset);
            setError("");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError(
              "지역 검색을 불러오지 못했습니다. 기본 위치를 이용할 수 있습니다.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <div className="region-body">
      <button className="locate-action" onClick={onLocate} disabled={locating}>
        {locating ? (
          <LoaderCircle size={19} className="spin" />
        ) : (
          <LocateFixed size={19} />
        )}
        {locating ? "현재 위치 확인 중…" : "현재 위치 사용"}
        <ArrowRight size={17} />
      </button>
      {locating && (
        <button type="button" className="secondary" onClick={onCancelLocate}>
          위치 확인 취소
        </button>
      )}
      <p className="small muted">{LOCATION_SHARING_NOTICE}</p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <label className="region-input">
        <Search size={18} />
        <input
          autoFocus
          type="search"
          placeholder="지역이나 장소를 검색하세요"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="지역 검색"
        />
      </label>
      <p className="small muted">
        {preset
          ? "기본 지역 선택 · 장소 이름 검색은 아직 준비 중이에요."
          : "지역·관광지 이름을 두 글자 이상 입력해 주세요. 선택한 장소 주변에서 찾아드려요."}
      </p>
      <div className="region-results">
        {loading ? (
          <p className="muted">지역을 불러오는 중…</p>
        ) : error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="secondary"
              onClick={() => onSelect(DEFAULT_REGION)}
            >
              서울 성수 선택
            </button>
          </>
        ) : regions.length ? (
          regions.map((r, i) => (
            <button key={`${r.lat}-${r.lng}-${i}`} onClick={() => onSelect(r)}>
              <MapPin size={19} />
              <span>
                <strong>{r.name}</strong>
                <small>{r.address}</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))
        ) : (
          <p className="muted">
            일치하는 지역이 없어요.{" "}
            {preset
              ? "서울, 부산, 제주로 검색해 보세요."
              : "다른 검색어를 입력해 주세요."}
          </p>
        )}
      </div>
    </div>
  );
}

import { SavedPlacesPanel } from './components/SavedPlacesPanel';
import { CandidateComparison } from './components/CandidateComparison';
import type { HelpLocation } from './utils/helpLocation';
import type { NearbyHelpAction } from './utils/nearbyHelp';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Clock3,
  Compass,
  Heart,
  Info,
  Leaf,
  List,
  Map,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trees,
  CircleAlert,
} from "lucide-react";
import type {
  Recommendation,
  Region,
  SearchOptions,
} from "../../shared/models";
import { suitabilityOrder } from "./utils/suitability";
import { useTravelNeeds } from "./hooks/useTravelNeeds";
import { SearchPanel } from "./components/SearchPanel";
import { SpotCard } from "./components/SpotCard";
import { MapPanel, type MapPoint } from "./components/MapPanel";
import { AboutDialog } from "./components/AboutDialog";
import { EmergencyEntry } from "./components/EmergencyHelp";
import { SavedFeedback } from "./components/SavedFeedback";
import { SpotDetail } from "./pages/SpotDetail";
import { useRecommendations } from "./hooks/useRecommendations";
import { useSavedPlaces } from "./hooks/useSavedPlaces";
import { useClock } from "./hooks/useClock";
import { SnapshotNotice } from './components/OfflineNotice';
import { DEFAULT_REGION } from "./config/constants";
import { distance, timeLabel } from "./utils/format";

type Filter = "all" | "outdoor" | "indoor" | "saved";
export function ExploreApp({ location, onLocation, active, savedView, onMap, onBrowse, onSaved, onEmergency, savedPlanRequest, onOpenSavedPlan, onNearbyHelp }: { location: HelpLocation; onLocation: (location: HelpLocation) => void; active: boolean; savedView: boolean; onMap: () => void; onBrowse: () => void; onSaved: () => void; onEmergency: () => void; savedPlanRequest: { placeId: string; requestId: number } | null; onOpenSavedPlan: (placeId: string) => void; onNearbyHelp: NearbyHelpAction }) {
  const [needs] = useTravelNeeds();
  const [savedVisited, setSavedVisited] = useState(savedView);
  useEffect(() => { if (savedView) setSavedVisited(true); }, [savedView]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [compareMessage, setCompareMessage] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(false);
  const [region, setRegion] = useState<Region>(location),
    [appliedRegion, setAppliedRegion] = useState<Region>(location);
  const [radius, setRadius] = useState(3000),
    [withKids, setWithKids] = useState(true);
  const [options, setOptions] = useState<SearchOptions>({
    ...location,
    radius: 3000,
    withKids: true,
  });
  const [browseFilter, setFilter] = useState<Exclude<Filter, "saved">>("all"),
    [sort, setSort] = useState("recommended"),
    [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<Recommendation | null>(null),
    [about, setAbout] = useState(false);
  const filter: Filter = savedView ? "saved" : browseFilter;
  const previousSearch = useRef<{ options: SearchOptions; region: Region } | null>(null);
  useEffect(() => { if (!active) { setSelected(null); setAbout(false); setComparisonOpen(false); } }, [active]);
  useEffect(() => { setCompareIds([]); setComparisonOpen(false); setCompareMessage(''); }, [options.lat, options.lng, options.radius, options.withKids]);
  useEffect(() => {
    setRegion(location); setAppliedRegion(location); setFilter('all');
    setOptions(previous => ({ ...previous, lat: location.lat, lng: location.lng }));
  }, [location.lat, location.lng, location.name]);
  function chooseFilter(next: Filter) {
    if (next === "saved") onSaved();
    else { setFilter(next); onBrowse(); }
  }
  const { data, loading, error, refresh } = useRecommendations(options);
  const saved = useSavedPlaces(),
    clock = useClock();
  const demo = data?.mode === "DEMO",
    first = data?.recommendations[0];
  const hasClassification = Boolean(data?.recommendations.some(row => row.spot.indoor !== null));
  const comparisonItems = (data?.recommendations || []).filter(item => compareIds.includes(item.spot.id));
  useEffect(() => { if (savedView) { setComparisonOpen(false); setSelected(null); } }, [savedView]);
  useEffect(() => {
    if (!loading && !error && data) setCompareIds(ids => ids.filter(id => data.recommendations.some(item => item.spot.id === id)));
  }, [data, loading, error]);
  function toggleCompare(id: string) {
    if (compareIds.includes(id)) { setCompareIds(compareIds.filter(value => value !== id)); setCompareMessage(''); }
    else if (compareIds.length < 2) { setCompareIds([...compareIds,id]); setCompareMessage(''); }
    else setCompareMessage('한 번에 두 후보를 비교해요. 담은 후보를 해제한 뒤 다른 곳을 골라 주세요.');
  }
  useEffect(() => { if (!loading && !hasClassification) setFilter('all'); }, [loading, hasClassification]);
  const results = useMemo(() => {
    const rows = (data?.recommendations || []).filter(
      (r) =>
        filter === "all" ||
        (filter === "saved" && saved.ids.includes(r.spot.id)) ||
        (filter === "indoor" && r.spot.indoor === true) ||
        (filter === "outdoor" && r.spot.indoor === false),
    );
    return rows.sort((a, b) =>
      sort === "distance"
        ? a.spot.distanceMeters - b.spot.distanceMeters
        : sort === "confidence"
          ? b.score.coverage - a.score.coverage
          : suitabilityOrder(a, b, needs),
    );
  }, [data, filter, saved.ids, sort, needs]);
  const mapPoints = useMemo<MapPoint[]>(
    () =>
      results.map(({ spot }) => ({
        id: spot.id,
        name: spot.name,
        lat: spot.lat,
        lng: spot.lng,
        type: "SPOT",
      })),
    [results],
  );
  function search() {
    onBrowse();
    setAppliedRegion(region);
    onLocation(region.lat === location.lat && region.lng === location.lng ? { ...location, ...region } : { ...region, kind: 'manual' });
    setFilter("all");
    setSort("recommended");
    const next = { lat: region.lat, lng: region.lng, radius, withKids };
    if (
      Object.entries(next).every(
        ([key, value]) => options[key as keyof SearchOptions] === value,
      )
    )
      refresh();
    else { previousSearch.current = { options, region: appliedRegion }; setOptions(next); }
    requestAnimationFrame(() =>
      document
        .getElementById("results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  function useDefault() {
    previousSearch.current = { options, region: appliedRegion };
    onBrowse();
    onLocation({ ...DEFAULT_REGION, kind: 'manual' });
    setRegion(DEFAULT_REGION);
    setAppliedRegion(DEFAULT_REGION);
    setRadius(3000);
    setFilter("all");
    setOptions({ ...DEFAULT_REGION, radius: 3000, withKids });
  }
  function showSaved() {
    onSaved();
    document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
  }
  return (
    <>
      <a className="skip-link" href="#results" onClick={event => { event.preventDefault(); const results = document.getElementById("results"); results?.focus({ preventScroll: true }); results?.scrollIntoView({ block: "start" }); }}>
        관광지 결과로 바로가기
      </a>
      <header className="site-header emergency-header">
        <div className="header-inner">
          <a className="brand" href="#map" onClick={event => { event.preventDefault(); onMap(); }} aria-label="TourSafe 처음으로">
            <span className="brand-icon">
              <ShieldCheck size={25} strokeWidth={2.1} />
            </span>
            <span>
              Tour<span className="brand-safe">Safe</span>
              <small>함께 떠나는, 편안한 하루</small>
            </span>
          </a>
          <nav className="desktop-nav" aria-label="주 메뉴">
            <button onClick={onMap}>안심 지도</button>
            <button onClick={onBrowse} className={!savedView ? "active" : ""} aria-current={!savedView ? "page" : undefined}>
              여행지 찾기
            </button>
            <button onClick={showSaved} className={savedView ? "active" : ""} aria-current={savedView ? "page" : undefined}>
              저장한 장소
              {saved.ids.length > 0 && (
                <span className="nav-count">{saved.ids.length}</span>
              )}
            </button>
            <button onClick={() => setAbout(true)}>
              TourSafe 이야기
              <ArrowUpRight size={14} />
            </button>
          </nav>
          <EmergencyEntry onClick={onEmergency} />
        </div>
      </header>
      <main className="page-shell">
        <div className="page-feedback"><SavedFeedback /></div>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span />
              FOR YOUR LITTLE ADVENTURES
            </div>
            <h1>
              나에게 맞는 여행,
              <br />
              <span>필요한 도움과 함께.</span>
            </h1>
            <p>
              오늘의 날씨부터 가까운 지원시설까지.
              <br />
              필요한 환경에 맞는 다음 여행지를 찾아보세요.
            </p>
            <div className="hero-tags">
              <span>
                <MapPin size={14} />내 주변
              </span>
              <span>
                <Sun size={15} />
                오늘의 날씨
              </span>
              <span>
                <ShieldCheck size={15} />
                확인 가능한 정보
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <img
              src="/images/park.webp"
              alt="햇살이 비치는 공원의 산책길, AI로 제작한 시연 이미지"
            />
            <div className="hero-photo-shade" />
            <span className="photo-note">AI 시연 이미지</span>
            <div className="hero-photo-card">
              <span className="photo-card-icon">
                <Trees size={23} />
              </span>
              <div>
                <small>작은 모험, 소중한 기억</small>
                <b>오늘은 어디로 떠나볼까요?</b>
              </div>
              <ArrowUpRight size={21} />
            </div>
            <span className="visual-stamp">
              <Leaf size={16} />A little closer to nature
            </span>
          </div>
        </section>
        <SearchPanel
          active={active}
          region={region}
          onRegion={setRegion}
          radius={radius}
          onRadius={setRadius}
          withKids={withKids}
          onKids={setWithKids}
          loading={loading}
          onSearch={search}
        />
        <div className="context-strip">
          <div>
            <span className="context-icon">
              <Clock3 size={20} />
            </span>
            <span>
              <small>지금, 한국 시간</small>
              <b>{clock}</b>
            </span>
            <span className="context-sub">
              나들이하기 전<br />
              운영시간을 확인해요
            </span>
          </div>
          <div>
            <span className="context-icon sun">
              <Sun size={23} />
            </span>
            <span>
              <small>{demo ? "시연용 예시 날씨" : "첫 추천 장소의 날씨"}</small>
              <b>
                {first?.weather.temperature.value !== null &&
                first?.weather.temperature.value !== undefined
                  ? `${first.weather.condition.value || "현재 기온"} ${first.weather.temperature.value}°C`
                  : "날씨 확인 필요"}
              </b>
            </span>
            <span className="context-sub">
              {demo
                ? "DEMO · 10월 1일 14:00"
                : first
                  ? timeLabel(first.weather.temperature.updatedAt)
                  : "조회 후 표시"}
            </span>
          </div>
          <div>
            <span className="context-icon">
              <ShieldCheck size={21} />
            </span>
            <span>
              <small>출처와 확인율을 함께</small>
              <b>근거를 보는 추천</b>
            </span>
            <button className="text-link" onClick={() => setAbout(true)}>
              기준 보기
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <section id="results" className="results-section" tabIndex={-1} aria-busy={loading}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">EXPLORE NEARBY</span>
              <h2>
                {filter === "saved"
                  ? "다음에 함께 가고 싶은 곳"
                  : "방문 후보를 비교해 보세요"}
                <span className="result-count">
                  {savedView ? saved.ids.length : loading ? "…" : results.length}
                </span>
              </h2>
              <p>
                <MapPin size={14} />
                {savedView ? "내 기기에 저장한 모든 장소" : `${appliedRegion.name} 기준 ${options.radius / 1000}km 이내`}
              </p>
            </div>
            <div hidden={savedView} className="view-toggle" aria-label="보기 방식">
              <button
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
                aria-label="목록 보기"
                aria-pressed={view === "list"}
              >
                <List size={17} />
                <span>목록</span>
              </button>
              <button
                className={view === "map" ? "active" : ""}
                onClick={() => setView("map")}
                aria-label="지도 보기"
                aria-pressed={view === "map"}
              >
                <Map size={17} />
                <span>지도</span>
              </button>
            </div>
          </div>
          <div className="results-toolbar">
            <div className="filter-chips" aria-label="관광지 필터">
              {(
                [
                  ["all", "전체", Compass],
                  ["outdoor", "야외 나들이", Trees],
                  ["indoor", "실내 공간", BookOpen],
                  ["saved", "저장한 곳", Heart],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  disabled={(value === 'indoor' || value === 'outdoor') && !hasClassification}
                  aria-describedby={(value === 'indoor' || value === 'outdoor') && !hasClassification ? 'classification-note' : undefined}
                  className={filter === value ? "active" : ""}
                  aria-pressed={filter === value}
                  onClick={() => chooseFilter(value)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            <label hidden={savedView} className="sort-control">
              <select
                aria-label="관광지 정렬"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recommended">필수조건 우선</option>
                <option value="distance">가까운순</option>
                <option value="confidence">정보 확인율순</option>
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
          {!loading && !hasClassification && !savedView && <p id="classification-note" className="nearby-range">제공 자료에 실내·야외 분류가 없어 전체 장소로 표시해요.</p>}
          {!savedView && <div className="candidate-flow-note"><p><strong>내 조건 확인 → 두 후보 비교 → 가족 준비 카드 저장</strong></p><p>{appliedRegion.name} 기준 {options.radius/1000}km의 조회 후보 중 최대 8곳이에요. 자료가 없는 항목과 원문 해석이 필요한 항목을 구분해 보세요.</p></div>}
          {!loading && demo && (
            <div className="demo-banner">
              <span className="demo-badge">DEMO</span>
              <span>
              2026.10.01 오후 2시 기준의 가상 장소·시설·날씨로 둘러보고 있어요.
              </span>
              <button
                onClick={() => setAbout(true)}
                aria-label="시연 데이터 안내"
              >
                <Info size={17} />
              </button>
            </div>
          )}
          {!loading && data?.mode === "LIVE" && !data.offlineSnapshotAt && data.statuses.some(status => status.key === "tour" && status.status === "OK") && <div className="demo-banner"><span className="demo-badge">LIVE</span><span>한국관광공사 실제 관광정보 · 운영시간과 현장 상황은 방문 전 확인해 주세요.</span></div>}
          <SnapshotNotice at={data?.offlineSnapshotAt} label="방문 후보" />
          {!loading &&
            data?.statuses
              .filter(
                (s) => s.status === "ERROR" || s.status === "NOT_CONFIGURED",
              )
              .map((s) => (
                <div className="notice warning" key={s.key}>
                  <CircleAlert size={17} />
                  {s.message}
                </div>
              ))}
          {(savedView || savedVisited) && <div hidden={!savedView}><SavedPlacesPanel active={savedView} current={data?.recommendations || []} openPlanRequest={savedView ? savedPlanRequest : null} onNearbyHelp={onNearbyHelp} /></div>}
          {savedView ? null : loading ? (
            <>
              <p className="loading-label" role="status">
                주변 장소와 방문 조건을 확인하고 있어요. 공공시설 첫 조회는 잠시
                걸릴 수 있습니다.
              </p>
              <div className="cards-grid">
                {[1, 2, 3].map((n) => (
                  <div className="skeleton-card" key={n}>
                    <div />
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            </>
          ) : error ? (
            <div className="empty-state" role="alert">
              <CircleAlert size={32} />
              <h3>정보를 불러오지 못했어요</h3>
              <p>{error}</p>
              <button className="primary" onClick={refresh}>
                <RefreshCw size={16} />
                다시 시도
              </button>
            </div>
          ) : results.length ? (
            view === "list" ? (
              <div className={`cards-grid ${comparisonItems.length ? 'with-comparison-tray' : ''}`}>
                {results.map((item, index) => (
                  <SpotCard
                    key={item.spot.id}
                    item={item}
                    saved={saved.ids.includes(item.spot.id)}
                    onSave={() => saved.toggle(item.spot)}
                    onOpen={() => { setSelectedPlan(false); setSelected(item); }}
                    index={index}
                    comparing={compareIds.includes(item.spot.id)}
                    onCompare={() => toggleCompare(item.spot.id)}
                    onPlan={() => { setSelectedPlan(true); setSelected(item); }}
                  />
                ))}
              </div>
            ) : (
              <div className="overview-map">
                <MapPanel
                  points={mapPoints}
                  demo={!!demo}
                  onSelect={(id) =>
                    { setSelectedPlan(false); setSelected(results.find((r) => r.spot.id === id) || null); }
                  }
                />
                <div className="overview-list">
                  {results.map((r) => (
                    <button key={r.spot.id} onClick={() => { setSelectedPlan(false); setSelected(r); }}>
                      <MapPin size={17} />
                      <span>
                        {r.spot.name}
                        <small>
                          직선거리 {distance(r.spot.distanceMeters)}
                        </small>
                      </span>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="empty-state">
              <Compass size={36} />
              <h3>
                {filter === "saved"
                  ? "이 검색 범위에 저장한 장소가 없어요"
                  : "조건에 맞는 장소를 찾지 못했어요"}
              </h3>
              <p>
                {filter === "saved"
                  ? saved.ids.length > 0 ? "저장한 장소가 이번 검색 결과에 없어요. 저장했던 지역이나 반경으로 다시 찾아보세요." : "마음에 드는 카드의 하트를 눌러 저장해 보세요."
                  : demo
                    ? "시연 장소는 서울 성수 지역에 준비되어 있어요. 반경을 넓히거나 기본 위치로 돌아가 보세요."
                    : "검색 반경을 넓히거나 다른 지역을 선택해 주세요. 미확인 실내·야외 분류는 해당 필터에서 제외됩니다."}
              </p>
              <button
                className="secondary"
                onClick={
                  filter !== "all"
                    ? () => chooseFilter("all")
                    : demo
                      ? useDefault
                      : () => {
                          previousSearch.current = { options, region: appliedRegion };
                          setRadius(10000);
                          if (options.radius === 10000) refresh();
                          else setOptions({ ...options, radius: 10000 });
                        }
                }
              >
                {" "}
                {filter !== "all"
                  ? "전체 장소 보기"
                  : demo
                    ? "서울 성수 예시 보기"
                    : "10km로 다시 찾기"}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {!loading && results.length > 0 && (
            <p className="results-footnote">
              <Info size={13} />
              모든 거리는 직선거리입니다. 실제 운영·진료 여부와 현장 상황은 방문
              전에 확인해 주세요.
              {!demo && " · 주변 후보 중 최대 8개를 표시합니다."}
            </p>
          )}
        </section>
        <section className="trust-banner">
          <span className="trust-icon">
            <ShieldCheck size={30} />
          </span>
          <div>
            <h3>필요한 조건과 확인할 정보를 함께.</h3>
            <p>
              공공데이터의 출처와 미확인 정보를 함께 보여드려요.
              <br className="mobile-only" /> 나에게 맞는 여행을 직접
              판단해 보세요.
            </p>
          </div>
          <button onClick={() => setAbout(true)}>
            TourSafe 알아보기
            <ArrowUpRight size={17} />
          </button>
        </section>
        <footer className="site-footer">
          <a href="#map" onClick={event => { event.preventDefault(); onMap(); }} className="footer-brand">
            <ShieldCheck size={18} />
            TourSafe
          </a>
          <p>나에게 필요한 여행 정보를 찾는 작은 가이드.</p>
          <span>© 2026 TourSafe · University prototype</span>
        </footer>
      </main>
      {selected && (
        <SpotDetail
          item={selected}
          saved={saved.ids.includes(selected.spot.id)}
          onSave={() => saved.toggle(selected.spot)}
          onClose={() => setSelected(null)}
          focusPlan={selectedPlan}
          onOpenSavedPlan={onOpenSavedPlan}
        />
      )}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      {!savedView && active && comparisonItems.length > 0 && <aside className="candidate-comparison-tray" aria-label="비교할 방문 후보"><div><strong>비교 후보 {comparisonItems.length}/2</strong><span>{comparisonItems.map(item => item.spot.name).join(' · ')}</span>{compareMessage && <p role="status">{compareMessage}</p>}</div><button type="button" className="primary" disabled={comparisonItems.length !== 2 || loading || Boolean(error)} onClick={() => setComparisonOpen(true)}>두 후보 비교</button><button type="button" className="secondary" aria-label="비교 후보 비우기" onClick={() => { setCompareIds([]); setComparisonOpen(false); setCompareMessage(''); }}>비우기</button></aside>}
      {comparisonOpen && active && !savedView && comparisonItems.length === 2 && <CandidateComparison items={comparisonItems} scope={`${appliedRegion.name} ${options.radius/1000}km`} onClose={() => setComparisonOpen(false)} onOpen={item => { setComparisonOpen(false); setSelectedPlan(true); setSelected(item); }} />}
    </>
  );
}

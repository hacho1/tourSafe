import { useMemo, useState } from "react";
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
  Sparkles,
  Sun,
  Trees,
  CircleAlert,
} from "lucide-react";
import type {
  Recommendation,
  Region,
  SearchOptions,
} from "../../shared/models";
import { recommendationOrder } from "../../shared/order";
import { SearchPanel } from "./components/SearchPanel";
import { SpotCard } from "./components/SpotCard";
import { MapPanel, type MapPoint } from "./components/MapPanel";
import { AboutDialog } from "./components/AboutDialog";
import { SpotDetail } from "./pages/SpotDetail";
import { useRecommendations } from "./hooks/useRecommendations";
import { useSavedPlaces } from "./hooks/useSavedPlaces";
import { useClock } from "./hooks/useClock";
import { DEFAULT_REGION } from "./config/constants";
import { distance, timeLabel } from "./utils/format";

type Filter = "all" | "outdoor" | "indoor" | "saved";
export function App() {
  const [region, setRegion] = useState<Region>(DEFAULT_REGION),
    [appliedRegion, setAppliedRegion] = useState<Region>(DEFAULT_REGION);
  const [radius, setRadius] = useState(3000),
    [withKids, setWithKids] = useState(true);
  const [options, setOptions] = useState<SearchOptions>({
    ...DEFAULT_REGION,
    radius: 3000,
    withKids: true,
  });
  const [filter, setFilter] = useState<Filter>("all"),
    [sort, setSort] = useState("recommended"),
    [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<Recommendation | null>(null),
    [about, setAbout] = useState(false);
  const { data, loading, error, refresh } = useRecommendations(options);
  const saved = useSavedPlaces(),
    clock = useClock();
  const demo = data?.mode === "DEMO",
    first = data?.recommendations[0];
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
          : recommendationOrder(a, b),
    );
  }, [data, filter, saved.ids, sort]);
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
    setAppliedRegion(region);
    setFilter("all");
    setSort(withKids ? "recommended" : "distance");
    const next = { lat: region.lat, lng: region.lng, radius, withKids };
    if (
      Object.entries(next).every(
        ([key, value]) => options[key as keyof SearchOptions] === value,
      )
    )
      refresh();
    else setOptions(next);
    requestAnimationFrame(() =>
      document
        .getElementById("results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  function useDefault() {
    setRegion(DEFAULT_REGION);
    setAppliedRegion(DEFAULT_REGION);
    setRadius(3000);
    setFilter("all");
    setOptions({ ...DEFAULT_REGION, radius: 3000, withKids });
  }
  function showSaved() {
    setFilter("saved");
    document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
  }
  return (
    <>
      <a className="skip-link" href="#results">
        관광지 결과로 바로가기
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#" aria-label="TourSafe 처음으로">
            <span className="brand-icon">
              <ShieldCheck size={25} strokeWidth={2.1} />
            </span>
            <span>
              Tour<span className="brand-safe">Safe</span>
              <small>함께 떠나는, 편안한 하루</small>
            </span>
          </a>
          <nav className="desktop-nav" aria-label="주 메뉴">
            <a href="#results" className="active">
              여행지 찾기
            </a>
            <button onClick={showSaved}>
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
          <span className="header-note">
            <Leaf size={15} />
            우리 가족 여행 가이드
          </span>
        </div>
      </header>
      <main className="page-shell">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span />
              FOR YOUR LITTLE ADVENTURES
            </div>
            <h1>
              가족의 하루에,
              <br />
              <span>조금 더 안심을.</span>
            </h1>
            <p>
              오늘의 날씨부터 가까운 지원시설까지.
              <br />
              아이와 함께할 다음 나들이를 찾아보세요.
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
        <section id="results" className="results-section" aria-busy={loading}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">EXPLORE NEARBY</span>
              <h2>
                {filter === "saved"
                  ? "다음에 함께 가고 싶은 곳"
                  : "가까운 곳에서 만나는 작은 여행"}
                <span className="result-count">
                  {loading ? "…" : results.length}
                </span>
              </h2>
              <p>
                <MapPin size={14} />
                {appliedRegion.name} 기준 {options.radius / 1000}km 이내
                {filter === "saved" && " · 현재 검색 범위의 저장한 장소"}
              </p>
            </div>
            <div className="view-toggle" aria-label="보기 방식">
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
                  className={filter === value ? "active" : ""}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            <label className="sort-control">
              <select
                aria-label="관광지 정렬"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recommended">추천순</option>
                <option value="distance">가까운순</option>
                <option value="confidence">정보 확인율순</option>
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
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
          {loading ? (
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
              <div className="cards-grid">
                {results.map((item, index) => (
                  <SpotCard
                    key={item.spot.id}
                    item={item}
                    saved={saved.ids.includes(item.spot.id)}
                    onSave={() => saved.toggle(item.spot.id)}
                    onOpen={() => setSelected(item)}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <div className="overview-map">
                <MapPanel
                  points={mapPoints}
                  demo={!!demo}
                  onSelect={(id) =>
                    setSelected(results.find((r) => r.spot.id === id) || null)
                  }
                />
                <div className="overview-list">
                  {results.map((r) => (
                    <button key={r.spot.id} onClick={() => setSelected(r)}>
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
                  ? "마음에 드는 카드의 하트를 눌러 저장해 보세요."
                  : demo
                    ? "시연 장소는 서울 성수 지역에 준비되어 있어요. 반경을 넓히거나 기본 위치로 돌아가 보세요."
                    : "검색 반경을 넓히거나 다른 지역을 선택해 주세요. 미확인 실내·야외 분류는 해당 필터에서 제외됩니다."}
              </p>
              <button
                className="secondary"
                onClick={
                  filter !== "all"
                    ? () => setFilter("all")
                    : demo
                      ? useDefault
                      : () => {
                          setRadius(10000);
                          setOptions({ ...options, radius: 10000 });
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
            <h3>점수보다 중요한 건, 추천의 이유.</h3>
            <p>
              공공데이터의 출처와 미확인 정보를 함께 보여드려요.
              <br className="mobile-only" /> 우리 가족에게 맞는 여행을 직접
              판단해 보세요.
            </p>
          </div>
          <button onClick={() => setAbout(true)}>
            TourSafe 알아보기
            <ArrowUpRight size={17} />
          </button>
        </section>
        <footer className="site-footer">
          <a href="#" className="footer-brand">
            <ShieldCheck size={18} />
            TourSafe
          </a>
          <p>우리 가족의 다음 나들이를 위한 작은 가이드.</p>
          <span>© 2026 TourSafe · University prototype</span>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        <button
          className={filter !== "saved" ? "active" : ""}
          onClick={() => {
            setFilter("all");
            document
              .getElementById("results")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <Compass size={20} />
          둘러보기
        </button>
        <button
          className={filter === "saved" ? "active" : ""}
          onClick={showSaved}
        >
          <Heart size={20} />
          저장한 곳
        </button>
        <button onClick={() => setAbout(true)}>
          <Sparkles size={20} />
          이용 안내
        </button>
      </nav>
      {selected && (
        <SpotDetail
          item={selected}
          saved={saved.ids.includes(selected.spot.id)}
          onSave={() => saved.toggle(selected.spot.id)}
          onClose={() => setSelected(null)}
        />
      )}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </>
  );
}

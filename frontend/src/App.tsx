import { DEFAULT_REGION } from './config/constants';
import type { HelpLocation } from './utils/helpLocation';
import { useEffect, useRef, useState } from "react";
import { ExploreApp } from "./ExploreApp";
import { SafetyMap } from "./pages/SafetyMap";
import { EmergencyHelp } from "./components/EmergencyHelp";
import { EmergencyContext } from "./components/EmergencyContext";
import { MobileNav, type AppPage } from "./components/MobileNav";
import { useShake } from "./hooks/useShake";
import "./safety-map.css";
import "./app-recovery.css";
import "./live-map.css";
import "./reference-map.css";
import "./help-map.css";
import "./calm-map.css";
import "./refined-map.css";

function pageFromHash(): AppPage {
  const hash = window.location.hash.slice(1);
  return hash === "explore" || hash === "saved" ? hash : "map";
}

export function App() {
  const [queryLocation, setQueryLocation] = useState<HelpLocation>({ ...DEFAULT_REGION, name: '성수 시작 위치', kind: 'manual' });
  const [page, setPage] = useState<AppPage>(pageFromHash);
  const [exploreVisited, setExploreVisited] = useState(() => page !== "map");
  const scrollPositions = useRef<Record<AppPage, number>>({ map: 0, explore: 0, saved: 0 });
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [shakeNotice, setShakeNotice] = useState(false);
  const helpOrigin = useRef<'button' | 'shake'>('button');
  const emergencyTrigger = useRef<HTMLElement | null>(null);
  function openEmergency(origin: 'button' | 'shake' = 'button') {
    helpOrigin.current = origin;
    setShakeNotice(false);
    emergencyTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEmergencyOpen(true);
  }
  const shake = useShake(() => openEmergency('shake'), emergencyOpen);
  function closeEmergency() {
    setEmergencyOpen(false);
    setShakeNotice(helpOrigin.current === 'shake' && shake.enabled);
    requestAnimationFrame(() => {
      const trigger = emergencyTrigger.current;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('.app-help-tab, .app-page:not([hidden]) .emergency-launch')?.focus({ preventScroll: true });
    });
  }
  function navigate(next: AppPage) {
    if (next === page) return;
    scrollPositions.current[page] = window.scrollY;
    if (next !== "map") setExploreVisited(true);
    setPage(next);
    window.history.pushState(null, "", `#${next}`);
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (page === "saved" && scrollPositions.current.saved === 0) document.getElementById("results")?.scrollIntoView();
      else window.scrollTo({ top: scrollPositions.current[page], behavior: "instant" });
    });
    const pop = () => {
      scrollPositions.current[page] = window.scrollY;
      const next = pageFromHash();
      if (next !== "map") setExploreVisited(true);
      setEmergencyOpen(false);
      setPage(next);
    };
    window.addEventListener("popstate", pop);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("popstate", pop); };
  }, [page]);
  return <EmergencyContext.Provider value={() => openEmergency()}>
    <div className="app-page" hidden={page !== "map"}>
      <SafetyMap location={queryLocation} onLocation={setQueryLocation} active={page === "map"} onExplore={() => navigate("explore")} onSaved={() => navigate("saved")} onEmergency={() => openEmergency()} emergencyOpen={emergencyOpen} />
    </div>
    {exploreVisited && <div className="app-page" hidden={page === "map"}>
      <ExploreApp location={queryLocation} onLocation={setQueryLocation} active={page !== "map"} savedView={page === "saved"} onMap={() => navigate("map")} onBrowse={() => navigate("explore")} onSaved={() => navigate("saved")} onEmergency={() => openEmergency()} />
    </div>}
    <MobileNav page={page} onNavigate={navigate} onHelp={() => openEmergency()} />
    {shakeNotice && <div className="shake-dismiss-note" role="status"><span>흔들기로 도움 화면을 열었어요.</span><button onClick={() => { shake.disable(); setShakeNotice(false); }}>흔들기 끄기</button><button aria-label="흔들기 안내 닫기" onClick={() => setShakeNotice(false)}>닫기</button></div>}
    {emergencyOpen && <EmergencyHelp onClose={closeEmergency} shake={shake} />}
  </EmergencyContext.Provider>;
}

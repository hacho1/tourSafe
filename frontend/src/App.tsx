import { DEFAULT_REGION } from './config/constants';
import type { HelpLocation } from './utils/helpLocation';
import { savedHelpOrigin, type NearbyHelpAction, type NearbyHelpRequest } from './utils/nearbyHelp';
import { useEffect, useRef, useState } from "react";
import { ExploreApp } from "./ExploreApp";
import { SafetyMap } from "./pages/SafetyMap";
import { EmergencyHelp } from "./components/EmergencyHelp";
import { OfflineNotice } from './components/OfflineNotice';
import { MockReportCountdown } from './components/MockReportCountdown';
import { Modal } from './components/Modal';
import { EmergencyContext } from "./components/EmergencyContext";
import { MobileNav, type AppPage } from "./components/MobileNav";
import { useShake } from "./hooks/useShake";
import { FirstVisitGuide, FirstVisitPrompt } from './components/FirstVisitGuide';
import { NightNotice } from './components/NightNotice';
import { TravelNeedsDialog } from './components/TravelNeeds';
import { guidanceStorage, GUIDE_SEEN_KEY, readGuidanceValue, saveGuidanceValue } from './utils/visitGuidance';
import "./safety-map.css";
import "./app-recovery.css";
import "./live-map.css";
import "./reference-map.css";
import "./help-map.css";
import "./calm-map.css";
import "./refined-map.css";
import './visit-guidance.css';
import './candidate-workflow.css';
import './family-preparation.css';
import './offline.css';
import './mobile-layout.css';

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
  const [guideOpen, setGuideOpen] = useState(false);
  const [needsOpen, setNeedsOpen] = useState(false);
  const [savedPlanRequest, setSavedPlanRequest] = useState<{ placeId: string; requestId: number } | null>(null);
  const savedPlanSequence = useRef(0);
  const [nearbyHelpRequest, setNearbyHelpRequest] = useState<NearbyHelpRequest | null>(null);
  const nearbyHelpSequence = useRef(0);
  const [showWelcome, setShowWelcome] = useState(() => readGuidanceValue(guidanceStorage('localStorage'), GUIDE_SEEN_KEY) !== 'seen');
  const guideTrigger = useRef<HTMLElement | null>(null);
  const [mockReportOpen, setMockReportOpen] = useState(false);
  const emergencyTrigger = useRef<HTMLElement | null>(null);
  function openEmergency() {
    setGuideOpen(false);
    setNeedsOpen(false);
    emergencyTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEmergencyOpen(true);
  }
  function openMockReport() {
    setEmergencyOpen(false);
    setMockReportOpen(true);
  }
  function closeMockReport() {
    setMockReportOpen(false);
    requestAnimationFrame(focusHelpEntry);
  }
  const shake = useShake(openMockReport, mockReportOpen || emergencyOpen || guideOpen || needsOpen);
  function dismissWelcome() {
    setShowWelcome(false);
    saveGuidanceValue(guidanceStorage('localStorage'), GUIDE_SEEN_KEY, 'seen');
  }
  function openGuide() {
    guideTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dismissWelcome();
    setEmergencyOpen(false);
    setGuideOpen(true);
  }
  function skipWelcome() {
    dismissWelcome();
    requestAnimationFrame(() => {
      const needsButton = Array.from(document.querySelectorAll<HTMLElement>('.app-page:not([hidden]) .needs-button')).find(element => element.getClientRects().length > 0);
      if (needsButton) needsButton.focus({ preventScroll: true });
      else focusHelpEntry();
    });
  }
  function focusHelpEntry() {
    Array.from(document.querySelectorAll<HTMLElement>('.app-help-tab, .app-page:not([hidden]) .emergency-launch')).find(element => element.getClientRects().length > 0)?.focus({ preventScroll: true });
  }
  function closeGuide() {
    setGuideOpen(false);
    requestAnimationFrame(() => {
      if (guideTrigger.current?.isConnected) guideTrigger.current.focus({ preventScroll: true });
      else focusHelpEntry();
    });
  }
  function closeEmergency() {
    setEmergencyOpen(false);
    requestAnimationFrame(() => {
      const trigger = emergencyTrigger.current;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else focusHelpEntry();
    });
  }
  function navigate(next: AppPage) {
    if (next !== 'saved') setSavedPlanRequest(null);
    if (next !== 'map') setNearbyHelpRequest(null);
    if (next === page) return;
    scrollPositions.current[page] = window.scrollY;
    if (next !== "map") setExploreVisited(true);
    setPage(next);
    window.history.pushState(null, "", `#${next}`);
  }
  function openSavedPlan(placeId: string) {
    setSavedPlanRequest({ placeId, requestId: ++savedPlanSequence.current });
    navigate('saved');
  }
  const openNearbyHelp: NearbyHelpAction = (place, category) => {
    if (place?.source.kind === 'DEMO_DATA') return;
    const origin = savedHelpOrigin(place);
    if (origin) setQueryLocation(origin);
    setNearbyHelpRequest({ requestId: ++nearbyHelpSequence.current, category, origin });
    navigate('map');
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (page === 'saved' && savedPlanRequest) return;
      if (page === 'map' && nearbyHelpRequest) return;
      if (page === "saved" && scrollPositions.current.saved === 0) document.getElementById("results")?.scrollIntoView();
      else window.scrollTo({ top: scrollPositions.current[page], behavior: "instant" });
    });
    const pop = () => {
      scrollPositions.current[page] = window.scrollY;
      const next = pageFromHash();
      if (next !== 'saved') setSavedPlanRequest(null);
      if (next !== 'map') setNearbyHelpRequest(null);
      if (next !== "map") setExploreVisited(true);
      setEmergencyOpen(false);
      setMockReportOpen(false);
      setGuideOpen(false);
      setNeedsOpen(false);
      setPage(next);
    };
    window.addEventListener("popstate", pop);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("popstate", pop); };
  }, [page]);
  return <EmergencyContext.Provider value={() => openEmergency()}>
    <OfflineNotice onlyOffline onSaved={() => navigate('saved')} />
    <div className="app-visit-notices">
      {showWelcome && <FirstVisitPrompt onGuide={openGuide} onSkip={skipWelcome} />}
    </div>
    <div className="app-page" hidden={page !== "map"}>
      <SafetyMap location={queryLocation} onLocation={setQueryLocation} active={page === "map"} onExplore={() => navigate("explore")} onSaved={() => navigate("saved")} onOpenSavedPlan={openSavedPlan} nearbyHelpRequest={nearbyHelpRequest} onEmergency={() => openEmergency()} emergencyOpen={emergencyOpen || mockReportOpen || guideOpen || needsOpen} />
    </div>
    {exploreVisited && <div className="app-page" hidden={page === "map"}>
      <ExploreApp location={queryLocation} onLocation={setQueryLocation} active={page !== "map"} savedView={page === "saved"} onMap={() => navigate("map")} onBrowse={() => navigate("explore")} onSaved={() => navigate("saved")} savedPlanRequest={savedPlanRequest} onOpenSavedPlan={openSavedPlan} onNearbyHelp={openNearbyHelp} onEmergency={() => openEmergency()} />
    </div>}
    <div className="app-visit-notices app-night-reminder"><NightNotice /></div>
    <MobileNav page={page} onNavigate={navigate} onHelp={openEmergency} />
    {guideOpen && <FirstVisitGuide onClose={closeGuide} onExplore={() => { setGuideOpen(false); setNeedsOpen(true); }} />}
    {needsOpen && <TravelNeedsDialog onClose={() => { setNeedsOpen(false); requestAnimationFrame(focusHelpEntry); }} onApply={() => {
      setNeedsOpen(false); navigate('explore');
      requestAnimationFrame(() => { const results = document.getElementById('results'); results?.focus({preventScroll:true}); results?.scrollIntoView({block:'start'}); });
    }} />}
    {emergencyOpen && <EmergencyHelp onClose={closeEmergency} shake={shake} onGuide={openGuide} onMockReport={openMockReport} onSaved={() => { closeEmergency(); navigate('saved'); }} />}
    {mockReportOpen && <Modal title="모의신고" className="mock-report-dialog" onClose={closeMockReport} hideEmergency>
      <MockReportCountdown onClose={closeMockReport} />
    </Modal>}
  </EmergencyContext.Provider>;
}

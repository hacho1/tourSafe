import { Compass, Heart, LifeBuoy, Map } from "lucide-react";

export type AppPage = "map" | "explore" | "saved";
export function MobileNav({ page, onNavigate, onHelp }: {
  page: AppPage;
  onNavigate: (page: AppPage) => void;
  onHelp: () => void;
}) {
  return <nav className="sm-mobile-nav app-mobile-nav" aria-label="모바일 메뉴">
    <button className={page === "map" ? "active" : ""} aria-current={page === "map" ? "page" : undefined} onClick={() => onNavigate("map")}><Map size={21} />안심 지도</button>
    <button className={page === "explore" ? "active" : ""} aria-current={page === "explore" ? "page" : undefined} onClick={() => onNavigate("explore")}><Compass size={21} />여행지</button>
    <button className="app-help-tab" onClick={onHelp} aria-label="도움 열기"><LifeBuoy size={22} />도움</button>
    <button className={page === "saved" ? "active" : ""} aria-current={page === "saved" ? "page" : undefined} onClick={() => onNavigate("saved")}><Heart size={21} />저장</button>
  </nav>;
}

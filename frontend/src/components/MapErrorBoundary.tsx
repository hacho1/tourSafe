import { Component, type ReactNode } from 'react';

/** A failed map chunk or renderer must not unmount help and facility controls. */
export class MapErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback || <MapFailureNotice />;
  }
}

export function MapFailureNotice() {
    return <div className="map-recovery" role="status">
      <b>지도를 불러오지 못했어요.</b>
      <p>시설 목록과 도움 기능은 계속 사용할 수 있어요.</p>
      <button onClick={() => window.location.reload()}>화면 다시 불러오기</button>
    </div>;
}

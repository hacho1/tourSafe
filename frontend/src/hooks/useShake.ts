import { useEffect, useRef, useState } from "react";
import { createSensorWatchdog, createShakeDetector } from "../utils/shake";

type MotionAPI = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
export function useShake(onShake: () => void, paused: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const callback = useRef(onShake);
  const pause = useRef(paused);
  const mounted = useRef(true);
  useEffect(() => { callback.current = onShake; pause.current = paused; }, [onShake, paused]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!enabled || paused) return;
    const detect = createShakeDetector();
    const watchdog = createSensorWatchdog(() => {
      setEnabled(false);
      setMessage("움직임 센서를 찾지 못했어요. ‘도움’ 버튼을 이용해 주세요.");
    });
    const listener = (event: DeviceMotionEvent) => {
      const sample = event.accelerationIncludingGravity;
      if (!sample || sample.x === null || sample.y === null || sample.z === null) return;
      watchdog.stop();
      if (pause.current || document.visibilityState !== "visible") { detect.resetSamples(); return; }
      if (detect(sample, performance.now())) {
        navigator.vibrate?.(60);
        callback.current();
      }
    };
    let available: boolean | undefined;
    const syncVisibility = () => {
      const next = document.visibilityState === 'visible';
      if (available === next) return;
      available = next;
      detect.resetSamples();
      watchdog.setVisible(next);
    };
    window.addEventListener("devicemotion", listener);
    document.addEventListener("visibilitychange", syncVisibility);
    syncVisibility();
    return () => {
      watchdog.stop();
      window.removeEventListener("devicemotion", listener);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [enabled, paused]);
  async function toggle() {
    if (enabled) { setEnabled(false); setMessage(""); return; }
    if (!window.isSecureContext || typeof DeviceMotionEvent === "undefined") {
      setMessage("이 환경에서는 흔들기를 사용할 수 없어요. ‘도움’ 버튼을 이용해 주세요.");
      return;
    }
    setPending(true);
    try {
      const motion = DeviceMotionEvent as MotionAPI;
      const permission = motion.requestPermission ? await motion.requestPermission() : "granted";
      if (!mounted.current) return;
      if (permission !== "granted") { setMessage("움직임 권한이 허용되지 않았어요. ‘도움’ 버튼을 이용해 주세요."); return; }
      setEnabled(true);
      setMessage("도움 화면을 닫고 가볍게 두세 번 흔들어 보세요. 앱을 보고 있을 때 이 화면이 열려요.");
    } catch {
      if (mounted.current) setMessage("흔들기를 켜지 못했어요. ‘도움’ 버튼을 이용해 주세요.");
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  function disable() { setEnabled(false); setMessage(''); }
  return { enabled, message, pending, toggle, disable };
}

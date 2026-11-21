import { useEffect, useRef, useState } from "react";
import { nativeApp } from "../services/platform";
import { createSensorWatchdog, createShakeDetector } from "../utils/shake";
import { guidanceStorage, readGuidanceValue, saveGuidanceValue } from "../utils/visitGuidance";

const MOTION_SETTING = "toursafe:shake-mock-report";

function supportsMotion() {
  return window.isSecureContext && typeof DeviceMotionEvent !== "undefined";
}

type MotionAPI = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
export function useShake(onShake: () => void, paused: boolean) {
  const [enabled, setEnabled] = useState(() => {
    const saved = readGuidanceValue(guidanceStorage("localStorage"), MOTION_SETTING);
    return supportsMotion() && (saved ? saved === "on" : nativeApp);
  });
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const callback = useRef(onShake);
  const pause = useRef(paused);
  const mounted = useRef(true);
  const [detect] = useState(createShakeDetector);
  useEffect(() => { callback.current = onShake; pause.current = paused; }, [onShake, paused]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!enabled || paused) return;
    detect.resetSamples();
    let waitingForSensor = false;
    const watchdog = createSensorWatchdog(() => {
      waitingForSensor = true;
      setMessage("움직임 신호를 기다리고 있어요. 버튼으로도 모의신고를 시작할 수 있어요.");
    });
    const listener = (event: DeviceMotionEvent) => {
      const sample = event.accelerationIncludingGravity;
      if (!sample || sample.x === null || sample.y === null || sample.z === null) return;
      watchdog.stop();
      if (waitingForSensor) {
        waitingForSensor = false;
        setMessage("");
      }
      if (pause.current || document.visibilityState !== "visible") { detect.resetSamples(); return; }
      if (detect(sample, performance.now())) {
        callback.current();
        navigator.vibrate?.(60);
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
  }, [detect, enabled, paused]);
  async function toggle() {
    if (enabled) {
      setEnabled(false);
      saveGuidanceValue(guidanceStorage("localStorage"), MOTION_SETTING, "off");
      setMessage("");
      return;
    }
    if (!supportsMotion()) {
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
      saveGuidanceValue(guidanceStorage("localStorage"), MOTION_SETTING, "on");
      setMessage("도움 화면을 닫고 휴대폰을 두 번 흔들면 모의신고가 시작돼요.");
    } catch {
      if (mounted.current) setMessage("흔들기를 켜지 못했어요. ‘도움’ 버튼을 이용해 주세요.");
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  return { enabled, message, pending, toggle };
}

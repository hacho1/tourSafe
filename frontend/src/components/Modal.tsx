import { useEffect, useRef, type ReactNode } from "react";
import { Siren, X } from "lucide-react";
import { useEmergency } from "./EmergencyContext";
import { SavedFeedback } from "./SavedFeedback";
import { createModalScrollLock } from "../utils/modalLock";

let acquireScrollLock: (() => () => void) | undefined;
export function Modal({
  title,
  children,
  onClose,
  className = "",
  hideEmergency = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  hideEmergency?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openEmergency = useEmergency();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    acquireScrollLock ??= createModalScrollLock(document.body.style);
    const release = acquireScrollLock();
    return () => {
      dialog.close();
      release();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-top">
        <span className="modal-title" tabIndex={-1}>{title}</span>
        {!hideEmergency && openEmergency && <button type="button" className="modal-emergency" onClick={openEmergency} aria-label="도움 열기"><Siren size={16} aria-hidden="true" />도움</button>}
        <button
          type="button"
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="닫기"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {!hideEmergency && <SavedFeedback />}
      {children}
    </dialog>
  );
}

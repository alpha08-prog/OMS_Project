import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Variant = "success" | "error";

interface FloatingNoticeProps {
  show: boolean;
  variant?: Variant;
  message: string;
  onClose?: () => void;
  /** Auto-dismiss after this many ms. 0 disables auto-dismiss. */
  autoHideMs?: number;
}

const STYLES: Record<Variant, { wrap: string; icon: typeof CheckCircle2; iconClass: string }> = {
  success: {
    wrap: "border-green-200 bg-green-50 text-green-900",
    icon: CheckCircle2,
    iconClass: "text-green-600",
  },
  error: {
    wrap: "border-red-200 bg-red-50 text-red-900",
    icon: AlertCircle,
    iconClass: "text-red-600",
  },
};

export default function FloatingNotice({
  show,
  variant = "success",
  message,
  onClose,
  autoHideMs = 0,
}: FloatingNoticeProps) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Drive a small enter transition (translate + fade) once shown.
  useEffect(() => {
    if (!show) {
      setEntered(false);
      return;
    }
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, [show]);

  useEffect(() => {
    if (!show || !autoHideMs || !onClose) return;
    const t = setTimeout(onClose, autoHideMs);
    return () => clearTimeout(t);
  }, [show, autoHideMs, onClose]);

  if (!mounted || !show) return null;

  const { wrap, icon: Icon, iconClass } = STYLES[variant];

  return createPortal(
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className="fixed inset-x-0 top-4 z-[9999] flex justify-center px-4 pointer-events-none"
    >
      <div
        className={`pointer-events-auto flex items-start gap-3 max-w-xl w-full rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-300 ease-out ${wrap} ${
          entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"
        }`}
      >
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconClass}`} aria-hidden="true" />
        <p className="flex-1 text-sm font-medium leading-relaxed">{message}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 hover:bg-black/5 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

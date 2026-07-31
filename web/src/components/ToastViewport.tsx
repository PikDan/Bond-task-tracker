import { useToast, type ToastType } from "../context/ToastContext";

const TYPE_STYLES: Record<ToastType, string> = {
  success: "border-emerald-600 bg-emerald-950 text-emerald-200",
  error: "border-red-600 bg-red-950 text-red-200",
  info: "border-neutral-600 bg-neutral-800 text-neutral-200",
};

export function ToastViewport() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start justify-between gap-2 rounded border px-3 py-2 text-sm transition-all duration-200 ${TYPE_STYLES[toast.type]}`}
        >
          <span className="min-w-0 break-words">{toast.message}</span>
          <button
            onClick={() => dismiss(toast.id)}
            className="shrink-0 text-xs text-neutral-400 hover:text-neutral-200"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

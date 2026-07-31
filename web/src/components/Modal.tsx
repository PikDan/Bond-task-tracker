import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "w-80",
  md: "w-[28rem]",
};

export function Modal({ title, onClose, children, size = "sm" }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className={`${SIZE_CLASSES[size]} rounded border border-neutral-700 bg-neutral-900 p-4 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-neutral-200">{title}</h2>
        {children}
      </div>
    </div>
  );
}

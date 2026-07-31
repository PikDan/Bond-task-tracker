import { Modal } from "./Modal";

interface Props {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function DeleteConfirmModal({ count, onConfirm, onCancel, isPending }: Props) {
  return (
    <Modal title={`Delete ${count} item${count === 1 ? "" : "s"}?`} onClose={onCancel}>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isPending}
          className="rounded bg-red-600 px-3 py-1.5 text-sm hover:bg-red-500 disabled:opacity-50"
        >
          Yes
        </button>
      </div>
    </Modal>
  );
}

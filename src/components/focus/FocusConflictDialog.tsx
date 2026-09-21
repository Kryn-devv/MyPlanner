"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useFocus } from "./FocusProvider";

/**
 * What happens when you ask to focus while already focusing.
 *
 * Never a silent swap. The session you have is named, and leaving it is a
 * deliberate choice with its consequence stated — the current one is discarded,
 * not paused and parked, because two half-finished sessions on one task is not
 * a record of anything.
 */
export function FocusConflictDialog() {
  const { conflict, dismissConflict, confirmSwitch, isPending } = useFocus();

  return (
    <Modal
      open={conflict !== null}
      onClose={dismissConflict}
      title="Already focusing"
      description={
        conflict?.taskTitle
          ? `You are currently focusing on “${conflict.taskTitle}”.`
          : "You already have a focus session running."
      }
    >
      <p className="text-[0.875rem] leading-relaxed text-ink-muted">
        Switching to{" "}
        <span className="text-ink">“{conflict?.request.taskTitle}”</span> discards the current
        session, so its tracked time will not be recorded.
      </p>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={dismissConflict} disabled={isPending}>
          Keep current session
        </Button>
        <Button variant="primary" onClick={confirmSwitch} disabled={isPending}>
          Discard and switch
        </Button>
      </div>
    </Modal>
  );
}

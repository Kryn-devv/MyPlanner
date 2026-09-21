import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  COUNTED_STATUSES,
  FOCUS_TRANSITIONS,
  canTransition,
  describeRefusal,
  isActiveStatus,
  isTerminalStatus,
} from "@/lib/focus/machine";
import type { FocusSessionStatus } from "@/generated/prisma/enums";

const ALL: readonly FocusSessionStatus[] = ["RUNNING", "PAUSED", "COMPLETED", "CANCELLED"];

describe("legal transitions", () => {
  it("lets a running session pause, complete or be cancelled", () => {
    expect(canTransition("RUNNING", "PAUSED")).toBe(true);
    expect(canTransition("RUNNING", "COMPLETED")).toBe(true);
    expect(canTransition("RUNNING", "CANCELLED")).toBe(true);
  });

  it("lets a paused session resume, complete or be cancelled", () => {
    expect(canTransition("PAUSED", "RUNNING")).toBe(true);
    expect(canTransition("PAUSED", "COMPLETED")).toBe(true);
    expect(canTransition("PAUSED", "CANCELLED")).toBe(true);
  });
});

describe("illegal transitions", () => {
  it("never revives a finished session", () => {
    for (const from of ["COMPLETED", "CANCELLED"] as const) {
      for (const to of ALL) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("refuses the specific cases that would corrupt history", () => {
    expect(canTransition("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransition("COMPLETED", "PAUSED")).toBe(false);
    expect(canTransition("CANCELLED", "RUNNING")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "COMPLETED")).toBe(false);
  });

  it("refuses a no-op transition to the state already held", () => {
    for (const status of ALL) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe("classification", () => {
  it("calls a live session active whether or not its clock runs", () => {
    expect(isActiveStatus("RUNNING")).toBe(true);
    expect(isActiveStatus("PAUSED")).toBe(true);
    expect(isActiveStatus("COMPLETED")).toBe(false);
    expect(isActiveStatus("CANCELLED")).toBe(false);
  });

  it("calls both endings terminal", () => {
    expect(isTerminalStatus("COMPLETED")).toBe(true);
    expect(isTerminalStatus("CANCELLED")).toBe(true);
    expect(isTerminalStatus("RUNNING")).toBe(false);
    expect(isTerminalStatus("PAUSED")).toBe(false);
  });

  it("splits every status into exactly one of active or terminal", () => {
    for (const status of ALL) {
      expect(isActiveStatus(status)).toBe(!isTerminalStatus(status));
    }
  });

  it("counts only completed work as focused time", () => {
    expect(COUNTED_STATUSES).toEqual(["COMPLETED"]);
    expect(COUNTED_STATUSES).not.toContain("CANCELLED");
    expect(ACTIVE_STATUSES).toEqual(["RUNNING", "PAUSED"]);
  });

  it("keeps the active list and the active predicate in step", () => {
    for (const status of ALL) {
      expect(ACTIVE_STATUSES.includes(status)).toBe(isActiveStatus(status));
    }
  });
});

describe("refusal reasons", () => {
  it("says nothing when the move is legal", () => {
    expect(describeRefusal("RUNNING", "PAUSED")).toBeNull();
  });

  it("distinguishes a finished session from a wrong-state one", () => {
    // These read differently to a user: "that session is over" versus
    // "that session isn't paused".
    expect(describeRefusal("COMPLETED", "RUNNING")).toBe("already-finished");
    expect(describeRefusal("CANCELLED", "PAUSED")).toBe("already-finished");
    expect(describeRefusal("RUNNING", "RUNNING")).toBe("wrong-state");
    expect(describeRefusal("PAUSED", "PAUSED")).toBe("wrong-state");
  });
});

describe("the transition table itself", () => {
  it("covers every status", () => {
    expect(Object.keys(FOCUS_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it("has no terminal state with a way out", () => {
    expect(FOCUS_TRANSITIONS.COMPLETED).toEqual([]);
    expect(FOCUS_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it("names only real statuses as destinations", () => {
    for (const targets of Object.values(FOCUS_TRANSITIONS)) {
      for (const target of targets) expect(ALL).toContain(target);
    }
  });
});

import { describe, expect, it } from "vitest";
import { CATEGORY_COLOR_VALUES } from "@/config/categories";
import { validateSignIn, validateSignUp } from "@/lib/validation/auth";
import {
  MAX_ESTIMATED_MINUTES,
  MAX_TITLE_LENGTH,
  validateCategory,
  validateTask,
} from "@/lib/validation/task";
import { MAX_XP_REWARD } from "@/lib/xp";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const CATEGORY_IDS = ["cat_own_1", "cat_own_2"];

describe("validateTask", () => {
  it("accepts a minimal task", () => {
    const result = validateTask(form({ title: "Finish Chemistry notes" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe("Finish Chemistry notes");
    expect(result.data.priority).toBe("MEDIUM");
    expect(result.data.xpReward).toBe(20);
  });

  it("accepts a fully specified task", () => {
    const result = validateTask(
      form({
        title: "Work on IRIS",
        description: "Wire up the ingestion pipeline",
        priority: "URGENT",
        categoryId: "cat_own_1",
        dueDate: "2026-09-21",
        dueTime: "17:30",
        estimatedMinutes: "90",
        xpReward: "75",
      }),
      CATEGORY_IDS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      title: "Work on IRIS",
      priority: "URGENT",
      categoryId: "cat_own_1",
      dueDate: "2026-09-21",
      dueTime: "17:30",
      estimatedMinutes: 90,
      xpReward: 75,
    });
  });

  // -- title ---------------------------------------------------------------
  it("requires a title", () => {
    const result = validateTask(form({ title: "" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.title).toBeDefined();
  });

  it("rejects a whitespace-only title", () => {
    const result = validateTask(form({ title: "    " }));
    expect(result.ok).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    const result = validateTask(form({ title: "  Read chapter  " }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe("Read chapter");
  });

  it("rejects an over-long title", () => {
    const result = validateTask(form({ title: "x".repeat(MAX_TITLE_LENGTH + 1) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.title).toContain(String(MAX_TITLE_LENGTH));
  });

  // -- xp ------------------------------------------------------------------
  it("rejects negative XP", () => {
    const result = validateTask(form({ title: "T", xpReward: "-10" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.xpReward).toMatch(/negative/i);
  });

  it("rejects XP above the cap", () => {
    const result = validateTask(form({ title: "T", xpReward: String(MAX_XP_REWARD + 1) }));
    expect(result.ok).toBe(false);
  });

  it("rejects non-numeric XP", () => {
    expect(validateTask(form({ title: "T", xpReward: "lots" })).ok).toBe(false);
    expect(validateTask(form({ title: "T", xpReward: "10.5" })).ok).toBe(false);
  });

  it("accepts zero XP", () => {
    const result = validateTask(form({ title: "T", xpReward: "0" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.xpReward).toBe(0);
  });

  it("defaults XP from priority when omitted", () => {
    const high = validateTask(form({ title: "T", priority: "HIGH" }));
    expect(high.ok && high.data.xpReward).toBe(40);
  });

  // -- duration ------------------------------------------------------------
  it("rejects a zero or negative duration", () => {
    expect(validateTask(form({ title: "T", estimatedMinutes: "0" })).ok).toBe(false);
    expect(validateTask(form({ title: "T", estimatedMinutes: "-30" })).ok).toBe(false);
  });

  it("rejects a fractional duration", () => {
    expect(validateTask(form({ title: "T", estimatedMinutes: "12.5" })).ok).toBe(false);
  });

  it("rejects a duration longer than a day", () => {
    expect(validateTask(form({ title: "T", estimatedMinutes: String(MAX_ESTIMATED_MINUTES + 1) })).ok).toBe(false);
  });

  it("treats an omitted duration as absent, not zero", () => {
    const result = validateTask(form({ title: "T" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.estimatedMinutes).toBeNull();
  });

  // -- dates ---------------------------------------------------------------
  it("rejects a malformed date", () => {
    expect(validateTask(form({ title: "T", dueDate: "tomorrow" })).ok).toBe(false);
    expect(validateTask(form({ title: "T", dueDate: "2026-02-31" })).ok).toBe(false);
  });

  it("rejects a malformed time", () => {
    expect(validateTask(form({ title: "T", dueDate: "2026-09-21", dueTime: "25:00" })).ok).toBe(false);
  });

  it("rejects a time without a date", () => {
    const result = validateTask(form({ title: "T", dueTime: "17:00" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.dueDate).toBeDefined();
  });

  it("accepts a date with no time as an all-day task", () => {
    const result = validateTask(form({ title: "T", dueDate: "2026-09-21" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dueTime).toBeNull();
  });

  // -- priority / category -------------------------------------------------
  it("rejects a priority outside the enum", () => {
    expect(validateTask(form({ title: "T", priority: "SUPER_URGENT" })).ok).toBe(false);
  });

  it("rejects a category the user does not own", () => {
    const result = validateTask(form({ title: "T", categoryId: "cat_someone_else" }), CATEGORY_IDS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.categoryId).toBeDefined();
  });

  it("accepts an omitted category", () => {
    const result = validateTask(form({ title: "T" }), CATEGORY_IDS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categoryId).toBeNull();
  });

  it("reports every problem at once rather than one at a time", () => {
    const result = validateTask(form({ title: "", xpReward: "-5", estimatedMinutes: "0" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["estimatedMinutes", "title", "xpReward"]);
  });
});

describe("validateCategory", () => {
  it("accepts a valid category", () => {
    const result = validateCategory(form({ name: "Robotics", color: "amber" }), CATEGORY_COLOR_VALUES);
    expect(result.ok).toBe(true);
  });

  it("requires a name", () => {
    expect(validateCategory(form({ name: "", color: "amber" }), CATEGORY_COLOR_VALUES).ok).toBe(false);
  });

  it("rejects a colour outside the palette", () => {
    const result = validateCategory(form({ name: "X", color: "#ff0000" }), CATEGORY_COLOR_VALUES);
    expect(result.ok).toBe(false);
  });
});

describe("validateSignUp", () => {
  const base = { email: "a@b.com", password: "correct-horse", name: "Ada", timezone: "UTC" };

  it("accepts a valid sign-up", () => {
    expect(validateSignUp(form(base)).ok).toBe(true);
  });

  it("lowercases and trims the email", () => {
    const result = validateSignUp(form({ ...base, email: "  ADA@Example.COM " }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.email).toBe("ada@example.com");
  });

  it("rejects a malformed email", () => {
    expect(validateSignUp(form({ ...base, email: "not-an-email" })).ok).toBe(false);
    expect(validateSignUp(form({ ...base, email: "a@b" })).ok).toBe(false);
  });

  it("rejects a short password", () => {
    const result = validateSignUp(form({ ...base, password: "short" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.password).toBeDefined();
  });

  it("requires a name", () => {
    expect(validateSignUp(form({ ...base, name: "" })).ok).toBe(false);
  });

  it("falls back to UTC for an unrecognised timezone", () => {
    const result = validateSignUp(form({ ...base, timezone: "Middle/Earth" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.timezone).toBe("UTC");
  });

  it("keeps a valid timezone", () => {
    const result = validateSignUp(form({ ...base, timezone: "Europe/Berlin" }));
    expect(result.ok && result.data.timezone).toBe("Europe/Berlin");
  });
});

describe("validateSignIn", () => {
  it("accepts credentials", () => {
    expect(validateSignIn(form({ email: "a@b.com", password: "x" })).ok).toBe(true);
  });

  it("requires both fields", () => {
    expect(validateSignIn(form({ email: "", password: "" })).ok).toBe(false);
  });
});

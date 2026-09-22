"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  HABIT_FREQUENCIES,
  HABIT_FREQUENCY_CONFIG,
  MAX_HABIT_NAME_LENGTH,
  MAX_WEEKLY_TARGET,
  MIN_WEEKLY_TARGET,
  WEEKDAY_OPTIONS,
} from "@/config/habits";
import { createHabitAction, updateHabitAction } from "@/lib/habits/actions";
import { IDLE_HABIT_FORM_STATE, type HabitFormState } from "@/lib/habits/form-state";
import type { HabitView } from "@/lib/habits/queries";
import { cn } from "@/lib/cn";
import type { HabitFrequency } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { FormError } from "@/components/ui/States";

/**
 * Create / edit a habit.
 *
 * A Server Action through `useActionState`, so it works before hydration and
 * its field errors come from the same validator the server trusts — the client
 * never re-implements a rule.
 *
 * Only the fields the chosen recurrence actually uses are shown, and only
 * those are submitted: a habit switched from chosen days to daily must not
 * carry stale weekdays, and the validator discards them for the same reason.
 * Every field is controlled, because React resets an uncontrolled form once
 * its action completes and a single validation error would otherwise throw
 * away everything typed.
 */
export function HabitForm({
  habit,
  today,
  onSuccess,
  onCancel,
}: {
  habit?: HabitView | null;
  today: string;
  onSuccess: (state: HabitFormState) => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(habit);
  const [state, formAction, pending] = useActionState<HabitFormState, FormData>(
    // `bind` rather than a hidden id field: the habit being edited is decided
    // by the server action's own closure, never by the submitted form.
    isEditing && habit ? updateHabitAction.bind(null, habit.id) : createHabitAction,
    IDLE_HABIT_FORM_STATE,
  );

  const [name, setName] = useState(habit?.name ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? "DAILY");
  const [weekdays, setWeekdays] = useState<number[]>(
    habit?.weekdays ? [...habit.weekdays] : [1, 2, 3, 4, 5],
  );
  const [weeklyTarget, setWeeklyTarget] = useState(String(habit?.weeklyTarget ?? 3));
  const [xpReward, setXpReward] = useState(String(habit?.xpReward ?? 10));
  const [startDate, setStartDate] = useState(habit?.startDate ?? today);
  const [endDate, setEndDate] = useState(habit?.endDate ?? "");

  const handledRef = useRef<HabitFormState | null>(null);
  useEffect(() => {
    if (state.status === "success" && handledRef.current !== state) {
      handledRef.current = state;
      onSuccess(state);
    }
  }, [state, onSuccess]);

  const errors = state.errors ?? {};

  const toggleDay = (day: number) =>
    setWeekdays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={errors._form} />

      <TextField
        label="Habit"
        name="name"
        required
        autoFocus
        maxLength={MAX_HABIT_NAME_LENGTH}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Read 20 pages"
        hint="Something you can do in one sitting, most days."
        error={errors.name}
        autoComplete="off"
      />

      <TextAreaField
        label="Why it matters"
        name="description"
        rows={2}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Optional. What this is for."
        error={errors.description}
      />

      {/* -- recurrence -------------------------------------------------- */}
      <fieldset className="space-y-2">
        <legend className="mb-1.5 block text-[0.8125rem] font-medium text-ink">How often</legend>

        <div className="grid gap-2 sm:grid-cols-3">
          {HABIT_FREQUENCIES.map((value) => {
            const config = HABIT_FREQUENCY_CONFIG[value];
            const active = frequency === value;

            return (
              <label
                key={value}
                className={cn(
                  "cursor-pointer rounded-[var(--radius-control)] border px-3 py-2.5 transition-colors",
                  active
                    ? "border-accent/60 bg-accent/10"
                    : "border-line bg-white/[0.02] hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="frequency"
                  value={value}
                  checked={active}
                  onChange={() => setFrequency(value)}
                  className="sr-only"
                />
                <span className={cn("block text-[0.8125rem] font-medium", active ? "text-ink" : "text-ink-muted")}>
                  {config.label}
                </span>
                <span className="mt-0.5 block text-[0.6875rem] leading-snug text-ink-faint">
                  {config.hint}
                </span>
              </label>
            );
          })}
        </div>
        {errors.frequency && <p className="text-[0.75rem] text-critical">{errors.frequency}</p>}
      </fieldset>

      {frequency === "WEEKDAYS" && (
        <fieldset>
          <legend className="mb-1.5 block text-[0.8125rem] font-medium text-ink">
            Which days
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_OPTIONS.map((option) => {
              const active = weekdays.includes(option.value);

              return (
                <label
                  key={option.value}
                  className={cn(
                    "cursor-pointer rounded-[var(--radius-control)] border px-2.5 py-1.5 text-[0.75rem] font-medium transition-colors",
                    active
                      ? "border-accent/60 bg-accent/10 text-ink"
                      : "border-line bg-white/[0.02] text-ink-muted hover:border-line-strong",
                  )}
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={option.value}
                    checked={active}
                    onChange={() => toggleDay(option.value)}
                    className="sr-only"
                  />
                  <span className="sr-only">{option.label}</span>
                  <span aria-hidden="true">{option.short}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-[0.75rem] text-ink-faint">
            Days you do not pick are not misses — they simply are not occurrences.
          </p>
          {errors.weekdays && <p className="mt-1 text-[0.75rem] text-critical">{errors.weekdays}</p>}
        </fieldset>
      )}

      {frequency === "WEEKLY" && (
        <TextField
          label="Times per week"
          name="weeklyTarget"
          type="number"
          inputMode="numeric"
          min={MIN_WEEKLY_TARGET}
          max={MAX_WEEKLY_TARGET}
          value={weeklyTarget}
          onChange={(event) => setWeeklyTarget(event.target.value)}
          hint="Counted Monday to Sunday, on whichever days suit."
          error={errors.weeklyTarget}
        />
      )}

      {/* -- reward and dates -------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="XP per completion"
          name="xpReward"
          type="number"
          inputMode="numeric"
          min={0}
          value={xpReward}
          onChange={(event) => setXpReward(event.target.value)}
          hint="Small and frequent beats large and rare."
          error={errors.xpReward}
        />

        <TextField
          label="Starts"
          name="startDate"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          hint="Days before this are never counted."
          error={errors.startDate}
        />
      </div>

      <TextField
        label="Ends"
        name="endDate"
        type="date"
        value={endDate}
        onChange={(event) => setEndDate(event.target.value)}
        hint="Optional. Leave blank for a habit with no end in sight."
        error={errors.endDate}
      />

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {isEditing ? "Save changes" : "Create habit"}
        </Button>
      </div>
    </form>
  );
}

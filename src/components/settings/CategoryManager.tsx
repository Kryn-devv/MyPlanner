"use client";

import { Archive, Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CATEGORY_COLORS } from "@/config/categories";
import { cn } from "@/lib/cn";
import { archiveCategoryAction, createCategoryAction } from "@/lib/tasks/actions";
import { IDLE_TASK_FORM_STATE, type TaskFormState } from "@/lib/tasks/form-state";
import { MAX_CATEGORY_NAME_LENGTH } from "@/lib/validation/task";
import type { CategoryView } from "@/lib/tasks/queries";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { EmptyState, FormError } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { CategoryDot } from "@/components/tasks/CategoryBadge";

/**
 * Category management.
 *
 * Categories are user data, not a fixed taxonomy — nothing in business logic
 * branches on a category's name, only on its id, so users can reorganise
 * freely. Archiving rather than deleting keeps existing tasks' grouping intact.
 */
export function CategoryManager({ categories }: { categories: readonly CategoryView[] }) {
  const [state, formAction, pending] = useActionState<TaskFormState, FormData>(
    createCategoryAction,
    IDLE_TASK_FORM_STATE,
  );
  const [color, setColor] = useState(CATEGORY_COLORS[0]?.value ?? "slate");
  const [archiving, startArchiving] = useTransition();
  const { push } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const handledRef = useRef<TaskFormState | null>(null);

  useEffect(() => {
    if (state.status === "success" && handledRef.current !== state) {
      handledRef.current = state;
      formRef.current?.reset();
      push({ tone: "success", message: state.message ?? "Category created." });
    }
  }, [state, push]);

  const errors = state.errors ?? {};

  const archive = (category: CategoryView) => {
    startArchiving(async () => {
      const result = await archiveCategoryAction(category.id);
      push(
        result.status === "error"
          ? { tone: "error", message: result.errors?._form ?? "Could not archive that category." }
          : { tone: "success", message: "Category archived", detail: category.name },
      );
    });
  };

  return (
    <div className="space-y-5">
      {categories.length === 0 ? (
        <EmptyState
          dense
          title="No categories yet"
          description="Create one below to start grouping your tasks."
        />
      ) : (
        <ul className="divide-y divide-line">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center gap-3 py-2.5 first:pt-0">
              <CategoryDot color={category.color} />
              <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">{category.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => archive(category)}
                disabled={archiving}
                aria-label={`Archive ${category.name}`}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                <span aria-hidden="true" className="hidden sm:inline">
                  Archive
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="space-y-3 border-t border-line pt-5" noValidate>
        <FormError message={errors._form} />

        <input type="hidden" name="color" value={color} />

        <TextField
          label="New category"
          name="name"
          required
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          placeholder="e.g. Robotics"
          error={errors.name}
          autoComplete="off"
        />

        <fieldset>
          <legend className="mb-2 text-[0.8125rem] font-medium text-ink-muted">Colour</legend>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_COLORS.map((option) => {
              const selected = color === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setColor(option.value)}
                  aria-pressed={selected}
                  aria-label={option.label}
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border transition-all",
                    selected ? "scale-110 border-white/40" : "border-line hover:border-line-strong",
                  )}
                >
                  <span aria-hidden="true" className={cn("h-3 w-3 rounded-full", option.dotClass)} />
                </button>
              );
            })}
          </div>
          {errors.color && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-critical">
              {errors.color}
            </p>
          )}
        </fieldset>

        <Button type="submit" variant="secondary" loading={pending}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add category
        </Button>
      </form>
    </div>
  );
}

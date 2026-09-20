"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MAX_MILESTONE_TITLE_LENGTH } from "@/config/projects";
import { createMilestoneAction, updateMilestoneAction } from "@/lib/projects/actions";
import { IDLE_PROJECT_FORM_STATE, type ProjectFormState } from "@/lib/projects/form-state";
import type { MilestoneView } from "@/lib/projects/queries";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { FormError } from "@/components/ui/States";

/** Create / edit a milestone. Deliberately small — a milestone is a checkpoint. */
export function MilestoneForm({
  projectId,
  milestone,
  onSuccess,
  onCancel,
}: {
  projectId: string;
  milestone?: MilestoneView | null;
  onSuccess: (state: ProjectFormState) => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(milestone);
  const action = isEditing ? updateMilestoneAction : createMilestoneAction;
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    action,
    IDLE_PROJECT_FORM_STATE,
  );

  // Controlled for the same reason as ProjectForm: a form action resets
  // uncontrolled fields, so a validation error must not cost the user's input.
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [dueDate, setDueDate] = useState(milestone?.dueDate ?? "");

  const handledRef = useRef<ProjectFormState | null>(null);
  useEffect(() => {
    if (state.status === "success" && handledRef.current !== state) {
      handledRef.current = state;
      onSuccess(state);
    }
  }, [state, onSuccess]);

  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* The project is fixed by context — never chosen in the form, so it
          cannot be pointed at someone else's project from the client. */}
      <input type="hidden" name="projectId" value={projectId} />
      {isEditing && <input type="hidden" name="milestoneId" value={milestone?.id} />}

      <FormError message={errors._form} />

      <TextField
        label="Title"
        name="title"
        required
        autoFocus
        maxLength={MAX_MILESTONE_TITLE_LENGTH}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="e.g. Hardware"
        error={errors.title}
        autoComplete="off"
      />

      <TextAreaField
        label="Description"
        name="description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What has to be true for this checkpoint to be reached?"
        error={errors.description}
        rows={2}
      />

      <TextField
        label="Due date"
        name="dueDate"
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
        error={errors.dueDate}
      />

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {isEditing ? "Save changes" : "Add milestone"}
        </Button>
      </div>
    </form>
  );
}

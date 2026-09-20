"use client";

import { Link2 } from "lucide-react";
import { useState, useTransition } from "react";
import { setProjectGoalAction } from "@/lib/goals/actions";
import type { ProjectOption } from "@/lib/projects/queries";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { EmptyState, FormError } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

/**
 * Connects an existing project to this goal.
 *
 * Only offers projects that are not already under *this* goal; one already
 * connected is not a choice, and one under a different goal is offered with
 * that stated, because moving it is a legitimate thing to want.
 */
export function ConnectProjectForm({
  goalId,
  options,
  onDone,
}: {
  goalId: string;
  options: readonly ProjectOption[];
  onDone: () => void;
}) {
  // A project already under this goal is not a choice; one under a different
  // goal is offered with that stated, because moving it is legitimate.
  const connectable = options.filter((project) => project.goalId !== goalId);

  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  if (connectable.length === 0) {
    return (
      <EmptyState
        dense
        icon={<Link2 />}
        title="No other projects to connect"
        description="Every project you have is already under this goal — or you have none yet."
      />
    );
  }

  const submit = () => {
    if (!projectId) {
      setError("Choose a project to connect.");
      return;
    }

    startTransition(async () => {
      const result = await setProjectGoalAction(projectId, goalId);
      if (result.status === "error") {
        setError(result.errors?._form ?? "We could not connect that project.");
        return;
      }
      push({ tone: "success", message: result.message ?? "Project connected." });
      onDone();
    });
  };

  return (
    <div className="space-y-4">
      <FormError message={error} />

      <SelectField
        label="Project"
        name="projectId"
        value={projectId}
        onChange={(event) => {
          setProjectId(event.target.value);
          setError(undefined);
        }}
        hint="Its milestones and tasks come with it. Nothing is copied or moved."
      >
        <option value="">Choose a project…</option>
        {connectable.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
            {project.goalTitle ? ` — currently under ${project.goalTitle}` : ""}
          </option>
        ))}
      </SelectField>

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={submit} loading={pending}>
          Connect project
        </Button>
      </div>
    </div>
  );
}

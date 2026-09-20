"use client";

import { useActionState, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { updateProfileAction, type ProfileFormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { FormError } from "@/components/ui/States";

/**
 * Profile and timezone.
 *
 * The timezone list comes from `Intl.supportedValuesOf` where the runtime
 * offers it, which keeps it correct as the IANA database changes rather than
 * freezing a hand-maintained list into the bundle.
 */
export function ProfileForm({
  name,
  timezone,
  email,
}: {
  name: string;
  timezone: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    updateProfileAction,
    {},
  );
  const [zones, setZones] = useState<string[]>([timezone]);
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => {
    try {
      const supported =
        typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
      const list = supported.length > 0 ? [...supported] : [timezone, "UTC"];
      if (!list.includes(timezone)) list.unshift(timezone);
      setZones(list);
    } catch {
      setZones([timezone, "UTC"]);
    }

    try {
      setDetected(Intl.DateTimeFormat().resolvedOptions().timeZone ?? null);
    } catch {
      setDetected(null);
    }
  }, [timezone]);

  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={errors._form} />

      <TextField
        label="Email"
        name="email"
        value={email}
        disabled
        readOnly
        hint="Email cannot be changed yet."
      />

      <TextField
        label="Name"
        name="name"
        defaultValue={name}
        required
        error={errors.name}
        autoComplete="name"
      />

      <SelectField
        label="Timezone"
        name="timezone"
        defaultValue={timezone}
        error={errors.timezone}
        hint={
          detected && detected !== timezone
            ? `Your device reports ${detected}.`
            : "Used for due dates, “today”, and your streak."
        }
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </SelectField>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" variant="primary" loading={pending}>
          Save changes
        </Button>
        {state.success && (
          <span role="status" className="inline-flex items-center gap-1.5 text-[0.8125rem] text-positive">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

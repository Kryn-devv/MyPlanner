/**
 * Product identity lives here and nowhere else.
 *
 * "NOVA" is an internal working name. When the brand is decided, set
 * NEXT_PUBLIC_APP_NAME and nothing in the source has to change.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "NOVA";

export const APP_TAGLINE = "Your productivity operating system";

export const APP_DESCRIPTION =
  "Plan your day, ship your work, and level up. Tasks, deadlines and progression in one focused workspace.";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Forgot password" };

/** Signed-in visitors go on to the app, so the back button cannot land them here. */
export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/app");
  return <ForgotPasswordForm />;
}

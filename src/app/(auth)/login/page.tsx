import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

/** Signed-in visitors go on to the app, so the back button cannot land them here. */
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/app");
  return <AuthForm mode="signin" />;
}

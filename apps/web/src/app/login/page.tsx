import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { socialProviders } from "@/lib/auth";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/projects" } = await searchParams;
  if (await getSession()) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/projects");
  return <AuthForm mode="login" next={next} providers={socialProviders} showSetupHint={process.env.NODE_ENV !== "production"} />;
}

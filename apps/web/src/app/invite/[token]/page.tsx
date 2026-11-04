import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/actions";
import { Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await acceptInvite(token);
  if (res.ok) redirect(`/project/${res.projectId}`);
  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <Logo size={40} />
        <h1 className="mt-6 text-xl font-semibold">Convite inválido</h1>
        <p className="mt-2 text-sm text-zinc-600">{res.error}</p>
        <Link href="/projects" className="mt-6 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
          Ir para meus projetos
        </Link>
      </div>
    </div>
  );
}

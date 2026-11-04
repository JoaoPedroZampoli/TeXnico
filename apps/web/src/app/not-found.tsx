import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-zinc-600">O projeto não existe ou você não tem acesso a ele.</p>
      <Link href="/projects" className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">
        Ir para meus projetos
      </Link>
    </div>
  );
}

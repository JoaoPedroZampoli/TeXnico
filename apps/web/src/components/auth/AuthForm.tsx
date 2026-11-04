"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Input, Logo, Spinner } from "@/components/ui";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.09 3.58-5.17 3.58-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.86-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l3.99-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.62l3.99 3.1C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}

const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  USER_ALREADY_EXISTS: "Já existe uma conta com esse e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com esse e-mail.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 8 caracteres.",
  INVALID_EMAIL: "E-mail inválido.",
};

export function AuthForm({
  mode,
  next,
  providers,
  showSetupHint = false,
}: {
  mode: "login" | "signup";
  next: string;
  providers: { github: boolean; google: boolean };
  /** In development, show unconfigured providers as disabled buttons with setup instructions. */
  showSetupHint?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/projects";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("email");
    const res =
      mode === "signup"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
    if (res.error) {
      setError(ERRORS[res.error.code ?? ""] ?? res.error.message ?? "Algo deu errado. Tente novamente.");
      setLoading(null);
      return;
    }
    router.replace(safeNext);
    router.refresh();
  }

  async function social(provider: "github" | "google") {
    setLoading(provider);
    const res = await authClient.signIn.social({ provider, callbackURL: safeNext });
    if (res?.error) {
      setError(res.error.message ?? "Não foi possível entrar.");
      setLoading(null);
    }
  }

  const hasSocial = providers.github || providers.google || showSetupHint;
  const missing = [!providers.google && "Google", !providers.github && "GitHub"].filter(Boolean) as string[];
  const other = mode === "login" ? "/signup" : "/login";

  const socialButton = (provider: "google" | "github", label: string, icon: React.ReactNode) => {
    const configured = providers[provider];
    if (!configured && !showSetupHint) return null;
    return (
      <Button
        type="button"
        onClick={() => social(provider)}
        disabled={!!loading || !configured}
        title={configured ? undefined : `Login com ${label} ainda não configurado`}
      >
        {loading === provider ? <Spinner /> : icon} Continuar com {label}
      </Button>
    );
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo size={40} />
        </Link>
        <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          <h1 className="text-xl font-semibold">{mode === "login" ? "Entrar" : "Criar sua conta"}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {mode === "login" ? "Bem-vindo de volta!" : "Leva menos de um minuto."}
          </p>

          {hasSocial && (
            <div className="mt-6 grid gap-2">
              {socialButton("google", "Google", <GoogleIcon />)}
              {socialButton("github", "GitHub", <GitHubIcon />)}
              {showSetupHint && missing.length > 0 && (
                <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  <b>Só você vê este aviso (modo de desenvolvimento).</b> Para ativar o login com {missing.join(" e ")},
                  preencha {missing.map((m) => `${m.toUpperCase()}_CLIENT_ID/SECRET`).join(" e ")} no <code>.env</code> e
                  reinicie o site. O passo a passo está no README.
                </p>
              )}
              <div className="my-2 flex items-center gap-3 text-xs text-zinc-400">
                <span className="h-px flex-1 bg-zinc-200" /> ou com e-mail <span className="h-px flex-1 bg-zinc-200" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className={hasSocial ? "grid gap-3" : "mt-6 grid gap-3"}>
            {mode === "signup" && (
              <label className="grid gap-1.5 text-sm font-medium">
                Nome
                <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Como seus amigos te chamam" />
              </label>
            )}
            <label className="grid gap-1.5 text-sm font-medium">
              E-mail
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="voce@exemplo.com" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Senha
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "signup" ? "Pelo menos 8 caracteres" : ""}
              />
            </label>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" variant="primary" className="mt-1" disabled={!!loading}>
              {loading === "email" && <Spinner />}
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">
          {mode === "login" ? "Ainda não tem conta? " : "Já tem conta? "}
          <Link href={`${other}${next !== "/projects" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-zinc-900 underline-offset-4 hover:underline">
            {mode === "login" ? "Criar conta" : "Entrar"}
          </Link>
        </p>
      </div>
    </div>
  );
}

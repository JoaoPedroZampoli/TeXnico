import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, Link2, MessageSquare, MousePointerClick, Sparkles, Users, Zap } from "lucide-react";
import { HeroDemo } from "@/components/landing/HeroDemo";
import { Logo } from "@/components/ui";
import { APP_NAME } from "@/lib/config";
import { getSession } from "@/lib/session";

const ENGINES = [
  "pdfLaTeX", "XeLaTeX", "LuaLaTeX", "BibTeX", "Biber", "TikZ", "PGFPlots", "abnTeX2", "Beamer",
  "amsmath", "babel · português", "siunitx", "hyperref", "SyncTeX", "biblatex", "chemfig",
];

function Section({ eyebrow, title, children, id }: { eyebrow: string; title: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-[0.2em] text-brand-700 uppercase">{eyebrow}</p>
        <h2 className="mt-3 font-display text-4xl tracking-tight text-balance sm:text-5xl">{title}</h2>
      </div>
      <div className="mt-14">{children}</div>
    </section>
  );
}

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`group relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-7 transition hover:border-zinc-300 hover:shadow-[0_20px_50px_-25px_rgb(0_0_0/0.25)] ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
  return (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white">
        <Icon size={17} />
      </span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-600">{text}</p>
    </>
  );
}

export default async function Home() {
  if (await getSession()) redirect("/projects");

  return (
    <div className="min-h-full overflow-x-hidden bg-white">
      {/* ---------- nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-transparent bg-white/70 backdrop-blur-md supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Logo /> {APP_NAME}
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#recursos" className="hidden rounded-lg px-3 py-2 text-zinc-600 hover:text-zinc-900 sm:block">
              Recursos
            </a>
            <a href="#como-funciona" className="hidden rounded-lg px-3 py-2 text-zinc-600 hover:text-zinc-900 sm:block">
              Como funciona
            </a>
            <Link href="/login" className="rounded-lg px-3 py-2 text-zinc-600 hover:text-zinc-900">
              Entrar
            </Link>
            <Link href="/signup" className="ml-1 rounded-full bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800">
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ---------- hero ---------- */}
        <section className="relative">
          <div className="landing-grid pointer-events-none absolute inset-0 -top-20" />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(16_185_129/0.16),transparent)]" />
          <div className="pointer-events-none absolute top-40 -right-40 h-[400px] w-[400px] rounded-full bg-[radial-gradient(closest-side,rgb(124_58_237/0.10),transparent)]" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16 text-center sm:pt-28">
            <span className="fade-up inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              Colaboração em tempo real · TeX Live completo
            </span>
            <h1 className="fade-up mt-7 font-display text-[3.2rem] leading-[1.02] tracking-tight text-balance sm:text-7xl md:text-[5.5rem]" style={{ animationDelay: "80ms" }}>
              Escreva LaTeX <em className="text-brand-700">junto</em>
              <br className="hidden sm:block" /> com seus amigos.
            </h1>
            <p className="fade-up mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-zinc-600" style={{ animationDelay: "160ms" }}>
              Trabalhos, listas, TCCs e apresentações no navegador: todo mundo no mesmo documento, com o PDF ao lado e
              sem instalar nada.
            </p>
            <div className="fade-up mt-9 flex flex-wrap justify-center gap-3" style={{ animationDelay: "240ms" }}>
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3.5 font-medium text-white shadow-lg shadow-zinc-900/20 transition hover:bg-zinc-800"
              >
                Começar agora
                <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
              </Link>
              <Link href="/login" className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-6 py-3.5 font-medium transition hover:border-zinc-300 hover:bg-zinc-50">
                Já tenho conta
              </Link>
            </div>
            <p className="fade-up mt-5 text-xs text-zinc-400" style={{ animationDelay: "300ms" }}>
              Grátis · Entre com Google, GitHub ou e-mail
            </p>
          </div>

          <div className="fade-up relative mx-auto max-w-6xl px-4 pb-10 sm:px-6" style={{ animationDelay: "380ms" }}>
            <HeroDemo />
          </div>
        </section>

        {/* ---------- marquee ---------- */}
        <section className="border-y border-zinc-100 bg-zinc-50/60 py-6">
          <p className="mb-4 text-center text-xs font-medium tracking-wide text-zinc-400">TUDO O QUE VOCÊ JÁ USA NO LATEX, FUNCIONANDO DE PRIMEIRA</p>
          <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]">
            <div className="marquee flex w-max gap-3">
              {[...ENGINES, ...ENGINES].map((e, i) => (
                <span key={i} className="rounded-full border border-zinc-200 bg-white px-4 py-1.5 font-mono text-[13px] whitespace-nowrap text-zinc-600">
                  {e}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- features (bento) ---------- */}
        <Section id="recursos" eyebrow="Recursos" title={<>Feito para escrever <em>em grupo</em></>}>
          <div className="grid gap-4 md:grid-cols-6">
            <Card className="md:col-span-4">
              <CardTitle icon={Users} title="Edição simultânea de verdade" text="Cada pessoa tem seu cursor colorido. As alterações aparecem na hora, sem conflitos e sem “quem salvou por último”, e funcionam até se a internet cair por um instante." />
              <div className="mt-6 space-y-3 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 pt-6 pb-4 font-mono text-[12.5px] leading-6">
                <div>
                  \section{"{"}Metodologia{"}"}
                  <span className="relative ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-violet-600">
                    <span className="absolute -top-4 left-0 rounded bg-violet-600 px-1 font-sans text-[9px] font-semibold text-white">Ana</span>
                  </span>
                </div>
                <div className="text-zinc-500">
                  Coletamos os dados em
                  <span className="relative mx-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-orange-600">
                    <span className="absolute -top-4 left-0 rounded bg-orange-600 px-1 font-sans text-[9px] font-semibold text-white">Bruno</span>
                  </span>
                  três etapas…
                </div>
                <div className="text-zinc-500">
                  <span className="bg-sky-100">Os resultados indicam que</span>
                  <span className="relative ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-sky-600">
                    <span className="absolute -top-4 left-0 rounded bg-sky-600 px-1 font-sans text-[9px] font-semibold text-white">Carla</span>
                  </span>
                </div>
              </div>
            </Card>

            <Card className="md:col-span-2">
              <CardTitle icon={Zap} title="Erros na linha certa" text="O log do LaTeX é traduzido em uma lista clara. Um clique leva você direto ao problema." />
              <div className="mt-6 space-y-2">
                <div className="rounded-xl border border-red-100 bg-red-50/70 p-3">
                  <div className="text-[13px] font-medium text-red-800">Undefined control sequence.</div>
                  <div className="mt-0.5 font-mono text-[11px] text-red-700/70">capitulos/intro.tex:42</div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                  <div className="text-[13px] font-medium text-amber-800">Citation ‘knuth84’ undefined</div>
                  <div className="mt-0.5 font-mono text-[11px] text-amber-700/70">main.tex:17</div>
                </div>
              </div>
            </Card>

            <Card className="md:col-span-2">
              <CardTitle icon={MousePointerClick} title="SyncTeX" text="Dois cliques no PDF levam ao trecho do código. “Ver no PDF” faz o caminho inverso." />
              <div className="mt-6 rounded-xl bg-zinc-100 p-4">
                <div className="rounded bg-white p-4 font-paper text-[13px] leading-relaxed shadow-sm">
                  O teorema garante que{" "}
                  <span className="rounded-sm bg-amber-200/70 px-0.5 ring-1 ring-amber-300">toda sequência limitada</span> possui
                  subsequência convergente.
                </div>
              </div>
            </Card>

            <Card className="md:col-span-2">
              <CardTitle icon={Link2} title="Convite em um link" text="Compartilhe como editor ou só leitura. Seus amigos entram com um clique e você revoga quando quiser." />
              <div className="mt-6 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 py-2 pr-2 pl-3">
                <span className="rounded bg-zinc-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">EDITOR</span>
                <code className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">texnico.app/invite/k3Xq9…</code>
                <span className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white">
                  <Check size={11} /> Copiado
                </span>
              </div>
            </Card>

            <Card className="md:col-span-2">
              <CardTitle icon={MessageSquare} title="Chat do projeto" text="Combinem quem escreve o quê sem sair do documento. Você vê também quem está online e em qual arquivo." />
              <div className="mt-6 space-y-2 text-[13px]">
                <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-3 py-2">
                  <b className="text-violet-700">Ana</b> eu fico com a introdução 🙋‍♀️
                </div>
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-3 py-2 text-white">
                  fechado, faço os gráficos em TikZ
                </div>
              </div>
            </Card>
          </div>
        </Section>

        {/* ---------- how it works ---------- */}
        <section id="como-funciona" className="bg-zinc-950 text-white">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold tracking-[0.2em] text-brand-500 uppercase">Como funciona</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight text-balance sm:text-5xl">
                Do zero ao PDF em <em className="text-brand-500">um minuto</em>
              </h2>
            </div>
            <ol className="mt-16 grid gap-6 md:grid-cols-3">
              {[
                { n: "1", t: "Crie um projeto", d: "Comece do zero ou escolha um modelo pronto: artigo, relatório/TCC ou apresentação Beamer, já em português." },
                { n: "2", t: "Chame a galera", d: "Envie um link de convite. Cada um edita a sua parte, ao mesmo tempo, no mesmo documento." },
                { n: "3", t: "Compile e entregue", d: "Ctrl+S gera o PDF com TeX Live completo. Baixe o PDF ou o código-fonte em .zip." },
              ].map((s) => (
                <li key={s.n} className="rounded-3xl border border-white/10 bg-white/[0.03] p-7">
                  <span className="font-display text-5xl text-brand-500 italic">{s.n}</span>
                  <h3 className="mt-4 text-lg font-semibold">{s.t}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-400">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section className="relative overflow-hidden">
          <div className="landing-grid pointer-events-none absolute inset-0 rotate-180" />
          <div className="relative mx-auto max-w-3xl px-6 py-28 text-center">
            <Sparkles className="mx-auto text-brand-600" size={28} />
            <h2 className="mt-5 font-display text-5xl tracking-tight text-balance sm:text-6xl">
              O próximo trabalho em grupo vai ser <em>bem</em> mais fácil.
            </h2>
            <Link
              href="/signup"
              className="group mt-10 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-7 py-4 font-medium text-white shadow-lg shadow-zinc-900/20 transition hover:bg-zinc-800"
            >
              Criar minha conta grátis
              <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-zinc-500">
          <span className="flex items-center gap-2">
            <Logo size={22} /> {APP_NAME}
          </span>
          <span>Feito para escrever junto.</span>
        </div>
      </footer>
    </div>
  );
}

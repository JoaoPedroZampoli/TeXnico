# TeXnico

Editor de LaTeX **colaborativo em tempo real**, inspirado no Overleaf e no Prism, para escrever com os amigos.

- ✍️ **Edição simultânea** (Yjs/CRDT): cursores e seleções de cada pessoa, sem conflitos e funcionando offline
- 📄 **Compilação real com TeX Live**: pdfLaTeX, XeLaTeX e LuaLaTeX via `latexmk`, com BibTeX/Biber, TikZ, abnTeX2, babel em português…
- 🔍 **Erros na linha certa**: o log é analisado, os erros aparecem sublinhados no código e você clica para ir até eles
- 🔁 **SyncTeX**: dê dois cliques no PDF para ir ao código, ou use **Ver no PDF** (`Ctrl+Alt+→`) no sentido contrário
- 🗂️ **Vários arquivos e pastas**: arraste para mover, envie imagens/.bib/.tex, escolha o arquivo principal
- 👥 **Compartilhamento**: convite por e-mail ou por link, com permissão de **editor** ou **leitor**
- 💬 **Chat do projeto**, presença de quem está online e em qual arquivo
- 🔐 **Login** com e-mail e senha, Google ou GitHub
- 📦 Download do PDF e do código-fonte em `.zip`; modelos de artigo, relatório/TCC e Beamer
- 📱 Funciona no celular (abas Arquivos / Código / PDF)

## Arquitetura

```
 Navegador ──HTTPS──▶  Site (Next.js)  ── Vercel ou Docker
     │                 login, painel, convites
     │                         │
     │                         ▼
     │                   PostgreSQL  ◀── Neon / Supabase / Docker
     │                         ▲
     └──WSS + HTTPS──▶  Servidor de tempo real + compilação (Docker)
                        Hocuspocus (Yjs) + latexmk/TeX Live + SyncTeX
```

| Pasta             | O que é                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `apps/web`        | Site em Next.js 16: autenticação (Better Auth), painel, editor (CodeMirror 6 + pdf.js) |
| `apps/server`     | Servidor Node: WebSocket de colaboração (Hocuspocus) e API de compilação     |
| `packages/db`     | Schema do banco (Drizzle ORM) e migrações                                    |
| `packages/shared` | Modelo do documento colaborativo (árvore de arquivos no Yjs) e modelos de projeto |

O site e o servidor de compilação ficam separados porque a Vercel não consegue rodar o TeX Live (são gigabytes de
pacotes e cada compilação leva segundos) nem manter WebSockets abertos. O navegador recebe do site um token de curta
duração e o usa para falar direto com o servidor de compilação.

---

## Rodando no seu computador

Requisitos: Node 20+ e Docker.

```bash
npm install
cp .env.example .env            # preencha BETTER_AUTH_SECRET e REALTIME_SECRET (openssl rand -base64 32)

# Banco de dados
docker run -d --name texcollab-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=texcollab -p 5432:5432 postgres:17-alpine

# Servidor de compilação (imagem com TeX Live; o primeiro build demora)
docker build -t texcollab-server .
docker run -d --name texcollab-server --network host --env-file .env texcollab-server

# Site
npm run dev --workspace=@texcollab/web
```

Abra http://localhost:3000. As migrações do banco rodam sozinhas quando o servidor inicia.

> Quer tudo com um comando só? `docker compose up -d --build` sobe banco, servidor e site
> (defina `BETTER_AUTH_SECRET` e `REALTIME_SECRET` no `.env`).

---

## Publicando de graça (Vercel + Neon + Oracle Cloud)

Tudo abaixo cabe nos planos gratuitos. Gere dois segredos antes de começar:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # REALTIME_SECRET
```

### 1. Banco de dados — Neon

1. Crie uma conta em [neon.tech](https://neon.tech) e um projeto.
2. Copie a *connection string* (`postgres://…?sslmode=require`). Ela é o seu `DATABASE_URL`.

(O Supabase também serve: use a string de conexão do *pooler*.)

### 2. Servidor de compilação — VM grátis da Oracle Cloud

A camada *Always Free* da Oracle oferece uma VM ARM com até 4 núcleos e 24 GB de RAM, de sobra para compilar LaTeX.
Uma `e2-micro` do Google Cloud também funciona, só que bem mais lenta.

1. Crie uma instância **Ubuntu** (formato *Ampere A1*) e libere as portas **80** e **443** na *Security List* da VCN.
   No Ubuntu da Oracle, libere também no firewall da própria VM:
   ```bash
   sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save
   ```
2. Instale o Docker: `curl -fsSL https://get.docker.com | sudo sh`
3. Clone o repositório e configure:
   ```bash
   git clone <url-do-seu-repo> texnico && cd texnico/deploy
   cp server.env.example server.env
   nano server.env
   ```
   - `SERVER_DOMAIN`: um domínio que aponte para o IP da VM. Sem domínio, use o **sslip.io**: para o IP
     `129.1.2.3`, use `129-1-2-3.sslip.io`.
   - `DATABASE_URL`: a string do Neon.
   - `REALTIME_SECRET`: o segredo gerado acima.
   - `WEB_ORIGIN`: o endereço do site na Vercel, por exemplo `https://texnico.vercel.app`.
4. Suba o servidor; o Caddy emite o certificado HTTPS automaticamente:
   ```bash
   sudo docker compose -f docker-compose.server.yml up -d --build
   ```
5. Teste: `https://SEU_DOMINIO/health` deve responder `{"ok":true,…}`.

### 3. Site — Vercel

1. Importe o repositório na [Vercel](https://vercel.com/new).
2. Em **Root Directory**, escolha `apps/web`. O framework (Next.js) é detectado sozinho.
3. Em **Environment Variables**, defina:

   | Variável                   | Valor                                              |
   | -------------------------- | -------------------------------------------------- |
   | `DATABASE_URL`             | string do Neon                                     |
   | `BETTER_AUTH_SECRET`       | segredo gerado                                     |
   | `BETTER_AUTH_URL`          | `https://seu-projeto.vercel.app`                   |
   | `REALTIME_SECRET`          | **o mesmo** usado no servidor                      |
   | `NEXT_PUBLIC_REALTIME_URL` | `https://SEU_DOMINIO` (o servidor da etapa 2)      |

4. Faça o deploy. Se mudar o domínio do site depois, atualize `BETTER_AUTH_URL` na Vercel e `WEB_ORIGIN` no servidor.

### 4. Login com Google e GitHub (opcional)

Os botões só aparecem quando as credenciais estão configuradas na Vercel.

- **GitHub**: *Settings → Developer settings → OAuth Apps → New*. Em *Authorization callback URL*, use
  `https://seu-projeto.vercel.app/api/auth/callback/github`. Defina `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`.
- **Google**: no [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um *OAuth client ID*
  (Web). Em *Authorized redirect URI*, use `https://seu-projeto.vercel.app/api/auth/callback/google`. Defina
  `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

Para testar o login social **no seu computador**, crie apps separados (ou adicione mais uma URL) com
`http://localhost:3000/api/auth/callback/github` e `http://localhost:3000/api/auth/callback/google`, preencha as
variáveis no `.env` da raiz e reinicie o `npm run dev`. Enquanto não estiverem configurados, em modo de
desenvolvimento os botões aparecem desativados com um aviso; em produção ficam ocultos.

### Alternativa: tudo numa VPS só

Na mesma VM da Oracle dá para rodar também o site e o banco com `docker compose up -d --build` (arquivo
`docker-compose.yml` na raiz), dispensando a Vercel e o Neon. Defina `PUBLIC_WEB_URL` e `PUBLIC_REALTIME_URL` no
`.env` e coloque um proxy HTTPS (Caddy, por exemplo) na frente das portas 3000 e 4000.

---

## Configuração do servidor de compilação

| Variável                  | Padrão                  | Descrição                                       |
| ------------------------- | ----------------------- | ----------------------------------------------- |
| `PORT`                    | `4000`                  | Porta HTTP/WebSocket                            |
| `WEB_ORIGIN`              | `http://localhost:3000` | Origens do site autorizadas (separadas por vírgula) |
| `COMPILE_TIMEOUT_SECONDS` | `90`                    | Tempo máximo de uma compilação                  |
| `MAX_CONCURRENT_COMPILES` | `2`                     | Compilações simultâneas (as demais aguardam na fila) |
| `MAX_UPLOAD_MB`           | `15`                    | Tamanho máximo de cada arquivo enviado          |
| `RUN_MIGRATIONS`          | `true`                  | Aplica as migrações do banco ao iniciar         |

A imagem Docker inclui `texlive-fonts-extra` (~1 GB). Para uma imagem menor:
`docker build --build-arg TEXLIVE_FONTS_EXTRA= -t texcollab-server .`

**Segurança da compilação:** o `latexmk` roda só com o *shell-escape restrito* do TeX Live (lista fixa de ferramentas
seguras, como `epstopdf`), sem arquivos de configuração do projeto (`-norc`),
com leitura e escrita restritas à pasta do projeto (`openin_any=p`/`openout_any=p`), com limite de tempo e como
usuário sem privilégios. É uma proteção adequada para um grupo de amigos, mas não para abrir o site a qualquer pessoa.

## Limitações conhecidas e próximos passos

- Ainda não há recuperação de senha por e-mail, porque isso exige um serviço de envio de e-mails (como o Resend).
  Quem esquecer a senha pode entrar com Google ou GitHub, desde que use o mesmo e-mail.
- Quando o dono muda a permissão de alguém, a mudança só vale depois que essa pessoa recarrega a página.
- Não há histórico de versões nem comentários no texto. A edição colaborativa já guarda tudo que é necessário para
  adicionar isso depois.
- Assistente de IA (como no Prism): ficou de fora por enquanto.

Para trocar o nome do app, edite `APP_NAME` em `apps/web/src/lib/config.ts`.

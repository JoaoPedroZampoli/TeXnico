import * as Y from "yjs";
import { createFolder, createTextFile, getSettingsMap, type Compiler } from "./index";

export type TemplateId = "blank" | "article" | "report" | "beamer";

export const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
  { id: "article", name: "Artigo", description: "Artigo com seções, equações, figuras e bibliografia." },
  { id: "report", name: "Relatório / TCC", description: "Documento em capítulos, com sumário e referências." },
  { id: "beamer", name: "Apresentação", description: "Slides com Beamer." },
  { id: "blank", name: "Em branco", description: "Apenas o mínimo para começar." },
];

const esc = (s: string) => s.replace(/([\\{}$&#^_%~])/g, "\\$1");

const BLANK = (title: string) => `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazilian]{babel}

\\title{${esc(title)}}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

Comece a escrever aqui.

\\end{document}
`;

const ARTICLE = (title: string) => `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazilian]{babel}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{hyperref}

\\title{${esc(title)}}
\\author{Seu Nome}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Este é um resumo curto do artigo.
\\end{abstract}

\\section{Introdução}
\\label{sec:intro}
Escreva aqui a introdução. Você pode citar trabalhos~\\cite{knuth1984} e
referenciar seções, como a Seção~\\ref{sec:metodo}.

\\section{Método}
\\label{sec:metodo}
A famosa identidade de Euler:
\\begin{equation}
  e^{i\\pi} + 1 = 0
  \\label{eq:euler}
\\end{equation}

Equações alinhadas:
\\begin{align}
  f(x) &= x^2 + 2x + 1 \\\\
       &= (x + 1)^2
\\end{align}

\\section{Conclusão}
Edite este documento junto com seus amigos em tempo real!

\\bibliographystyle{plain}
\\bibliography{referencias}

\\end{document}
`;

const BIB = `@book{knuth1984,
  author    = {Donald E. Knuth},
  title     = {The {\\TeX}book},
  publisher = {Addison-Wesley},
  year      = {1984}
}

@article{lamport1986,
  author  = {Leslie Lamport},
  title   = {{\\LaTeX}: A Document Preparation System},
  journal = {Addison-Wesley},
  year    = {1986}
}
`;

const REPORT = (title: string) => `\\documentclass[12pt,a4paper]{report}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazilian]{babel}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage[margin=3cm]{geometry}
\\usepackage{hyperref}

\\title{${esc(title)}}
\\author{Seu Nome}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\include{capitulos/introducao}
\\include{capitulos/desenvolvimento}

\\bibliographystyle{plain}
\\bibliography{referencias}

\\end{document}
`;

const CH1 = `\\chapter{Introdução}
\\label{cap:intro}

Cada capítulo fica em um arquivo separado dentro da pasta \\texttt{capitulos}.
Assim, cada pessoa pode trabalhar em uma parte diferente do documento~\\cite{knuth1984}.
`;

const CH2 = `\\chapter{Desenvolvimento}

Conforme apresentado no Capítulo~\\ref{cap:intro}, \\dots

\\section{Uma tabela}
\\begin{table}[h]
  \\centering
  \\begin{tabular}{lcr}
    \\hline
    Item & Quantidade & Valor \\\\
    \\hline
    A & 1 & 10,00 \\\\
    B & 2 & 20,00 \\\\
    \\hline
  \\end{tabular}
  \\caption{Exemplo de tabela.}
\\end{table}
`;

const BEAMER = (title: string) => `\\documentclass{beamer}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazilian]{babel}
\\usetheme{Madrid}

\\title{${esc(title)}}
\\author{Seu Nome}
\\date{\\today}

\\begin{document}

\\frame{\\titlepage}

\\begin{frame}{Sumário}
  \\tableofcontents
\\end{frame}

\\section{Introdução}
\\begin{frame}{Primeiro slide}
  \\begin{itemize}
    \\item<1-> Um ponto
    \\item<2-> Outro ponto
    \\item<3-> E mais um
  \\end{itemize}
\\end{frame}

\\section{Matemática}
\\begin{frame}{Uma equação}
  \\[
    \\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
  \\]
\\end{frame}

\\end{document}
`;

/** Builds the initial Y.Doc for a new project and returns its encoded state. */
export function createProjectDoc(template: TemplateId, title: string): Uint8Array {
  const doc = new Y.Doc();
  let main;
  switch (template) {
    case "article":
      main = createTextFile(doc, null, "main.tex", ARTICLE(title));
      createTextFile(doc, null, "referencias.bib", BIB);
      break;
    case "report": {
      main = createTextFile(doc, null, "main.tex", REPORT(title));
      const folder = createFolder(doc, null, "capitulos");
      createTextFile(doc, folder.id, "introducao.tex", CH1);
      createTextFile(doc, folder.id, "desenvolvimento.tex", CH2);
      createTextFile(doc, null, "referencias.bib", BIB);
      break;
    }
    case "beamer":
      main = createTextFile(doc, null, "main.tex", BEAMER(title));
      break;
    default:
      main = createTextFile(doc, null, "main.tex", BLANK(title));
  }
  const settings = getSettingsMap(doc);
  settings.set("mainFileId", main.id);
  settings.set("compiler", "pdflatex" satisfies Compiler);
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

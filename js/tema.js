// Temas do site: modo (automático, escuro, claro) e cor de destaque. O fundo leva um toque da cor escolhida;
// botões e links são ajustados até ter contraste de leitura (WCAG 4,5:1), então qualquer cor da marca funciona,
// até amarelo ou branco.

export const TEMAS = {
  Grafite: "#6B7280", Roxo: "#8B52D6", Azul: "#2F6FDB", Verde: "#1E9E6A", Laranja: "#E8772E",
  Rosa: "#D64F8F", Vermelho: "#D9443C",
};
export const TEMA_PADRAO = { modo: "escuro", cor: TEMAS.Grafite };  // cor: um hex ou "marca" (segue a cor do PDF)
const CHAVE_LOCAL = "custos3d-tema";

// ---------------------------------------------------------------- conversões de cor
const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16) / 255);

function hsl(hex) {
  const [r, g, b] = rgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hex(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return "#" + [0, 8, 4].map((n) => f(n).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function luminancia(cor) {
  const [r, g, b] = rgb(cor).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Clareia (passo > 0) ou escurece a cor até ter contraste 4,5 com todos os fundos dados. */
function legivel(cor, fundos, passo) {
  let [h, s, l] = hsl(cor);
  const ok = () => fundos.every((f) => contraste(hex(h, s, l), f) >= 4.5);
  while (!ok() && (passo < 0 ? l > 0 : l < 1)) l = Math.min(1, Math.max(0, l + passo));  // branco escurece, preto clareia
  return hex(h, s, l);
}

/** As variáveis de CSS do tema para uma cor de destaque, no modo escuro ou claro. */
export function paleta(cor, escuro) {
  const [h, s] = hsl(cor), sat = (max) => Math.min(s, max);  // cor cinza continua cinza
  const base = escuro
    ? { fundo: hex(h, sat(0.3), 0.08), painel: hex(h, sat(0.25), 0.12), borda: hex(h, sat(0.2), 0.22),
        texto: hex(h, sat(0.35), 0.92), fraco: hex(h, sat(0.15), 0.7) }
    : { fundo: hex(h, sat(0.35), 0.97), painel: "#FFFFFF", borda: hex(h, sat(0.25), 0.87),
        texto: hex(h, sat(0.25), 0.12), fraco: hex(h, sat(0.1), 0.38) };
  // Botão principal: letra branca se der; cor clara (amarelo) fica como está com letra preta
  let primaria = cor, primariaTexto = "#FFFFFF";
  if (contraste(cor, "#FFFFFF") < 4.5) {
    if (contraste(cor, "#000000") >= 4.5) primariaTexto = "#000000";
    else primaria = legivel(cor, ["#FFFFFF"], -0.02);
  }
  return { ...base, primaria, "primaria-texto": primariaTexto,
           link: legivel(cor, [base.fundo, base.painel], escuro ? 0.02 : -0.02) };
}

// ---------------------------------------------------------------- aplicar na página
const sistemaClaro = globalThis.matchMedia?.("(prefers-color-scheme: light)");  // globalThis: roda no node (testes)
let atual = TEMA_PADRAO, corMarca = TEMA_PADRAO.cor;

/** tema: {modo, cor}; marca: a cor do PDF, usada quando tema.cor é "marca". guardar = false é prévia: não vai para
 *  o cache do <head> nem vira o tema "atual" que o modo automático reaplica. */
export function aplicarTema(tema = atual, marca = corMarca, guardar = true) {
  if (guardar) { atual = tema; corMarca = marca; }
  const cor = tema.cor === "marca" ? marca : tema.cor;
  const escuro = tema.modo === "escuro" || (tema.modo === "auto" && !sistemaClaro?.matches);
  const raiz = document.documentElement;
  raiz.dataset.tema = escuro ? "escuro" : "claro";
  raiz.style.colorScheme = escuro ? "dark" : "light";
  for (const [nome, valor] of Object.entries(paleta(cor, escuro))) raiz.style.setProperty(`--${nome}`, valor);
  // O <head> do index.html aplica isto antes de o banco abrir, para a página não piscar com a cor padrão
  if (guardar) try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ modo: tema.modo, escuro: paleta(cor, true), claro: paleta(cor, false) }));
  } catch { /* navegador sem localStorage: só pisca a cor padrão ao abrir */ }
}
sistemaClaro?.addEventListener?.("change", () => atual.modo === "auto" && aplicarTema());

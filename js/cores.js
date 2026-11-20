// Nome em português de um código hex e distância entre cores.
const PALETA = {
  Preto: "#000000", Branco: "#FFFFFF", Cinza: "#A6A9AA", "Cinza escuro": "#545454", Prata: "#C8C8C8",
  Vermelho: "#D7262E", Laranja: "#FF8A1E", Amarelo: "#FEC600", Dourado: "#C9A227", Verde: "#2E9E44",
  "Verde-claro": "#8FD14F", Azul: "#0A5DC2", "Azul-claro": "#61B0FF", Ciano: "#00C2D1", Roxo: "#7A3FC1",
  Rosa: "#F27FB2", Marrom: "#7B4A2A", Bege: "#F0DFCF",
};

export function rgb(cor) {
  const c = (cor || "#808080").replace("#", "").slice(0, 6).padEnd(6, "0");
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
}

/** 0 = iguais. Pondera os canais como o olho humano percebe. */
export function distancia(c1, c2) {
  const [r1, g1, b1] = rgb(c1), [r2, g2, b2] = rgb(c2), rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}

export const nomeDaCor = (cor) =>
  Object.keys(PALETA).reduce((a, b) => (distancia(cor, PALETA[a]) <= distancia(cor, PALETA[b]) ? a : b));

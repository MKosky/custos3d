// Fórmula contra as linhas da planilha.
// Rodar:  node testes.mjs
import { PARAMETROS_PADRAO, calcular, composicao } from "./js/custos.js";
import { TEMAS, contraste, paleta } from "./js/tema.js";

let falhas = 0;
function confere(descricao, obtido, esperado, tolerancia = 0.005) {
  const ok = Math.abs(obtido - esperado) <= tolerancia;
  if (!ok) falhas++;
  console.log(`  [${ok ? "ok" : "FALHOU"}] ${descricao}: obtido ${obtido.toFixed(4)}, esperado ${esperado.toFixed(4)}`);
}

const planilha = { ...PARAMETROS_PADRAO, modo_comissao: "planilha" };
const linha = (peso, tempoH, emb, lucro, p) =>
  calcular([[peso, null]], tempoH * 3600, emb, 1, lucro, p, { marketplace: true });

console.log("1) Fórmula contra linhas conhecidas da planilha");
// [descrição, peso g, tempo h, embalagem R$, % lucro, J, L, O, Q]
for (const [nome, peso, tempo, emb, lucro, J, L, O, Q] of [
  ["Mini capivara fofa", 4, 0.3, 0.7, 0.4, 0.8745, 1.5745, 3, 7.42],
  ["Luffy e o baú do tesouro", 405, 30, 2, 0.4, 88.05, 90.05, 166, 193.24],
  ["Axis Cube (lucro 30%)", 110, 6, 0, 0.3, 21.09, 21.09, 34, 42.76],
  ["Oreo Cookie Slider", 15, 1.1, 10.5, 0.4, 3.2465, 13.7465, 26, 33.64],
]) {
  const r = linha(peso, tempo, emb, lucro, planilha);
  console.log(` ${nome}`);
  confere("custo P-D-T (J)", r.custo_producao, J);
  confere("custo geral (L)", r.custo_geral, L);
  confere("preço (O)", r.preco, O);
  confere("R$ market (Q)", r.preco_market, Q);
}

console.log("2) Modos, vendedor e extras");
const liq = { ...PARAMETROS_PADRAO, modo_comissao: "liquido" };
const r = linha(89.13, 5.683889, 2, 0.4, liq);
confere("preservar o líquido: sobra o preço", r.preco_market * (1 - liq.comissao_perc) - liq.comissao_fixa, r.preco);
const sem = calcular([[405, null]], 30 * 3600, 2, 1, 0.4, planilha);
confere("sem marketplace: comissão zero", sem.comissao, 0);
confere("sem marketplace: preço no marketplace = preço", sem.preco_market, 166);
const vend = calcular([[405, null]], 30 * 3600, 2, 1, 0.4, planilha, { vendedor: true });
confere("vendedor 10%: 166 / 0,9 arredondado", vend.preco, 185);
const pExtra = { ...PARAMETROS_PADRAO, mao_de_obra_h: 20 };
const base = calcular([[30, 0.12]], 3600, 2, 2, 0.4, pExtra);
const extras = calcular([[30, 0.12]], 3600, 2, 2, 0.4, pExtra, { maoObraMin: 30, dificuldade: 2, pecasCompradas: 1.5 });
confere("30 min a R$ 20/h + dificuldade 2 + R$ 1,50", extras.custo_geral - base.custo_geral, 31.5);
confere("composição soma o custo geral", composicao(extras, pExtra, 2).filter(([, , s]) => !s)
  .slice(0, -1).reduce((s, [, v]) => s + v, 0), extras.custo_geral);
const semArred = calcular([[30, 0.12]], 3600, 2, 1, 0.4, { ...PARAMETROS_PADRAO, arredondar: false });
confere("sem arredondar: centavos", semArred.preco, Number(((semArred.custo_geral * 1.1) / 0.6).toFixed(2)));
let recusou = 0;
try { calcular([[1, null]], 60, 0, 1, 1, planilha); } catch { recusou = 1; }
confere("lucro de 100% é recusado", recusou, 1);

console.log("3) Temas: texto, links e botões legíveis (contraste mínimo 4,5) com qualquer cor");
const cores = [...Object.values(TEMAS), "#FFFFFF", "#000000", "#FEC600", "#F5E663", "#00FFFF", "#621DA6", "#1E7F5C", "#808080"];
let piores = { texto: 21, fraco: 21, link: 21, botao: 21 };
for (const cor of cores) for (const escuro of [true, false]) {
  const t = paleta(cor, escuro);
  piores = {
    texto: Math.min(piores.texto, contraste(t.texto, t.fundo), contraste(t.texto, t.painel)),
    fraco: Math.min(piores.fraco, contraste(t.fraco, t.fundo), contraste(t.fraco, t.painel)),
    link: Math.min(piores.link, contraste(t.link, t.fundo), contraste(t.link, t.painel)),
    botao: Math.min(piores.botao, contraste(t["primaria-texto"], t.primaria)),
  };
}
for (const [nome, valor] of Object.entries(piores))
  confere(`pior contraste de ${nome} em ${cores.length} cores x 2 modos (mínimo 4,5)`, valor >= 4.5 ? 1 : 0, 1);
console.log("   piores:", Object.fromEntries(Object.entries(piores).map(([k, v]) => [k, v.toFixed(2)])));
confere("tema roxo escuro mantém o roxo no botão", paleta(TEMAS.Roxo, true).primaria === TEMAS.Roxo ? 1 : 0, 1);
confere("amarelo vira botão com letra preta", paleta("#FEC600", false)["primaria-texto"] === "#000000" ? 1 : 0, 1);

console.log(`\n${falhas ? `${falhas} verificação(ões) falharam.` : "Tudo certo."}`);
process.exit(falhas ? 1 : 0);

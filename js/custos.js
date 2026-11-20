// Cálculo de custo e preço: a fórmula da aba "Custo" da planilha.
// J = material + energia + degradação; L = J + extras + embalagem; M = L × erro;
// O = arredonda((L + M) / (1 − lucro)); vendedor: O / (1 − %); marketplace: P e Q.

export const PARAMETROS_PADRAO = {
  tarifa_kwh: 0.9, potencia_kw: 0.35, degradacao_h: 1.0, perc_erro: 0.1, perc_lucro: 0.4,
  comissao_perc: 0.14, comissao_fixa: 4.0, modo_comissao: "liquido", comissao_vendedor: 0.1,
  arredondar: true, preco_kg_padrao: 120.0, alerta_estoque_g: 150.0, mao_de_obra_h: 0.0,
  dificuldade_1: 10.0, dificuldade_2: 20.0, dificuldade_3: 30.0, dificuldade_4: 40.0, dificuldade_5: 50.0,
};

export const energiaPorHora = (p) => p.tarifa_kwh * p.potencia_kw;
export const valorDificuldade = (p, nivel) => (nivel ? p[`dificuldade_${Number(nivel)}`] : 0);

// toFixed(9) evita que 36,000000001 (erro de ponto flutuante) vire 37
const paraCima = (v) => Math.ceil(Number(v.toFixed(9)));

/**
 * linhas: [[gramas, preço por grama do rolo ou null = preço padrão], ...]
 * maoObraMin, dificuldade e pecasCompradas são POR PEÇA. A saída é POR PEÇA.
 */
export function calcular(linhas, tempoS, custoEmbalagem, unidades, percLucro, p,
                         { maoObraMin = 0, dificuldade = 0, pecasCompradas = 0, marketplace = false, vendedor = false } = {}) {
  unidades = Math.max(parseInt(unidades) || 1, 1);
  const tempoH = (tempoS || 0) / 3600;
  const precoPadraoG = p.preco_kg_padrao / 1000;
  const materialTotal = linhas.reduce((s, [g, pg]) => s + g * (pg ?? precoPadraoG), 0);

  const material = materialTotal / unidades;
  const energia = (tempoH * energiaPorHora(p)) / unidades;
  const degradacao = (tempoH * p.degradacao_h) / unidades;
  const custo_producao = material + energia + degradacao;                       // J
  const mao_de_obra = ((maoObraMin || 0) / 60) * p.mao_de_obra_h;
  const acabamento = valorDificuldade(p, dificuldade);
  pecasCompradas = pecasCompradas || 0;
  const embalagem = custoEmbalagem || 0;                                        // K
  const custo_geral = custo_producao + mao_de_obra + acabamento + pecasCompradas + embalagem; // L
  const erro = custo_geral * p.perc_erro;                                       // M

  if (percLucro >= 1) throw new Error("A % de lucro precisa ser menor que 100%.");
  const arredondar = (v) => (p.arredondar ? paraCima(v) : Number(v.toFixed(2)));

  let preco = arredondar((custo_geral + erro) / (1 - percLucro));               // O
  let comissao_vendedor = 0;
  if (vendedor) {
    // quem vendeu fica com a % do que o cliente paga; o preço sobe para sobrar pelo menos O
    preco = arredondar(preco / (1 - p.comissao_vendedor));
    comissao_vendedor = preco * p.comissao_vendedor;
  }

  let comissao = 0, preco_market = preco;
  if (marketplace && p.modo_comissao === "liquido") {
    preco_market = (preco + p.comissao_fixa) / (1 - p.comissao_perc);         // vitrine que deixa O no bolso
    comissao = preco_market - preco;
  } else if (marketplace) {
    comissao = preco * p.comissao_perc + p.comissao_fixa;                       // P, como na planilha
    preco_market = preco + comissao;                                            // Q
  }

  return {
    unidades, peso_g: Number(linhas.reduce((s, [g]) => s + g, 0).toFixed(2)), tempo_h: tempoH,
    material, energia, degradacao, custo_producao, embalagem, custo_geral, erro, preco, comissao, preco_market,
    usou_preco_padrao: linhas.some(([, pg]) => pg == null),
    mao_de_obra, acabamento, pecas_compradas: pecasCompradas, comissao_vendedor,
  };
}

/** Linhas do custo, do material até a margem de erro: [rótulo, valor por peça, é subtotal]. */
export function composicao(r, p, dificuldade = 0) {
  const extras = [["Mão de obra", r.mao_de_obra], [`Acabamento (dificuldade ${dificuldade || 0})`, r.acabamento],
                  ["Peças compradas", r.pecas_compradas]].filter(([, v]) => v);
  return [
    ["Material", r.material, false],
    [`Energia (R$ ${num(energiaPorHora(p), 3)}/h)`, r.energia, false],
    [`Degradação (${brl(p.degradacao_h)}/h)`, r.degradacao, false],
    ["Custo de produção", r.custo_producao, true],
    ...extras.map(([rot, v]) => [rot, v, false]),
    ["Embalagem", r.embalagem, false],
    ["Custo geral", r.custo_geral, true],
    [`Margem de erro (${num(p.perc_erro * 100, 0)}%)`, r.erro, false],
  ];
}

// ---------------------------------------------------------------- formatação no padrão brasileiro
export const num = (v, casas = 2) =>
  v == null ? "-" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const brl = (v) => (v == null ? "-" : `R$ ${num(v)}`);
export function horas(segundos) {
  const s = Math.round(segundos || 0);
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}
export const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "-");

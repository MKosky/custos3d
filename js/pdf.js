// PDFs com a marca de quem usa (logo, cor e faixa de contatos no cabeçalho):
//   pdfCliente  -> um orçamento para o cliente, sem custos nem margem
//   pdfProposta -> vários orçamentos do mesmo cliente num PDF só
//   pdfInterno  -> só para você: composição do custo, comissões, rolos usados e observações internas
// jsPDF e o plugin autoTable vêm do index.html.
import { CAMPOS_MARCA, impressoes, quantidade } from "./banco.js";
import { brl, composicao, horas, num } from "./custos.js";
import { nomeDaCor } from "./cores.js";

const X0 = 18, X1 = 192;                // margens de 18 mm numa folha A4 de 210 mm
const CINZA = [100, 96, 110];

function cores(hex) {
  const cor = [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
  // cor clara (amarelo, rosa bebê) some no papel branco: texto em grafite e topo da tabela com letra preta
  const clara = 0.299 * cor[0] + 0.587 * cor[1] + 0.114 * cor[2] > 170;
  return { cor, texto: clara ? [45, 45, 50] : cor, cabecalho: clara ? [0, 0, 0] : [255, 255, 255],
           linha: cor.map((c) => Math.round(c + (255 - c) * 0.8)) };
}

/** Linhas da faixa de contatos: nome e documento, redes, cidade. O que está vazio não aparece. */
export function contatos(marca) {
  const m = Object.fromEntries(Object.keys(CAMPOS_MARCA).map((k) => [k, t(marca[k])]));
  if (m.instagram && !/^(@|http)/.test(m.instagram)) m.instagram = "@" + m.instagram;
  const redes = [["Instagram", "instagram"], ["WhatsApp", "whatsapp"], ["E-mail", "email"], ["Site", "site"]]
    .filter(([, c]) => m[c]).map(([r, c]) => `${r}: ${m[c]}`);
  return [[m.nome, m.documento].filter(Boolean).join("  ·  "), redes.join("  ·  "), m.local].filter(Boolean);
}

// A fonte do PDF (Helvetica) só desenha o alfabeto latino: chinês e emoji viravam lixo ("‡N[P_ S c o r p i o n").
// shortcut: esses caracteres somem do PDF; embutir uma fonte TTF com CJK resolve, ao custo de alguns MB por PDF
const LATINO = /[^\u0000-ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]+[_-]?/g;  // leva junto o "_" de "蝎子_Nome"
export const t = (s) => String(s ?? "").replace(LATINO, "").replace(/\s{2,}/g, " ").replace(/^[\s_\-·]+|[\s_\-·]+$/g, "");

const dias = (n) => `${n} ${Number(n) === 1 ? "dia" : "dias"}`;
const hoje = (somar = 0) => new Date(Date.now() + somar * 864e5).toLocaleDateString("pt-BR");
const bytes = (doc) => new Uint8Array(doc.output("arraybuffer"));

/** Folha nova com o cabeçalho da marca. paraCliente = mostra a faixa de contatos. Devolve [doc, cores, y]. */
function novo(marca, titulo, paraCliente = true) {
  const doc = new jspdf.jsPDF({ format: "a4", unit: "mm" });
  const c = cores(marca.cor || "#621DA6");
  let faixa = paraCliente ? contatos(marca) : [];
  const nomeEmNegrito = !!(marca.logo && marca.nome);
  if (marca.logo) {
    const { width, height } = doc.getImageProperties(marca.logo);
    const h = Math.min(20, (80 * height) / width);   // cabe em 80 x 20 mm, alinhada à esquerda
    doc.addImage(marca.logo, "PNG", X0, 12 + (20 - h) / 2, (h * width) / height, h);
  } else if (marca.nome) {                            // sem logo, o nome ocupa o lugar dela e sai da faixa
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...c.texto).text(t(marca.nome), X0, 22);
    if (faixa.length) faixa = [t(marca.documento), ...faixa.slice(1)].filter(Boolean);
  }
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...c.texto).text(titulo, X1, 21, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...CINZA).text(hoje(), X1, 27, { align: "right" });
  doc.setDrawColor(...c.cor).setLineWidth(0.6).line(X0, 36, X1, 36);
  let y = 41.5;
  faixa.forEach((linha, i) => {
    doc.setFont("helvetica", i === 0 && nomeEmNegrito ? "bold" : "normal").setFontSize(9).setTextColor(...CINZA);
    for (const parte of doc.splitTextToSize(linha, X1 - X0)) { doc.text(parte, X0, y); y += 4.5; }
  });
  return [doc, c, y + 6];
}

function secao(doc, titulo, y, c) {
  if (y > 250) { doc.addPage(); y = X0; }
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...c.texto).text(titulo, X0, y + 6);
  return y + 11;
}

function texto(doc, txt, y) {
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0, 0, 0);
  for (const parte of doc.splitTextToSize(t(txt), X1 - X0)) {
    if (y > 280) { doc.addPage(); y = X0; }
    doc.text(parte, X0, y); y += 5;
  }
  return y;
}

/** Tabela no padrão da marca. alinhar: "l" | "c" | "r" por coluna. Devolve o y depois dela. */
function tabela(doc, y, c, cabecalho, linhas, { alinhar = [], larguras = {}, negrito = new Set(), didParseCell, ...extra } = {}) {
  const halign = (i) => ({ c: "center", r: "right" }[alinhar[i]] || "left");
  doc.autoTable({
    startY: y, margin: { left: X0, right: 210 - X1 }, theme: "plain", head: [cabecalho], body: linhas.map((l) => l.map(t)),
    styles: { font: "helvetica", fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
              lineColor: c.linha, lineWidth: { bottom: 0.2 }, valign: "middle" },
    headStyles: { fillColor: c.cor, textColor: c.cabecalho, fontStyle: "bold" },
    columnStyles: Object.fromEntries(cabecalho.map((_, i) => [i, { halign: halign(i), ...(larguras[i] ? { cellWidth: larguras[i] } : {}) }])),
    didParseCell: (d) => {
      d.cell.styles.halign = halign(d.column.index);
      if (d.section === "body" && negrito.has(d.row.index)) d.cell.styles.fontStyle = "bold";
      didParseCell?.(d);
    },
    ...extra,
  });
  return doc.lastAutoTable.finalY + 2;
}

/** Foto à esquerda (quadrado de 50 mm, alinhada ao topo); nome e detalhes à direita. */
function produto(doc, y, orc, detalhes) {
  let x = X0, alturaFoto = 0;
  if (orc.capa) {
    const { width, height } = doc.getImageProperties(orc.capa);
    const [w, h] = width >= height ? [50, (50 * height) / width] : [(50 * width) / height, 50];
    doc.addImage(orc.capa, "PNG", X0, y, w, h);
    x = X0 + 56; alturaFoto = h;
  }
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(0, 0, 0);
  const nome = doc.splitTextToSize(t(orc.nome), X1 - x);
  doc.text(nome, x, y + 5.5);
  let yTexto = y + 5.5 + nome.length * 7;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...CINZA);
  for (const d of detalhes) for (const parte of doc.splitTextToSize(t(d), X1 - x)) { doc.text(parte, x, yTexto); yTexto += 5; }
  return Math.max(yTexto, y + alturaFoto) + 8;
}

const linhaCliente = (d) => {
  const partes = [d.cliente, d.cliente_contato].filter(Boolean);
  return partes.length ? `Cliente: ${partes.join("  ·  ")}` : "";
};

function condicoes(d) {
  const itens = [];
  if (d.prazo_dias) itens.push(["Prazo de entrega", dias(d.prazo_dias)]);
  if (d.validade_dias) itens.push(["Validade", `${dias(d.validade_dias)}, até ${hoje(d.validade_dias)}`]);
  return itens;
}

/** Total, condições e observações para o cliente: igual no orçamento e na proposta. */
function fechamento(doc, y, c, total, d) {
  y += 7;
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...c.texto).text(`Total: ${brl(total)}`, X1, y, { align: "right" });
  y += 5;
  const itens = condicoes(d);
  if (itens.length) {
    y = secao(doc, "Condições", y, c);
    for (const [rotulo, valor] of itens) {
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 0, 0).text(`${rotulo}:`, X0, y);
      const largura = doc.getTextWidth(`${rotulo}: `);  // medida ainda em negrito
      doc.setFont("helvetica", "normal").text(valor, X0 + largura, y);
      y += 6;
    }
  }
  if (d.obs_cliente) y = texto(doc, d.obs_cliente, secao(doc, "Observações", y, c));
  return y;
}

/** orc: orçamento do banco (ou um de exemplo); r: resultado do cálculo. Devolve os bytes do PDF. */
export function pdfCliente(orc, r, marca) {
  let [doc, c, y] = novo(marca, `Orçamento #${orc.id}`);
  y = produto(doc, y, orc, [linhaCliente(orc)].filter(Boolean));
  const qtd = quantidade(orc), total = r.preco * qtd;
  y = tabela(doc, y, c, ["Descrição", "Qtd.", "Preço unitário", "Total"],
             [[orc.nome || "", String(qtd), brl(r.preco), brl(total)]], { alinhar: ["l", "c", "r", "r"], larguras: { 0: 90 } });
  fechamento(doc, y, c, total, orc);
  return bytes(doc);
}

/** itens: [[orçamento, resultado], ...] na ordem da proposta. Uma linha por item, com miniatura. */
export function pdfProposta(prop, itens, marca) {
  let [doc, c, y] = novo(marca, `Proposta #${prop.id}`);
  const cliente = linhaCliente(prop);
  if (cliente) {
    doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...CINZA).text(t(cliente), X0, y);
    y += 6;
  }
  const fotos = itens.map(([o]) => o.capa);
  y = tabela(doc, y, c, ["Foto", "Descrição", "Qtd.", "Preço unitário", "Total"],
    itens.map(([o, r]) => ["", o.nome || "", String(quantidade(o)), brl(r.preco), brl(r.preco * quantidade(o))]),
    { alinhar: ["c", "l", "c", "r", "r"], larguras: { 0: 24, 1: 70 },
      didParseCell: (d) => { if (d.section === "body") d.cell.styles.minCellHeight = 20; },
      didDrawCell: (d) => {
        const foto = d.section === "body" && d.column.index === 0 && fotos[d.row.index];
        if (!foto) return;
        const { width, height } = doc.getImageProperties(foto), lado = 18;
        const [w, h] = width >= height ? [lado, (lado * height) / width] : [(lado * width) / height, lado];
        doc.addImage(foto, "PNG", d.cell.x + (d.cell.width - w) / 2, d.cell.y + (d.cell.height - h) / 2, w, h);
      } });
  fechamento(doc, y, c, itens.reduce((s, [o, r]) => s + r.preco * quantidade(o), 0), prop);
  return bytes(doc);
}

/** Tudo da tela do orçamento, para você. filamentos: [[placa, cor hex, tipo, gramas, rolo], ...] das placas incluídas. */
export function pdfInterno(orc, r, p, filamentos, embalagem, situacao, marca) {
  let [doc, c, y] = novo(marca, `Orçamento interno #${orc.id}`, false);
  const origem = [["Modelo", orc.titulo_original], ["Designer", orc.designer], ["Licença", orc.licenca]]
    .filter(([, v]) => v).map(([rot, v]) => `${rot}: ${v}`);
  y = produto(doc, y, orc, [situacao, linhaCliente(orc), `Arquivo: ${orc.arquivo || "-"}`, ...origem].filter(Boolean));

  const qtd = quantidade(orc), lucro = orc.perc_lucro ?? p.perc_lucro;
  const pedido = qtd !== r.unidades ? [["Quantidade do pedido", String(qtd)], ["Impressões", String(impressoes(orc))]] : [];
  y = secao(doc, "Resumo", y, c);
  y = tabela(doc, y, c, ["Item", "Valor"], [
    ["Peças por impressão", String(r.unidades)], ...pedido,
    ["Peso por impressão", `${num(r.peso_g)} g`], ["Tempo de impressão", horas(r.tempo_h * 3600)],
    ["Embalagem", embalagem], ["% de lucro", `${num(lucro * 100, 0)}%`], ...condicoes(orc),
  ], { alinhar: ["l", "r"], larguras: { 0: 120 } });

  const itens = composicao(r, p, orc.dificuldade).map(([rot, v, sub]) => [rot, v, sub]);
  if (r.comissao_vendedor) itens.push([`Comissão do vendedor (${num(p.comissao_vendedor * 100, 0)}%)`, r.comissao_vendedor, false]);
  itens.push(["Preço de venda", r.preco, true]);
  if (orc.marketplace) {
    const modo = p.modo_comissao === "liquido" ? "preservando o líquido" : "como na planilha";
    itens.push([`Comissão do marketplace (${modo})`, r.comissao, false], ["Preço no marketplace", r.preco_market, true]);
  }
  if (qtd > 1) itens.push([`Pedido de ${qtd} peças: custo`, r.custo_geral * qtd, false], [`Pedido de ${qtd} peças: venda`, r.preco * qtd, false]);
  y = secao(doc, "Custo e preço", y, c);
  y = tabela(doc, y, c, ["Item", r.unidades > 1 || qtd > 1 ? "Por peça" : "Valor"], itens.map(([rot, v]) => [rot, brl(v)]),
             { alinhar: ["l", "r"], larguras: { 0: 120 }, negrito: new Set(itens.flatMap(([, , b], i) => (b ? [i] : []))) });

  if (filamentos.length) {
    y = secao(doc, "Filamentos", y, c);
    y = tabela(doc, y, c, ["Placa", "Cor", "Tipo", "Gramas", "Rolo"],
               filamentos.map(([placa, cor, tipo, g, rolo]) => [String(placa), `${nomeDaCor(cor)} ${cor}`, tipo, num(g), rolo]),
               { alinhar: ["c", "l", "l", "r", "l"], larguras: { 0: 14, 1: 40, 2: 18, 3: 22 } });
  }
  if (orc.obs) y = texto(doc, orc.obs, secao(doc, "Observações internas", y, c));
  if (orc.obs_cliente) texto(doc, orc.obs_cliente, secao(doc, "Observações para o cliente", y, c));
  return bytes(doc);
}

/** Orçamento fictício, para ver a marca antes de mandar um de verdade. */
export const pdfExemplo = (marca) => pdfCliente(
  { id: 1, nome: "Peça de exemplo", qtd_pedido: 2, cliente: "Cliente de exemplo", cliente_contato: "(11) 90000-0000",
    prazo_dias: 7, validade_dias: 15, obs_cliente: "Cores e acabamento conforme combinado." },
  { preco: 49.9 }, marca);

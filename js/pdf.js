// PDF do orçamento para o cliente , com a marca de quem usa:
// logo, cor e a faixa de contatos no cabeçalho. jsPDF e o plugin autoTable vêm do index.html.
import { CAMPOS_MARCA, quantidade } from "./banco.js";
import { brl } from "./custos.js";

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
  const m = Object.fromEntries(Object.keys(CAMPOS_MARCA).map((k) => [k, String(marca[k] || "").trim()]));
  if (m.instagram && !/^(@|http)/.test(m.instagram)) m.instagram = "@" + m.instagram;
  const redes = [["Instagram", "instagram"], ["WhatsApp", "whatsapp"], ["E-mail", "email"], ["Site", "site"]]
    .filter(([, c]) => m[c]).map(([r, c]) => `${r}: ${m[c]}`);
  return [[m.nome, m.documento].filter(Boolean).join("  ·  "), redes.join("  ·  "), m.local].filter(Boolean);
}

const dias = (n) => `${n} ${Number(n) === 1 ? "dia" : "dias"}`;
const hoje = (somar = 0) => new Date(Date.now() + somar * 864e5).toLocaleDateString("pt-BR");

function cabecalho(doc, marca, titulo, c) {
  let faixa = contatos(marca);
  const nomeEmNegrito = !!(marca.logo && marca.nome);
  if (marca.logo) {
    const { width, height } = doc.getImageProperties(marca.logo);
    const h = Math.min(20, (80 * height) / width);   // cabe em 80 x 20 mm, alinhada à esquerda
    doc.addImage(marca.logo, "PNG", X0, 12 + (20 - h) / 2, (h * width) / height, h);
  } else if (marca.nome) {                            // sem logo, o nome ocupa o lugar dela e sai da faixa
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...c.texto).text(marca.nome, X0, 22);
    faixa = [String(marca.documento || "").trim(), ...faixa.slice(1)].filter(Boolean);
  }
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...c.texto).text(titulo, X1, 21, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...CINZA).text(hoje(), X1, 27, { align: "right" });
  doc.setDrawColor(...c.cor).setLineWidth(0.6).line(X0, 36, X1, 36);
  let y = 41.5;
  faixa.forEach((linha, i) => {
    doc.setFont("helvetica", i === 0 && nomeEmNegrito ? "bold" : "normal").setFontSize(9).setTextColor(...CINZA);
    for (const parte of doc.splitTextToSize(linha, X1 - X0)) { doc.text(parte, X0, y); y += 4.5; }
  });
  return y + 6;
}

function secao(doc, titulo, y, c) {
  if (y > 250) { doc.addPage(); y = X0; }
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...c.texto).text(titulo, X0, y + 6);
  return y + 11;
}

/** orc: orçamento do banco (ou um de exemplo); r: resultado do cálculo. Devolve os bytes do PDF. */
export function pdfCliente(orc, r, marca) {
  const doc = new jspdf.jsPDF({ format: "a4", unit: "mm" });
  const c = cores(marca.cor || "#621DA6");
  let y = cabecalho(doc, marca, `Orçamento #${orc.id}`, c);

  // Foto à esquerda (quadrado de 50 mm, alinhada ao topo); nome e cliente à direita
  let x = X0, alturaFoto = 0;
  if (orc.capa) {
    const { width, height } = doc.getImageProperties(orc.capa);
    const [w, h] = width >= height ? [50, (50 * height) / width] : [(50 * width) / height, 50];
    doc.addImage(orc.capa, "PNG", X0, y, w, h);
    x = X0 + 56; alturaFoto = h;
  }
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(0, 0, 0);
  const nome = doc.splitTextToSize(orc.nome || "", X1 - x);
  doc.text(nome, x, y + 5.5);
  let yTexto = y + 5.5 + nome.length * 7;
  const cliente = [orc.cliente, orc.cliente_contato].filter(Boolean).join("  ·  ");
  if (cliente) {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...CINZA).text(`Cliente: ${cliente}`, x, yTexto);
    yTexto += 5;
  }
  y = Math.max(yTexto, y + alturaFoto) + 8;

  const qtd = quantidade(orc), total = r.preco * qtd;
  doc.autoTable({
    startY: y, margin: { left: X0, right: 210 - X1 }, theme: "plain",
    head: [["Descrição", "Qtd.", "Preço unitário", "Total"]],
    body: [[orc.nome || "", String(qtd), brl(r.preco), brl(total)]],
    styles: { font: "helvetica", fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
              lineColor: c.linha, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: c.cor, textColor: c.cabecalho, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 90 }, 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
    didParseCell: (d) => { if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = d.column.index === 1 ? "center" : "right"; },
  });
  y = doc.lastAutoTable.finalY + 9;
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...c.texto).text(`Total: ${brl(total)}`, X1, y, { align: "right" });
  y += 5;

  const condicoes = [];
  if (orc.prazo_dias) condicoes.push(["Prazo de entrega", dias(orc.prazo_dias)]);
  if (orc.validade_dias) condicoes.push(["Validade", `${dias(orc.validade_dias)}, até ${hoje(orc.validade_dias)}`]);
  if (condicoes.length) {
    y = secao(doc, "Condições", y, c);
    for (const [rotulo, valor] of condicoes) {
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 0, 0).text(`${rotulo}:`, X0, y);
      const largura = doc.getTextWidth(`${rotulo}: `);  // medida ainda em negrito
      doc.setFont("helvetica", "normal").text(valor, X0 + largura, y);
      y += 6;
    }
  }
  if (orc.obs_cliente) {
    y = secao(doc, "Observações", y, c);
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0, 0, 0);
    for (const parte of doc.splitTextToSize(orc.obs_cliente, X1 - X0)) {
      if (y > 280) { doc.addPage(); y = X0; }
      doc.text(parte, X0, y); y += 5;
    }
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

/** Orçamento fictício, para ver a marca antes de mandar um de verdade. */
export const pdfExemplo = (marca) => pdfCliente(
  { id: 1, nome: "Peça de exemplo", qtd_pedido: 2, cliente: "Cliente de exemplo", cliente_contato: "(11) 90000-0000",
    prazo_dias: 7, validade_dias: 15, obs_cliente: "Cores e acabamento conforme combinado." },
  { preco: 49.9 }, marca);

// Telas da Minha Calculadora 3D. Rotas por hash: #/ (início), #/orcamentos, #/orcamento/ID, #/propostas, #/vendas,
// #/filamentos, #/parametros, #/marca, #/backup. Cada tela monta o HTML e liga os eventos; os dados vão direto para o banco (banco.js).
import * as banco from "./banco.js";
import { brl, composicao, dataBR, horas, num, valorDificuldade } from "./custos.js";
import { nomeDaCor } from "./cores.js";
import { ArquivoNaoFatiado, ler3mf, sha1 } from "./leitor3mf.js";
import { pdfCliente, pdfExemplo, pdfInterno, pdfProposta } from "./pdf.js";
import { TEMAS, aplicarTema } from "./tema.js";

const $ = (s, el = document) => el.querySelector(s);
const pagina = $("#pagina");
// Todo valor vindo do banco ou de arquivo passa por h() antes de entrar no HTML: um .db importado pode trazer qualquer coisa
const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const corSegura = (c) => (banco.ehHex(c) ? c : "#808080");  // cor em style=: só hex
const CANAIS = ["Direto", "Instagram", "WhatsApp", "Shopee", "Mercado Livre", "Feira", "Outro"];
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const hojeIso = () => { const d = new Date(); return `${mesAtual()}-${String(d.getDate()).padStart(2, "0")}`; };

// shortcut: as URLs das imagens não são liberadas (URL.revokeObjectURL); pesa só com centenas de orçamentos numa visita
const urlDe = (bytes, tipo = "image/png") => (bytes ? URL.createObjectURL(new Blob([bytes], { type: tipo })) : "");
function baixar(bytes, nome, tipo) {
  const a = Object.assign(document.createElement("a"), { href: urlDe(bytes, tipo), download: nome });
  a.click();
}
const nomeArquivo = (t) => t.replace(/[\\/:*?"<>|]/g, "").trim();

function avisar(texto, erro = false) {
  const div = Object.assign(document.createElement("div"), { textContent: texto, className: erro ? "erro" : "" });
  $("#aviso").append(div);
  setTimeout(() => div.remove(), erro ? 8000 : 3500);
}

/** Lê um campo do formulário conforme data-tipo: texto, int, num, pct (mostrado ×100), bool. */
function valorDo(el) {
  if (el.type === "checkbox") return el.checked ? 1 : 0;
  const v = el.value.trim().replace(",", ".");
  switch (el.dataset.tipo) {
    case "int": return v === "" ? null : Math.max(parseInt(v) || 0, 0);
    case "num": return v === "" ? 0 : Math.max(parseFloat(v) || 0, 0);
    case "pct": return Math.min(Math.max(parseFloat(v) || 0, 0), 95) / 100;
    case "id": return v === "" ? null : Number(v);
    default: return el.value;
  }
}

// ================================================================= orçamentos
function telaOrcamentos() {
  const p = banco.lerParametros(), rolos = banco.listarRolos();
  const orcs = banco.listarOrcamentos();
  const STATUS = { orcamento: "Em aberto", impresso: "Impresso", cancelado: "Cancelado" };
  pagina.innerHTML = `
    <h1>Orçamentos</h1>
    ${lembreteExportar()}
    <p class="fraco">Aceita <strong>somente arquivos <code>.gcode.3mf</code></strong> (o arquivo de placa fatiada que o seu fatiador exporta). Cada arquivo vira um orçamento.</p>
    <label class="soltar" id="soltar" tabindex="0" role="button" aria-label="Escolher arquivos .gcode.3mf para importar">
      <strong>Arraste os .gcode.3mf aqui</strong> ou clique para escolher
      <input type="file" accept=".3mf" multiple hidden />
    </label>
    <div id="pasta"></div>
    ${orcs.length ? `<div class="rolagem"><table>
      <thead><tr><th></th><th>#</th><th>Produto</th><th>Cliente</th><th>Criado</th><th class="n">Preço/peça</th><th></th></tr></thead>
      <tbody>${orcs.map((o) => {
        let preco = "-";
        try { preco = brl(banco.resultadoAtual(banco.carregarOrcamento(o.id), p, rolos)[0].preco); } catch { /* lucro inválido */ }
        return `<tr class="clicavel" data-id="${h(o.id)}">
          <td>${o.capa ? `<img class="mini" src="${urlDe(o.capa)}" alt="" />` : ""}</td><td>${h(o.id)}</td>
          <td><a href="#/orcamento/${h(o.id)}">${h(o.nome) || "(sem nome)"}</a></td><td>${h(o.cliente)}</td>
          <td>${h(dataBR(o.criado_em))}</td><td class="n">${preco}</td>
          <td><span class="etiqueta">${STATUS[o.status] || h(o.status)}${o.pdf_em ? " · PDF" : ""}${o.venda === 1 ? " · Vendido" : ""}</span></td></tr>`;
      }).join("")}</tbody></table></div>`
      : `<p class="painel">Nenhum orçamento ainda. Comece cadastrando seus rolos em <a href="#/filamentos">Filamentos</a>
         (sem rolo, o material usa o preço padrão de ${brl(p.preco_kg_padrao)}/kg) e arraste um arquivo aqui em cima.</p>`}`;

  const soltar = $("#soltar"), input = $("input", soltar);
  input.onchange = () => importar([...input.files]);
  soltar.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
  soltar.ondragover = (e) => { e.preventDefault(); soltar.classList.add("sobre"); };
  soltar.ondragleave = () => soltar.classList.remove("sobre");
  soltar.ondrop = (e) => { e.preventDefault(); soltar.classList.remove("sobre"); importar([...e.dataTransfer.files]); };
  pagina.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = `#/orcamento/${tr.dataset.id}`)));
  secaoPasta($("#pasta"));
}

/** Um arquivo vira orçamento. Devolve o id e se é novo; erro de leitura sobe para quem chamou. */
async function importarUm(f) {
  const arq = await ler3mf(f);
  const existente = banco.orcamentoDoArquivo(arq.hash);
  if (existente) { avisar(`${f.name} já foi importado no orçamento #${existente}.`); return existente; }
  const id = banco.criarOrcamento(arq);
  const peso = arq.placas.reduce((s, p) => s + p.peso_g, 0), tempo = arq.placas.reduce((s, p) => s + p.tempo_s, 0);
  avisar(`${f.name}: orçamento #${id}, ${arq.placas.length} placa(s), ${num(peso)} g e ${horas(tempo)}.`);
  return id;
}

/** Vários arquivos; aoFalhar(f, erro) recebe os que não são arquivo fatiado. */
async function importar(arquivos, aoFalhar = () => {}) {
  let ultimo = null;
  const validos = arquivos.filter((f) => f.name.toLowerCase().endsWith(".3mf"));
  for (const f of validos) {
    try {
      ultimo = await importarUm(f);
    } catch (erro) {
      if (erro instanceof ArquivoNaoFatiado) await aoFalhar(f, erro);
      avisar(erro instanceof ArquivoNaoFatiado ? erro.message : `${f.name}: ${erro.message}`, true);
    }
  }
  if (ultimo && validos.length === 1) location.hash = `#/orcamento/${ultimo}`;
  else if ($("#soltar")) telaOrcamentos();  // só se a pessoa ainda está na lista (pode ter ido para outra tela)
}

// ----------------------------------------------------------------- lembrete de exportar
const DIAS_LEMBRETE = 14;
function lembreteExportar() {
  if (!banco.temOrcamentos()) return "";
  const ultima = banco.ultimaExportacao();
  const dias = ultima ? Math.floor((Date.now() - new Date(ultima)) / 864e5) : null;
  if (dias !== null && dias < DIAS_LEMBRETE) return "";
  return `<p class="alerta">Seus orçamentos ficam só neste navegador. ${dias === null ? "Você ainda não exportou seus dados"
    : `A última exportação foi há ${dias} dias`}: exporte para não perder nada se trocar de navegador ou limpar o histórico.
    <a class="botao" href="#/backup" style="margin-left:8px">Exportar agora</a></p>`;
}

// ----------------------------------------------------------------- pasta do computador (File System Access API)
// Chrome e Edge no computador deixam o site ler uma pasta escolhida pela pessoa; a escolha fica guardada no
// navegador. Os outros navegadores (Firefox, Safari, celular) não têm isso: lá fica só o arrastar.
const LE_PASTA = "showDirectoryPicker" in window;

async function escolherPasta(el) {
  try {
    const pasta = await showDirectoryPicker({ id: "custos3d", mode: "read" });
    await banco.guardarNoNavegador("pasta", pasta);
    await listarPasta(el, pasta);
  } catch (erro) {
    if (erro.name !== "AbortError") avisar(`Não consegui abrir a pasta: ${erro.message}`, true);  // AbortError = cancelou
  }
}

async function secaoPasta(el) {
  if (!LE_PASTA) {
    el.innerHTML = `<p class="ajuda">No Chrome ou no Edge do computador dá para escolher uma pasta e o app lê os arquivos dela sozinho.</p>`;
    return;
  }
  const pasta = await banco.lerDoNavegador("pasta");
  if (!el.isConnected) return;  // a pessoa já mudou de tela
  if (!pasta) {
    el.innerHTML = `<div class="painel"><strong>Pasta dos arquivos fatiados</strong>
      <p class="ajuda">Escolha a pasta onde você salva os .gcode.3mf: toda vez que abrir esta tela, o app mostra o que tem de novo nela.</p>
      <div class="acoes"><button id="pasta-escolher">Escolher pasta</button></div></div>`;
    $("#pasta-escolher", el).onclick = () => escolherPasta(el);
    return;
  }
  if ((await pasta.queryPermission({ mode: "read" })) === "granted") return listarPasta(el, pasta);
  // O navegador pede a permissão de novo a cada visita (a não ser que a pessoa marque "permitir sempre")
  el.innerHTML = `<div class="painel"><strong>Pasta: ${h(pasta.name)}</strong>
    <p class="ajuda">O navegador pede para você liberar a leitura da pasta de novo.</p>
    <div class="acoes"><button class="primario" id="pasta-ler">Ler a pasta ${h(pasta.name)}</button>
    <button id="pasta-escolher">Trocar pasta</button></div></div>`;
  $("#pasta-ler", el).onclick = async () => {
    try { if ((await pasta.requestPermission({ mode: "read" })) === "granted") return listarPasta(el, pasta); } catch { /* abaixo */ }
    avisar("O navegador não liberou a leitura da pasta. Tente de novo ou use Trocar pasta.", true);
  };
  $("#pasta-escolher", el).onclick = () => escolherPasta(el);
}

async function listarPasta(el, pasta) {
  const tinhaFoco = el.contains(document.activeElement);  // a pessoa clicou aqui: devolve o foco e anuncia o resultado
  el.innerHTML = `<div class="painel">Lendo a pasta <strong>${h(pasta.name)}</strong>…</div>`;
  // Cache nome|tamanho|data → SHA-1, para não reler arquivos grandes a cada visita
  const cache = (await banco.lerDoNavegador("hashes_pasta")) || {};
  const naoFatiados = new Set((await banco.lerDoNavegador("nao_fatiados")) || []);
  const itens = [], vistos = {};
  try {
    for await (const entrada of pasta.values()) {
      if (entrada.kind !== "file" || !entrada.name.toLowerCase().endsWith(".3mf")) continue;
      try {
        const file = await entrada.getFile(), chave = `${file.name}|${file.size}|${file.lastModified}`;
        const hash = vistos[chave] = cache[chave] || (await sha1(new Uint8Array(await file.arrayBuffer())));
        itens.push({ file, hash, orc: banco.orcamentoDoArquivo(hash), ignorado: naoFatiados.has(hash) });
      } catch {
        // Arquivo ainda sendo gravado pelo fatiador, bloqueado ou só na nuvem: aparece, mas não derruba a lista
        itens.push({ file: { name: entrada.name, lastModified: 0 }, ilegivel: true });
      }
    }
  } catch (erro) {
    el.innerHTML = `<div class="painel"><p class="alerta">Não consegui ler a pasta ${h(pasta.name)} (${h(erro.message)}). Ela foi movida ou apagada?</p>
      <div class="acoes"><button id="pasta-atualizar">Tentar de novo</button><button id="pasta-escolher">Escolher outra pasta</button></div></div>`;
    $("#pasta-atualizar", el).onclick = () => listarPasta(el, pasta);
    $("#pasta-escolher", el).onclick = () => escolherPasta(el);
    if (tinhaFoco) $("#pasta-atualizar", el).focus();
    return;
  }
  banco.guardarNoNavegador("hashes_pasta", vistos);  // só os arquivos que ainda estão na pasta
  if (!el.isConnected) return;
  itens.sort((a, b) => b.file.lastModified - a.file.lastModified);
  const novos = itens.filter((i) => !i.orc && !i.ignorado && !i.ilegivel);
  el.innerHTML = `<div class="painel">
    <strong>Pasta: ${h(pasta.name)}</strong>
    <span class="fraco"> · ${itens.length} arquivo(s), ${novos.length ? `<strong style="color:var(--texto)">${novos.length} novo(s)</strong>` : "nenhum novo"}</span>
    ${itens.length ? `<div class="rolagem" style="max-height:320px;overflow-y:auto;margin-top:8px"><table>
      <thead><tr><th>Arquivo</th><th>Modificado</th><th>Situação</th></tr></thead>
      <tbody>${itens.map((i) => `<tr><td>${h(i.file.name)}</td>
        <td>${i.file.lastModified ? new Date(i.file.lastModified).toLocaleDateString("pt-BR") : "-"}</td>
        <td>${i.ilegivel ? `<span class="fraco">Não deu para ler agora (aberto em outro programa?)</span>`
          : i.orc ? `<a href="#/orcamento/${h(i.orc)}">Orçamento #${h(i.orc)}</a>` : i.ignorado ? `<span class="fraco">Não é arquivo fatiado</span>`
          : `<span class="etiqueta">Novo</span>`}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="ajuda">Nenhum .3mf nesta pasta ainda.</p>`}
    <div class="acoes">
      ${novos.length ? `<button class="primario" id="pasta-importar">Importar ${novos.length} novo(s)</button>` : ""}
      <button id="pasta-atualizar">Atualizar</button><button id="pasta-escolher">Trocar pasta</button>
    </div></div>`;
  $("#pasta-atualizar", el).onclick = () => listarPasta(el, pasta);
  $("#pasta-escolher", el).onclick = () => escolherPasta(el);
  if (tinhaFoco) {
    $("#pasta-atualizar", el).focus();
    avisar(`Pasta lida: ${itens.length} arquivo(s), ${novos.length} novo(s).`);
  }
  const botao = $("#pasta-importar", el);
  if (botao) botao.onclick = async () => {
    botao.disabled = true;
    const hashDe = new Map(novos.map((i) => [i.file, i.hash]));
    // gravado antes de importar() redesenhar a tela, para a lista nova já mostrar "Não é arquivo fatiado"
    await importar(novos.map((i) => i.file), async (f) => {
      naoFatiados.add(hashDe.get(f));
      await banco.guardarNoNavegador("nao_fatiados", [...naoFatiados]);
    });
    if (el.isConnected) listarPasta(el, pasta);
  };
}

/** Aviso quando 'Peças por impressão' não bate com os objetos da placa . */
function avisoUnidades(orc) {
  const nomes = orc.placas.filter((pl) => pl.incluir).flatMap((pl) => JSON.parse(pl.objetos || "[]"));
  const un = orc.unidades || 1;
  if (!nomes.length) return "";
  if (un > nomes.length)
    return `O arquivo tem só ${nomes.length} objeto(s) e você colocou ${un} peças por impressão: o custo de ${nomes.length} ` +
      `está sendo dividido por ${un}. Para fazer várias impressões, use "Quantidade do pedido".`;
  const copias = Math.max(...Object.values(nomes.reduce((c, n) => ((c[n] = (c[n] || 0) + 1), c), {})));
  return un < copias ? `A placa tem ${copias} cópias do mesmo objeto, mas "Peças por impressão" está em ${un}: ` +
    `o preço é da placa inteira como se fosse ${un} peça(s). Coloque ${copias}.` : "";
}

function telaOrcamento(id) {
  let orc = banco.carregarOrcamento(id);
  if (!orc) { pagina.innerHTML = `<p>Orçamento #${h(id)} não existe. <a href="#/">Voltar</a></p>`; return; }
  const p = banco.lerParametros(), rolos = banco.listarRolos(), embalagens = banco.listarEmbalagens();
  const travado = orc.status === "impresso", dis = travado ? "disabled" : "";
  const rotulos = Object.fromEntries(rolos.map((r) => [r.id, banco.rotuloRolo(r)]));
  const opcoesRolo = (atual) => `<option value="">Preço padrão (${brl(p.preco_kg_padrao)}/kg)</option>` +
    rolos.filter((r) => r.ativo || r.id === atual)
      .map((r) => `<option value="${h(r.id)}" ${r.id === atual ? "selected" : ""}>${h(rotulos[r.id])} · ${num(r.saldo_g, 0)} g</option>`).join("");
  const campo = (rotulo, nome, tipo, valor, extra = "", ajuda = "") => `<label>${rotulo}
      <input data-campo="${nome}" data-tipo="${tipo}" ${tipo === "texto" ? "" : 'type="number" step="any" min="0"'}
             value="${h(valor ?? "")}" ${extra} ${dis} />${ajuda ? `<span class="ajuda">${ajuda}</span>` : ""}</label>`;
  const origem = [orc.titulo_original, orc.designer && `Designer: ${orc.designer}`, orc.licenca && `Licença: ${orc.licenca}`,
                  orc.arquivo && `Arquivo: ${orc.arquivo}`].filter(Boolean);

  pagina.innerHTML = `
    <p><a href="#/orcamentos">← Orçamentos</a></p>
    <h1>#${h(orc.id)} ${h(orc.nome)}</h1>
    ${travado ? `<p class="alerta">Impresso em ${h(dataBR(orc.impresso_em))}: os valores estão congelados. Para mudar, use Desfazer impressão em Estoque.</p>` : ""}
    <div class="editor">
      <div>${orc.capa ? `<img class="capa" src="${urlDe(orc.capa)}" alt="Foto do modelo" />` : ""}
           <p class="ajuda">${origem.map(h).join("<br>")}</p></div>
      <div>
        <div class="grade">
          ${campo("Nome do produto", "nome", "texto", orc.nome)}
          ${campo("Cliente", "cliente", "texto", orc.cliente, 'placeholder="Nome de quem pediu"')}
          ${campo("Contato do cliente", "cliente_contato", "texto", orc.cliente_contato, 'placeholder="WhatsApp, Instagram..."')}
          <label>Embalagem<select data-campo="embalagem_id" data-tipo="id" ${dis}>
            <option value="">Sem embalagem</option>
            ${embalagens.map((e) => `<option value="${h(e.id)}" ${e.id === orc.embalagem_id ? "selected" : ""}>${h(e.nome)} (${brl(e.custo)})</option>`).join("")}
          </select></label>
          ${campo("Peças por impressão", "unidades", "int", orc.unidades, 'min="1" step="1"', "Peças iguais na placa: o custo é dividido por elas.")}
          ${campo("% de lucro", "perc_lucro", "pct", Math.round((orc.perc_lucro ?? p.perc_lucro) * 100), 'max="95"', "Margem sobre o preço final.")}
          ${campo("Mão de obra (min/peça)", "mao_obra_min", "num", orc.mao_obra_min || 0, "", `Vale ${brl(p.mao_de_obra_h)}/hora (Parâmetros).`)}
          <label>Acabamento (dificuldade)<select data-campo="dificuldade" data-tipo="int" ${dis}>
            ${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === (orc.dificuldade || 0) ? "selected" : ""}>${n ? `${n} · ${brl(valorDificuldade(p, n))}` : "0 · sem acabamento"}</option>`).join("")}
          </select></label>
          ${campo("Peças compradas (R$/peça)", "pecas_compradas", "num", orc.pecas_compradas || 0, "", "Argola, ímã, base, parafuso...")}
          ${campo("Quantidade do pedido", "qtd_pedido", "int", orc.qtd_pedido, 'min="1" step="1" placeholder="Uma impressão"', "Se o cliente quer mais peças que uma placa.")}
          ${campo("Validade (dias)", "validade_dias", "int", orc.validade_dias, 'min="1" step="1" placeholder="Sem validade"')}
          ${campo("Prazo de entrega (dias)", "prazo_dias", "int", orc.prazo_dias, 'min="1" step="1" placeholder="Sem prazo"')}
          <label class="caixa"><input type="checkbox" data-campo="marketplace" ${orc.marketplace ? "checked" : ""} ${dis} /> Vai para o marketplace</label>
          <label class="caixa"><input type="checkbox" data-campo="vendedor" ${orc.vendedor ? "checked" : ""} ${dis} /> Comissão de vendedor</label>
        </div>
        <div class="grade" style="margin-top:12px">
          <label>Observações internas<textarea data-campo="obs" ${dis}>${h(orc.obs)}</textarea></label>
          <label>Observações para o cliente (vão no PDF)<textarea data-campo="obs_cliente" ${dis}>${h(orc.obs_cliente)}</textarea></label>
        </div>
      </div>
    </div>

    <h2>Placas</h2><p class="ajuda">Desmarque as placas que não vai imprimir agora.</p>
    <div class="rolagem"><table><thead><tr><th>Incluir</th><th></th><th>Placa</th><th>Tempo</th><th class="n">Peso (g)</th><th class="n">Objetos</th></tr></thead>
      <tbody>${orc.placas.map((pl) => `<tr>
        <td><input type="checkbox" data-placa="${h(pl.id)}" ${pl.incluir ? "checked" : ""} ${dis} aria-label="Incluir placa ${h(pl.indice)}" /></td>
        <td>${pl.miniatura ? `<img class="mini" src="${urlDe(pl.miniatura)}" alt="" />` : ""}</td>
        <td>${h(pl.indice)}</td><td>${horas(pl.tempo_s)}</td><td class="n">${num(pl.peso_g)}</td>
        <td class="n">${JSON.parse(pl.objetos || "[]").length}</td></tr>`).join("")}</tbody></table></div>

    <h2>Filamentos</h2><p class="ajuda">De qual rolo sai cada cor. O programa já sugere o rolo do mesmo tipo com a cor mais parecida.</p>
    <div class="rolagem"><table><thead><tr><th>Placa</th><th>Cor no arquivo</th><th>Tipo</th><th class="n">Gramas</th><th>Rolo</th></tr></thead>
      <tbody>${orc.linhas.map((l) => `<tr>
        <td>${h(l.placa)}</td><td><span class="bolinha" style="background:${corSegura(l.cor_hex)}"></span>${nomeDaCor(l.cor_hex)} <span class="fraco">${h(l.cor_hex)}</span></td>
        <td>${h(l.tipo)}</td><td class="n">${num(l.gramas)}</td>
        <td><select data-linha="${h(l.id)}" ${dis} aria-label="Rolo da cor ${h(l.cor_hex)}">${opcoesRolo(l.rolo_id)}</select></td></tr>`).join("")}</tbody></table></div>

    <h2>Custo e preço</h2>
    <div id="custo"></div>
    <h2>Estoque</h2>
    <div id="estoque"></div>
    <h2>Virou venda?</h2>
    <div id="vendas"></div>`;

  function mostrarCusto() {
    let r, pp;
    try { [r, pp] = banco.resultadoAtual(orc, p, rolos); }
    catch (erro) { $("#custo").innerHTML = `<p class="alerta">${h(erro.message)}</p>`; return; }
    const qtd = banco.quantidade(orc), vezes = Math.ceil(qtd / Math.max(orc.unidades || 1, 1));
    let resumo = `${num(r.peso_g)} g e ${horas(r.tempo_h * 3600)} por impressão`;
    if (r.unidades > 1) resumo += `, ${r.unidades} peças em cada`;
    if (qtd > 1) resumo += `. Pedido de ${qtd} peças${vezes > 1 ? ` (${vezes} impressões)` : ""}: custo ${brl(r.custo_geral * qtd)}, venda ${brl(r.preco * qtd)}`;
    const avisos = [
      !travado && avisoUnidades(orc),
      !travado && r.usou_preco_padrao && `Há cor sem rolo escolhido: ela usa o preço padrão de ${brl(p.preco_kg_padrao)}/kg.`,
      orc.preco_enviado && Math.abs(orc.preco_enviado - r.preco) > 0.005 &&
        `O último PDF foi com ${brl(orc.preco_enviado)} por peça; com os valores de agora o preço é ${brl(r.preco)}. Gere o PDF de novo para mandar o preço novo.`,
    ].filter(Boolean);
    $("#custo").innerHTML = `<div class="custo">
      <table><thead><tr><th>Item</th><th class="n">${r.unidades > 1 || qtd > 1 ? "Por peça" : "Valor"}</th></tr></thead>
        <tbody>${composicao(r, pp, orc.dificuldade).map(([rot, v, sub]) => `<tr class="${sub ? "subtotal" : ""}"><td>${h(rot)}</td><td class="n">${brl(v)}</td></tr>`).join("")}</tbody></table>
      <div class="painel">
        <div class="fraco">Preço de venda por peça</div><div class="preco">${brl(r.preco)}</div>
        ${r.comissao_vendedor ? `<p class="ajuda">Inclui ${brl(r.comissao_vendedor)} de comissão do vendedor (${num(pp.comissao_vendedor * 100, 0)}%).</p>` : ""}
        ${orc.marketplace ? `<div class="fraco" style="margin-top:8px">Preço no marketplace</div><div class="preco" style="font-size:26px">${brl(r.preco_market)}</div>
          <p class="ajuda">Comissão de ${brl(r.comissao)} (${pp.modo_comissao === "liquido" ? "preservando o líquido" : "como na planilha"}).</p>` : ""}
        <p class="ajuda">${resumo}.</p>
        ${avisos.map((a) => `<p class="alerta">${h(a)}</p>`).join("")}
        <div class="acoes">
          <button class="primario" id="gerar">${orc.pdf_em ? "Gerar PDF de novo" : "Gerar PDF do cliente"}</button>
          <button id="interno">PDF interno</button>
          ${travado ? "" : `<button class="perigo" id="excluir">Excluir orçamento</button>`}
        </div>
        ${orc.pdf_em ? `<p class="ajuda">Último PDF em ${h(dataBR(orc.pdf_em))} ${h(orc.pdf_em.slice(11, 16))}.</p>` : ""}
      </div></div>`;
    $("#gerar").onclick = () => {
      let pdf;
      try { pdf = pdfCliente(orc, r, banco.lerMarca()); }
      catch (erro) { return avisar(`Não consegui gerar o PDF: ${erro.message}. Confira a internet (o gerador vem do CDN) ou a logo.`, true); }
      banco.salvarPdf(orc.id, pdf, r.preco);
      baixar(pdf, `${nomeArquivo(`Orçamento ${orc.id} - ${orc.nome}`)}.pdf`, "application/pdf");
      orc = banco.carregarOrcamento(id);
      mostrarCusto();
    };
    $("#interno").onclick = () => {
      const indices = new Set(banco.placasIncluidas(orc).map((pl) => pl.indice));
      const filamentos = orc.linhas.filter((l) => indices.has(l.placa))
        .map((l) => [l.placa, corSegura(l.cor_hex), l.tipo || "", l.gramas, l.rolo_id != null ? rotulos[l.rolo_id] || "-" : "Preço padrão"]);
      const emb = embalagens.find((e) => e.id === orc.embalagem_id);
      const situacao = travado ? `Impresso em ${dataBR(orc.impresso_em)}` : "Em aberto";
      try {
        const pdf = pdfInterno(orc, r, pp, filamentos, emb ? `${emb.nome} (${brl(emb.custo)})` : "Sem embalagem", situacao, banco.lerMarca());
        baixar(pdf, `${nomeArquivo(`Orçamento ${orc.id} - ${orc.nome}`)} (interno).pdf`, "application/pdf");
      } catch (erro) { avisar(`Não consegui gerar o PDF: ${erro.message}`, true); }
    };
    const excluir = $("#excluir");
    if (excluir) excluir.onclick = () => {
      if (!confirm(`Excluir o orçamento #${orc.id} ${orc.nome}? Não dá para desfazer.`)) return;
      try { banco.excluirOrcamento(orc.id); location.hash = "#/orcamentos"; avisar("Orçamento excluído."); }
      catch (erro) { avisar(erro.message, true); }
    };
  }
  // ---- estoque: o que sai de cada rolo, confirmar ou desfazer a impressão
  function mostrarEstoque() {
    const el = $("#estoque");
    if (travado) {
      el.innerHTML = `<div class="painel"><p style="margin-top:0">Impresso em ${h(dataBR(orc.impresso_em))}: o filamento já saiu dos rolos.</p>
        <button id="desfazer">Desfazer impressão</button><p class="ajuda">Devolve o filamento aos rolos e reabre o orçamento.</p></div>`;
      $("#desfazer").onclick = () => {
        if (!confirm("Desfazer a impressão? O filamento volta para os rolos.")) return;
        banco.desfazerImpressao(id); avisar("Impressão desfeita."); telaOrcamento(id);
      };
      return;
    }
    const consumo = Object.entries(banco.consumoPorRolo(orc)).map(([rid, g]) => {
      const rolo = rolos.find((x) => x.id === Number(rid));
      return { rotulo: rotulos[rid] || `#${rid}`, g, saldo: rolo?.saldo_g ?? 0 };
    });
    const semRolo = orc.linhas.some((l) => l.rolo_id == null && banco.placasIncluidas(orc).some((pl) => pl.indice === l.placa));
    const vezes = banco.impressoes(orc);
    el.innerHTML = `<div class="painel">
      ${consumo.length ? `<div class="rolagem"><table><thead><tr><th>Rolo</th><th class="n">Vai usar (g)</th><th class="n">Saldo (g)</th><th class="n">Depois (g)</th></tr></thead>
        <tbody>${consumo.map((c) => `<tr><td>${h(c.rotulo)}</td><td class="n">${num(c.g)}</td><td class="n">${num(c.saldo, 0)}</td>
          <td class="n" style="${c.saldo - c.g < 0 ? "color:var(--erro);font-weight:700" : ""}">${num(c.saldo - c.g, 0)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${vezes > 1 ? `<p class="ajuda">O pedido usa ${vezes} impressões da placa: o consumo já está multiplicado.</p>` : ""}
      ${semRolo ? `<p class="alerta">Escolha o rolo de todas as cores (em Filamentos, acima) para poder confirmar a impressão.</p>` : ""}
      ${consumo.some((c) => c.saldo - c.g < 0) ? `<p class="alerta">Saldo insuficiente em algum rolo. Dá para confirmar mesmo assim; o saldo fica negativo até você pesar o rolo.</p>` : ""}
      <div class="acoes"><button class="primario" id="confirmar" ${semRolo ? "disabled" : ""}>Confirmar impressão</button></div>
      <p class="ajuda">Ao confirmar, o filamento sai dos rolos e os valores do orçamento ficam congelados.</p></div>`;
    $("#confirmar").onclick = () => {
      if (!confirm("Confirmar a impressão? O filamento sai dos rolos.")) return;
      try { banco.confirmarImpressao(id); avisar("Impressão confirmada: estoque atualizado."); telaOrcamento(id); }
      catch (erro) { avisar(erro.message, true); }
    };
  }

  // ---- vendas do orçamento: várias por orçamento, com o custo congelado em cada uma
  function mostrarVendas() {
    const el = $("#vendas"), vendas = banco.vendasDoOrcamento(id);
    let qtdPrev = 1, valorPrev = 0;
    try { [qtdPrev, valorPrev] = banco.vendaPrevista(orc); } catch { /* lucro inválido: a pessoa digita */ }
    el.innerHTML = `<div class="painel">
      ${vendas.length ? `<div class="rolagem"><table><thead><tr><th>Data</th><th>Canal</th><th class="n">Peças</th><th class="n">Recebido</th><th class="n">Lucro</th><th></th></tr></thead>
        <tbody>${vendas.map((v) => `<tr><td>${h(dataBR(v.data))}</td><td>${h(v.canal)}</td><td class="n">${h(v.qtd)}</td>
          <td class="n">${brl(v.valor)}</td><td class="n">${brl(v.valor - v.qtd * v.custo_unit)}</td>
          <td><button class="perigo" data-apagar-venda="${h(v.id)}">Apagar</button></td></tr>`).join("")}</tbody></table></div>`
        : orc.venda === 0 ? `<p style="margin-top:0">Marcado como <strong>não vendeu</strong>. <button id="sem-resposta">Desfazer</button></p>`
        : `<p class="fraco" style="margin-top:0">Ainda sem resposta. Registre a venda abaixo ou marque que não vendeu.</p>`}
      <form id="nova-venda" class="grade" style="margin-top:12px">
        <label>Peças<input name="qtd" type="number" min="1" step="1" value="${qtdPrev}" required /></label>
        <label>Recebido (R$)<input name="valor" type="number" min="0" step="any" value="${valorPrev.toFixed(2)}" required />
          <span class="ajuda">O que entrou para você, já sem taxas.</span></label>
        <label>Data<input name="data" type="date" value="${hojeIso()}" required /></label>
        <label>Canal<select name="canal">${CANAIS.map((c) => `<option>${c}</option>`).join("")}</select></label>
      </form>
      <div class="acoes"><button class="primario" id="registrar-venda">${vendas.length ? "Registrar outra venda" : "Vendeu: registrar venda"}</button>
        ${vendas.length || orc.venda === 0 ? "" : `<button id="nao-vendeu">Não vendeu</button>`}</div></div>`;
    const recarregar = () => { orc = banco.carregarOrcamento(id); mostrarVendas(); };
    $("#registrar-venda").onclick = () => {
      const f = $("#nova-venda");
      if (!f.reportValidity()) return;
      banco.registrarVenda(id, Number(f.qtd.value), parseFloat(f.valor.value) || 0, f.data.value, f.canal.value);
      avisar("Venda registrada."); recarregar();
    };
    $("#nao-vendeu")?.addEventListener("click", () => { banco.responderVenda(id, 0); recarregar(); });
    $("#sem-resposta")?.addEventListener("click", () => { banco.responderVenda(id, null); recarregar(); });
    el.querySelectorAll("[data-apagar-venda]").forEach((b) => (b.onclick = () => {
      if (!confirm("Apagar esta venda?")) return;
      banco.apagarVenda(Number(b.dataset.apagarVenda)); recarregar();
    }));
  }

  mostrarCusto();
  mostrarEstoque();
  mostrarVendas();

  // Cada mudança vai direto para o banco e o custo recalcula
  pagina.onchange = (e) => {
    const el = e.target;
    try {
      if (el.dataset.campo) {
        let v = valorDo(el);
        if (el.dataset.campo === "unidades") v = Math.max(v || 1, 1);         // coluna NOT NULL
        if (el.dataset.campo === "qtd_pedido" && !v) v = null;                 // vazio = uma impressão
        banco.atualizarOrcamento(id, el.dataset.campo, v);
      }
      else if (el.dataset.placa) banco.incluirPlaca(Number(el.dataset.placa), el.checked);
      else if (el.dataset.linha) banco.escolherRolo(Number(el.dataset.linha), el.value ? Number(el.value) : null);
      else return;
    } catch (erro) { avisar(erro.message, true); return; }
    orc = banco.carregarOrcamento(id);
    if (el.dataset.campo === "nome") $("h1").textContent = `#${orc.id} ${orc.nome}`;
    mostrarCusto();
    mostrarEstoque();
    if (["unidades", "qtd_pedido", "vendedor", "perc_lucro"].includes(el.dataset.campo)) mostrarVendas();  // muda o previsto
  };
}

// ================================================================= filamentos
function telaFilamentos() {
  const rolos = banco.listarRolos(), p = banco.lerParametros();
  pagina.innerHTML = `
    <h1>Filamentos</h1>
    <p class="fraco">Cada rolo físico é um registro com saldo próprio. O saldo baixa quando você confirma uma impressão;
       acerte pela balança com <strong>Pesar</strong> e registre falhas e purgas com <strong>Perda</strong>.</p>
    <form id="novo" class="painel"><h2 style="margin-top:0">Cadastrar rolo</h2><div class="grade">
      <label>Marca<input name="marca" required placeholder="Voolt, 3D Lab, Sunlu..." /></label>
      <label>Tipo<input name="tipo" required placeholder="PLA, PETG..." /></label>
      <label>Linha<input name="linha" placeholder="Basic, Matte, Silk..." /></label>
      <label>Nome da cor<input name="cor_nome" placeholder="Preto" /></label>
      <label>Cor<input name="cor_hex" type="color" value="#000000" /><span class="ajuda">A mesma do seu fatiador, para a sugestão de rolo acertar.</span></label>
      <label>Peso do rolo (g)<input name="peso_inicial_g" type="number" step="any" min="1" value="1000" required /></label>
      <label>Preço pago (R$)<input name="preco_pago" type="number" step="any" min="0" required /></label>
      <label>Data da compra<input name="data_compra" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>Quantos rolos iguais<input name="quantidade" type="number" min="1" step="1" value="1" /></label>
    </div><div class="acoes"><button class="primario">Cadastrar</button></div></form>
    <h2>Rolos</h2>
    ${rolos.length ? `<div class="rolagem"><table><thead><tr><th>Rolo</th><th>Linha</th><th class="n">Saldo (g)</th><th class="n">R$/kg</th><th></th></tr></thead>
      <tbody>${rolos.map((r) => `<tr style="${r.ativo ? "" : "opacity:.55"}">
        <td><span class="bolinha" style="background:${corSegura(r.cor_hex)}"></span>${h(banco.rotuloRolo(r))}</td><td>${h(r.linha)}</td>
        <td class="n" style="${r.ativo && r.saldo_g < p.alerta_estoque_g ? "color:var(--alerta);font-weight:700" : ""}">${num(r.saldo_g, 0)}</td>
        <td class="n">${num(r.preco_g * 1000)}</td>
        <td><button data-pesar="${h(r.id)}">Pesar</button> <button data-perda="${h(r.id)}">Perda</button> <button data-arquivar="${h(r.id)}" data-ativo="${r.ativo ? 1 : 0}">${r.ativo ? "Arquivar" : "Reativar"}</button></td>
      </tr>`).join("")}</tbody></table></div>` : `<p class="fraco">Nenhum rolo ainda.</p>`}
    ${previsao()}`;

  $("#novo").onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    banco.inserirRolo({ ...d, peso_inicial_g: parseFloat(d.peso_inicial_g), preco_pago: parseFloat(String(d.preco_pago).replace(",", ".")) });
    avisar("Rolo cadastrado.");
    telaFilamentos();
  };
  pagina.onclick = (e) => {
    const b = e.target.closest("button[data-pesar], button[data-arquivar], button[data-perda]");
    if (!b) return;
    if (b.dataset.arquivar) banco.arquivarRolo(Number(b.dataset.arquivar), b.dataset.ativo !== "1");
    else if (b.dataset.perda) {
      const g = parseFloat((prompt("Quantos gramas foram perdidos (falha, purga, teste)?") || "").replace(",", "."));
      if (!(g > 0)) return;
      banco.registrarPerda(Number(b.dataset.perda), g, prompt("Motivo (opcional):", "Impressão falhou") || "");
      avisar("Perda registrada: ela sai do lucro do mês no Início.");
    } else {
      const g = prompt("Quanto o filamento pesa agora, sem o carretel (g)?");
      if (g === null || isNaN(parseFloat(g.replace(",", ".")))) return;
      banco.ajustarSaldo(Number(b.dataset.pesar), parseFloat(g.replace(",", ".")));
      avisar("Saldo ajustado.");
    }
    telaFilamentos();
  };
}

/** Tabela "Previsão de compra": por tipo e cor, quanto dura o que tem, já descontando o que foi vendido e não impresso. */
function previsao() {
  const linhasPrev = banco.previsaoEstoque();
  if (!linhasPrev.length) return "";
  return `<h2>Previsão de compra</h2>
    <p class="ajuda">Consumo médio dos últimos 90 dias (impressões confirmadas e perdas). "Comprometido" é o que já foi vendido e ainda não impresso.</p>
    <div class="rolagem"><table><thead><tr><th>Filamento</th><th class="n">Rolos</th><th class="n">Disponível (g)</th><th class="n">Comprometido (g)</th>
      <th class="n">Gasto por dia (g)</th><th class="n">Dura</th><th></th></tr></thead>
    <tbody>${linhasPrev.map((g) => `<tr><td><span class="bolinha" style="background:${corSegura(g.hex)}"></span>${h(g.tipo)} ${h(g.cor)}</td>
      <td class="n">${h(g.rolos)}</td><td class="n">${num(g.disponivel, 0)}</td><td class="n">${num(g.comprometido, 0)}</td>
      <td class="n">${g.porDia ? num(g.porDia, 1) : "-"}</td><td class="n">${g.diasRestantes == null ? "-" : `${num(g.diasRestantes, 0)} dias`}</td>
      <td>${g.comprar ? `<span class="etiqueta" style="color:var(--erro);border-color:var(--erro)">Comprar</span>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
}

// ================================================================= início
function telaInicio() {
  const p = banco.lerParametros(), rolos = banco.listarRolos(true), orcs = banco.listarOrcamentos();
  const mes = mesAtual(), vendas = banco.listarVendas(), doMes = vendas.filter((v) => (v.data || "").startsWith(mes));
  const perdas = banco.perdasDoMes(mes), conv = banco.conversao();
  const soma = (lista, f) => lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const estoque = soma(rolos, (r) => Math.max(r.saldo_g, 0));
  const cartao = (rotulo, valor, ajuda = "") => `<div class="painel cartao"><div class="fraco">${rotulo}</div><div class="valor">${valor}</div>${ajuda ? `<p class="ajuda">${ajuda}</p>` : ""}</div>`;
  const produtos = Object.values(vendas.reduce((acc, v) => {
    const k = v.orcamento_id;
    acc[k] ??= { id: k, nome: v.nome, vendas: 0, pecas: 0, recebido: 0, lucro: 0 };
    Object.assign(acc[k], { vendas: acc[k].vendas + 1, pecas: acc[k].pecas + v.qtd, recebido: acc[k].recebido + v.valor, lucro: acc[k].lucro + v.lucro });
    return acc;
  }, {})).sort((a, b) => b.lucro - a.lucro).slice(0, 5);
  const comprar = rolos.length ? banco.previsaoEstoque().filter((g) => g.comprar) : [];
  const nome = banco.lerMarca().nome;
  const primeiros = [
    [rolos.length, "Cadastre seus rolos", "#/filamentos"],
    [nome, "Coloque o nome e a logo da sua marca", "#/marca"],
    [orcs.length, "Importe um arquivo .gcode.3mf", "#/orcamentos"],
  ];
  pagina.innerHTML = `
    <h1>${nome ? `Olá, ${h(nome)}` : "Início"}</h1>
    ${lembreteExportar()}
    ${primeiros.some(([feito]) => !feito) ? `<div class="painel"><strong>Primeiros passos</strong><ol style="margin:8px 0 0">
      ${primeiros.map(([feito, texto, link]) => `<li>${feito ? `<s class="fraco">${texto}</s>` : `<a href="${link}">${texto}</a>`}</li>`).join("")}</ol></div>` : ""}
    <h2>Este mês</h2>
    <div class="cartoes">
      ${cartao("Recebido", brl(soma(doMes, (v) => v.valor)), `${doMes.length} venda(s), ${soma(doMes, (v) => v.qtd)} peça(s)`)}
      ${cartao("Lucro", brl(soma(doMes, (v) => v.lucro) - perdas.valor), "Recebido − custo das peças − perdas")}
      ${cartao("Perdas", brl(perdas.valor), `${num(perdas.gramas, 0)} g de falhas e purgas`)}
      ${cartao("Conversão", conv.respondidos ? `${num((conv.vendidos / conv.respondidos) * 100, 0)}%` : "-", `${conv.vendidos} vendido(s) de ${conv.respondidos} com resposta`)}
    </div>
    <h2>Agora</h2>
    <div class="cartoes">
      ${cartao("Orçamentos em aberto", orcs.filter((o) => o.status === "orcamento").length)}
      ${cartao("Filamento em estoque", `${num(estoque / 1000, 2)} kg`, `${rolos.length} rolo(s) ativo(s)`)}
      ${cartao("Valor em estoque", brl(soma(rolos, (r) => Math.max(r.saldo_g, 0) * r.preco_g)), "Saldo × preço pago")}
    </div>
    ${comprar.length ? `<p class="alerta">Comprar logo: ${comprar.map((g) => `${h(g.tipo)} ${h(g.cor)}${g.diasRestantes != null ? ` (~${num(g.diasRestantes, 0)} dias)` : ""}`).join(", ")}.
      <a href="#/filamentos">Ver previsão</a></p>` : ""}
    ${produtos.length ? `<h2>Produtos que mais deram lucro</h2><div class="rolagem"><table>
      <thead><tr><th>Produto</th><th class="n">Vendas</th><th class="n">Peças</th><th class="n">Recebido</th><th class="n">Lucro</th><th class="n">Margem</th></tr></thead>
      <tbody>${produtos.map((x) => `<tr><td><a href="#/orcamento/${h(x.id)}">${h(x.nome)}</a></td><td class="n">${x.vendas}</td><td class="n">${x.pecas}</td>
        <td class="n">${brl(x.recebido)}</td><td class="n">${brl(x.lucro)}</td><td class="n">${x.recebido > 0 ? `${num((x.lucro / x.recebido) * 100, 0)}%` : "-"}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${rolos.length ? `<h2>Rolos</h2><div class="cartoes">${rolos.map((r) => {
      const pct = Math.max(0, Math.min(1, r.saldo_g / r.peso_inicial_g)) * 100, baixo = r.saldo_g < p.alerta_estoque_g;
      return `<div class="painel rolo"><div><span class="bolinha" style="background:${corSegura(r.cor_hex)}"></span><strong>${h(r.tipo)} ${h(r.cor_nome)}</strong></div>
        <div class="barra" role="img" aria-label="${num(pct, 0)}% restante"><span style="width:${pct.toFixed(1)}%;background:${corSegura(r.cor_hex)}"></span></div>
        <div class="${baixo ? "" : "fraco"}" style="${baixo ? "color:var(--erro);font-weight:600" : ""}">${num(r.saldo_g, 0)} g de ${num(r.peso_inicial_g, 0)} g${baixo ? " · acabando" : ""}</div></div>`;
    }).join("")}</div>` : ""}`;
}

// ================================================================= vendas
function telaVendas() {
  const vendas = banco.listarVendas(), soma = (f) => vendas.reduce((s, v) => s + (Number(v[f]) || 0), 0);
  pagina.innerHTML = `
    <h1>Vendas</h1>
    <p class="fraco">Todas as vendas registradas nos orçamentos (em "Virou venda?"). O custo de cada uma fica congelado no dia em que foi registrada.</p>
    ${vendas.length ? `<div class="rolagem"><table><thead><tr><th>Data</th><th>Produto</th><th>Cliente</th><th>Canal</th>
      <th class="n">Peças</th><th class="n">Recebido</th><th class="n">Custo</th><th class="n">Lucro</th></tr></thead>
      <tbody>${vendas.map((v) => `<tr><td>${h(dataBR(v.data))}</td><td><a href="#/orcamento/${h(v.orcamento_id)}">${h(v.nome)}</a></td>
        <td>${h(v.cliente)}</td><td>${h(v.canal)}</td><td class="n">${h(v.qtd)}</td><td class="n">${brl(v.valor)}</td>
        <td class="n">${brl(v.custo)}</td><td class="n">${brl(v.lucro)}</td></tr>`).join("")}
      <tr class="subtotal"><td colspan="4">Total</td><td class="n">${soma("qtd")}</td><td class="n">${brl(soma("valor"))}</td>
        <td class="n">${brl(soma("custo"))}</td><td class="n">${brl(soma("lucro"))}</td></tr></tbody></table></div>`
      : `<p class="painel">Nenhuma venda ainda. Abra um orçamento em <a href="#/orcamentos">Orçamentos</a> e use "Virou venda?" no fim da página.</p>`}`;
}

// ================================================================= propostas
function telaPropostas() {
  const p = banco.lerParametros(), rolos = banco.listarRolos();
  const orcs = banco.listarOrcamentos().filter((o) => o.status !== "cancelado");
  const props = banco.listarPropostas();
  const preco = (id) => { try { return brl(banco.resultadoAtual(banco.carregarOrcamento(id), p, rolos)[0].preco); } catch { return "-"; } };
  pagina.innerHTML = `
    <h1>Propostas</h1>
    <p class="fraco">Junte vários orçamentos do mesmo cliente num PDF só, com a foto, a quantidade e o preço de cada item e o total.</p>
    ${props.length ? `<div class="rolagem"><table><thead><tr><th>#</th><th>Cliente</th><th class="n">Itens</th><th class="n">Total</th><th>PDF</th><th></th></tr></thead>
      <tbody>${props.map((x) => `<tr><td>${h(x.id)}</td><td>${h(x.cliente) || "-"}</td><td class="n">${JSON.parse(x.orcamentos || "[]").length}</td>
        <td class="n">${x.total != null ? brl(x.total) : "-"}</td><td>${x.pdf_em ? h(dataBR(x.pdf_em)) : "-"}</td>
        <td><button data-gerar="${h(x.id)}">${x.pdf_em ? "Gerar de novo" : "Gerar PDF"}</button>
          ${x.pdf_em ? `<button data-baixar="${h(x.id)}">Baixar</button>` : ""}
          <button class="perigo" data-excluir="${h(x.id)}">Excluir</button></td></tr>`).join("")}</tbody></table></div>` : ""}
    <h2>Nova proposta</h2>
    ${orcs.length ? `<form id="nova" class="painel">
      <p class="ajuda" style="margin-top:0">Marque os orçamentos, na ordem em que devem aparecer no PDF.</p>
      <div class="rolagem" style="max-height:340px;overflow-y:auto"><table><tbody>${orcs.map((o) => `<tr>
        <td><input type="checkbox" name="orc" value="${h(o.id)}" aria-label="Incluir ${h(o.nome)}" /></td>
        <td>${o.capa ? `<img class="mini" src="${urlDe(o.capa)}" alt="" />` : ""}</td>
        <td>#${h(o.id)} ${h(o.nome)}</td><td class="fraco">${h(o.cliente)}</td><td class="n">${preco(o.id)}</td></tr>`).join("")}</tbody></table></div>
      <div class="grade" style="margin-top:12px">
        <label>Cliente<input name="cliente" /></label>
        <label>Contato do cliente<input name="cliente_contato" placeholder="WhatsApp, Instagram..." /></label>
        <label>Validade (dias)<input name="validade_dias" type="number" min="1" step="1" placeholder="Sem validade" /></label>
        <label>Prazo de entrega (dias)<input name="prazo_dias" type="number" min="1" step="1" placeholder="Sem prazo" /></label>
      </div>
      <label style="margin-top:12px">Observações para o cliente<textarea name="obs_cliente"></textarea></label>
      <div class="acoes"><button class="primario">Criar e gerar PDF</button></div></form>`
      : `<p class="painel">Importe arquivos em <a href="#/orcamentos">Orçamentos</a> para montar uma proposta.</p>`}`;

  const gerar = (id) => {
    const prop = banco.carregarProposta(id), marca = banco.lerMarca(), itens = [];
    for (const oid of prop.orcamentos) {
      const orc = banco.carregarOrcamento(oid);
      if (!orc) return avisar(`O orçamento #${oid} desta proposta foi excluído. Crie a proposta de novo.`, true);
      itens.push([orc, banco.resultadoAtual(orc, p, rolos)[0]]);
    }
    try {
      const pdf = pdfProposta(prop, itens, marca);
      banco.salvarPdfProposta(id, pdf, itens.reduce((s, [o, r]) => s + r.preco * banco.quantidade(o), 0),
                              Object.fromEntries(itens.map(([o, r]) => [o.id, r.preco])));
      baixar(pdf, `${nomeArquivo(`Proposta ${id}${prop.cliente ? ` - ${prop.cliente}` : ""}`)}.pdf`, "application/pdf");
    } catch (erro) { return avisar(`Não consegui gerar o PDF: ${erro.message}`, true); }
    telaPropostas();
  };
  const form = $("#nova");
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    const ids = [...form.querySelectorAll("input[name=orc]:checked")].map((c) => Number(c.value));
    const int = (v) => (v ? Math.max(parseInt(v) || 0, 1) : null);
    try {
      const id = banco.criarProposta(ids, { cliente: form.cliente.value.trim(), cliente_contato: form.cliente_contato.value.trim(),
        validade_dias: int(form.validade_dias.value), prazo_dias: int(form.prazo_dias.value), obs_cliente: form.obs_cliente.value.trim() });
      gerar(id);
    } catch (erro) { avisar(erro.message, true); }
  };
  pagina.onclick = (e) => {
    const b = e.target.closest("button[data-gerar], button[data-baixar], button[data-excluir]");
    if (!b) return;
    if (b.dataset.gerar) gerar(Number(b.dataset.gerar));
    else if (b.dataset.baixar) {
      const prop = banco.carregarProposta(Number(b.dataset.baixar));
      baixar(prop.pdf, `${nomeArquivo(`Proposta ${prop.id}${prop.cliente ? ` - ${prop.cliente}` : ""}`)}.pdf`, "application/pdf");
    } else if (confirm(`Excluir a proposta #${b.dataset.excluir}? Os orçamentos continuam.`)) {
      banco.excluirProposta(Number(b.dataset.excluir)); telaPropostas();
    }
  };
}

// ================================================================= parâmetros
function telaParametros() {
  const p = banco.lerParametros(), embalagens = banco.listarEmbalagens();
  const n = (rotulo, chave, fator = 1, ajuda = "") => `<label>${rotulo}
    <input name="${chave}" data-fator="${fator}" type="number" step="any" min="0" required value="${Number((p[chave] * fator).toFixed(4))}" />
    ${ajuda ? `<span class="ajuda">${ajuda}</span>` : ""}</label>`;
  pagina.innerHTML = `
    <h1>Parâmetros</h1>
    <p class="fraco">Valem para os orçamentos em aberto. Impressões confirmadas mantêm os valores da época.</p>
    <form id="params" class="painel">
      <h2 style="margin-top:0">Máquina</h2><div class="grade">
        ${n("Tarifa de energia (R$/kWh)", "tarifa_kwh")}
        ${n("Consumo médio da impressora (kW)", "potencia_kw", 1, "0,35 kW = 350 W.")}
        ${n("Degradação (R$ por hora)", "degradacao_h", 1, "Bico, mesa, correias e a própria máquina.")}</div>
      <h2>Preço</h2><div class="grade">
        ${n("Margem de erro (%)", "perc_erro", 100)}
        ${n("Lucro padrão (%)", "perc_lucro", 100, "Para orçamentos novos.")}
        <label class="caixa"><input type="checkbox" name="arredondar" ${p.arredondar ? "checked" : ""} /> Arredondar o preço para cima</label></div>
      <h2>Mão de obra e acabamento</h2><div class="grade">
        ${n("Sua hora de trabalho (R$/h)", "mao_de_obra_h", 1, "0 = não cobra.")}
        ${[1, 2, 3, 4, 5].map((i) => n(`Acabamento nível ${i} (R$/peça)`, `dificuldade_${i}`)).join("")}</div>
      <h2>Marketplace e vendedor</h2><div class="grade">
        ${n("Comissão do marketplace (%)", "comissao_perc", 100)}
        ${n("Taxa fixa por venda (R$)", "comissao_fixa")}
        <label>Como calcular o preço no marketplace<select name="modo_comissao">
          <option value="liquido" ${p.modo_comissao === "liquido" ? "selected" : ""}>Preservar o líquido (recomendado)</option>
          <option value="planilha" ${p.modo_comissao === "planilha" ? "selected" : ""}>Como na planilha: preço × % + taxa</option></select></label>
        ${n("Comissão de quem vende por você (%)", "comissao_vendedor", 100)}</div>
      <h2>Estoque</h2><div class="grade">
        ${n("Preço padrão do filamento (R$/kg)", "preco_kg_padrao", 1, "Para cor sem rolo escolhido.")}
        ${n("Avisar rolo com menos de (g)", "alerta_estoque_g")}</div>
      <div class="acoes"><button class="primario">Salvar parâmetros</button></div>
    </form>
    <h2>Embalagens</h2>
    <div class="painel"><table><thead><tr><th>Embalagem</th><th class="n">Custo (R$)</th><th></th></tr></thead><tbody>
      ${embalagens.map((e) => `<tr><td><input data-emb="${h(e.id)}" data-col="nome" value="${h(e.nome)}" aria-label="Nome da embalagem" /></td>
        <td><input data-emb="${h(e.id)}" data-col="custo" type="number" step="any" min="0" value="${Number(e.custo) || 0}" aria-label="Custo de ${h(e.nome)}" /></td>
        <td><button class="perigo" data-apagar="${h(e.id)}">Apagar</button></td></tr>`).join("")}
      <tr><td><input id="emb-nome" placeholder="Nova embalagem" /></td><td><input id="emb-custo" type="number" step="any" min="0" placeholder="0,00" /></td>
        <td><button id="emb-add">Adicionar</button></td></tr>
    </tbody></table></div>`;

  $("#params").onsubmit = (e) => {
    e.preventDefault();
    const novo = { ...p, arredondar: e.target.arredondar.checked, modo_comissao: e.target.modo_comissao.value };
    for (const el of e.target.querySelectorAll("input[data-fator]"))
      novo[el.name] = (parseFloat(el.value.replace(",", ".")) || 0) / Number(el.dataset.fator);
    if (novo.perc_lucro >= 0.95) return avisar("O lucro padrão precisa ser menor que 95%.", true);
    banco.salvarParametros(novo);
    avisar("Parâmetros salvos.");
  };
  const linhaEmb = (id) => [...pagina.querySelectorAll(`[data-emb="${id}"]`)];
  pagina.onchange = (e) => {
    const id = e.target.dataset.emb;
    if (!id) return;
    const [nome, custo] = linhaEmb(id).map((el) => el.value);
    if (!nome.trim()) return avisar("A embalagem precisa de um nome.", true);
    banco.salvarEmbalagem(Number(id), nome.trim(), parseFloat(custo.replace(",", ".")) || 0);
    avisar("Embalagem salva.");
  };
  pagina.onclick = (e) => {
    if (e.target.dataset.apagar) { banco.excluirEmbalagem(Number(e.target.dataset.apagar)); telaParametros(); }
    if (e.target.id === "emb-add") {
      const nome = $("#emb-nome").value.trim();
      if (!nome) return avisar("Escreva o nome da embalagem.", true);
      try { banco.salvarEmbalagem(null, nome, parseFloat($("#emb-custo").value.replace(",", ".")) || 0); }
      catch { return avisar("Já existe uma embalagem com esse nome.", true); }
      telaParametros();
    }
  };
}

// ================================================================= minha marca
function telaMarca() {
  const marca = banco.lerMarca();
  let tema = banco.lerTema();
  let exemplo = "";
  try { exemplo = urlDe(pdfExemplo(marca), "application/pdf"); } catch { /* sem jsPDF (CDN fora) ou logo inválida: tela segue sem prévia */ }
  const amostra = (cor, nome) => `<button type="button" class="amostra" data-cor="${cor}" aria-pressed="${tema.cor === cor}"
      title="${nome}" aria-label="Tema ${nome}" style="background:${cor}"></button>`;
  pagina.innerHTML = `
    <h1>Minha marca</h1>
    <p class="fraco">Vai no cabeçalho dos PDFs. O <strong>nome da marca</strong> também aparece no topo do site. O que ficar vazio não aparece.</p>
    <form id="marca" class="painel"><div class="grade">
      ${Object.entries(banco.CAMPOS_MARCA).map(([k, rot]) => `<label>${rot}<input name="${k}" maxlength="120" value="${h(marca[k])}"
        placeholder="${{ instagram: "@suaimpressora3d", whatsapp: "(11) 90000-0000", site: "www.seusite.com.br", local: "São Paulo - SP" }[k] || ""}" /></label>`).join("")}
      <label>Cor do PDF<input name="cor" type="color" value="${h(marca.cor)}" /><span class="ajuda">Títulos, linha do cabeçalho e topo das tabelas.</span></label>
      <label>Logo (PNG ou JPG)<input name="logo" type="file" accept="image/png,image/jpeg" /><span class="ajuda">Prefira fundo transparente ou branco.</span></label>
      <label class="caixa"><input type="checkbox" name="no_site" ${tema.cor === "marca" ? "checked" : ""} /> Usar a cor da marca também no site</label>
      ${marca.logo ? `<label class="caixa"><input type="checkbox" name="tirar" /> Tirar a logo atual</label>` : ""}
    </div>
    ${marca.logo ? `<p class="ajuda">Logo atual:</p><img src="${urlDe(marca.logo)}" alt="Logo atual" style="max-width:240px;max-height:80px;background:#fff;padding:6px;border-radius:8px" />` : ""}
    <div class="acoes"><button class="primario">Salvar marca</button></div></form>

    <h2>Tema do site</h2>
    <div class="painel">
      <p class="ajuda" style="margin-top:0">Muda na hora e fica salvo. As cores de texto e botões se ajustam para continuar legíveis.</p>
      <div class="modos" role="radiogroup" aria-label="Claro ou escuro">
        ${[["auto", "Automático (igual ao sistema)"], ["escuro", "Escuro"], ["claro", "Claro"]].map(([v, rot]) =>
          `<label class="caixa"><input type="radio" name="modo" value="${v}" ${tema.modo === v ? "checked" : ""} /> ${rot}</label>`).join("")}
      </div>
      <div class="amostras">
        <button type="button" class="amostra marca" data-cor="marca" aria-pressed="${tema.cor === "marca"}">
          <span style="background:${h(marca.cor)}"></span>Cor da minha marca</button>
        ${Object.entries(TEMAS).map(([nome, cor]) => amostra(cor, nome)).join("")}
      </div>
    </div>

    <h2>Como fica o PDF</h2>
    <p class="ajuda">Um orçamento de exemplo com a sua marca. Orçamentos já enviados mudam só quando você gerar o PDF de novo.</p>
    ${exemplo ? `<iframe class="pdf" src="${exemplo}" title="PDF de exemplo"></iframe>
    <div class="acoes"><a class="botao" href="${exemplo}" download="Exemplo de orçamento.pdf">Baixar PDF de exemplo</a></div>`
      : `<p class="alerta">Não consegui montar o PDF de exemplo. Confira a internet ou troque a logo.</p>`}`;

  const form = $("#marca");
  // O site mostra na hora como fica, com a mesma regra de "Salvar marca", sem gravar nada (nem o cache do <head>)
  const temaDoForm = () => (form.no_site.checked ? { ...tema, cor: "marca" }
    : tema.cor === "marca" ? { ...tema, cor: TEMAS.Roxo } : tema);
  const previa = () => aplicarTema(temaDoForm(), form.cor.value, false);
  form.cor.oninput = previa;
  form.no_site.onchange = previa;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const novo = { cor: form.cor.value };
    for (const k of Object.keys(banco.CAMPOS_MARCA)) novo[k] = form[k].value.trim();
    if (form.tirar?.checked) novo.logo = null;
    if (form.logo.files[0]) {
      try { novo.logo = await logoPng(form.logo.files[0]); }
      catch { return avisar("Não consegui abrir essa imagem. Tente salvar a logo como PNG.", true); }
    }
    banco.salvarMarca(novo);
    atualizarCabecalho();
    banco.salvarTema(temaDoForm());  // desmarcou "usar no site" com o tema na cor da marca: volta ao roxo padrão
    aplicarTema(banco.lerTema(), novo.cor);
    avisar("Marca salva.");
    telaMarca();
  };

  // Tema: cada clique grava e aplica na hora, sem redesenhar a tela (não perde o que foi digitado na marca nem o foco)
  const trocarTema = (mudanca) => {
    tema = { ...tema, ...mudanca };
    banco.salvarTema(tema);
    aplicarTema(tema, banco.lerMarca().cor);  // o salvo vai para o cache do <head>
    if ("cor" in mudanca) form.no_site.checked = tema.cor === "marca";
    pagina.querySelectorAll(".amostra").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cor === tema.cor)));
    previa();  // a cor da marca que está no seletor, mesmo antes de salvar
  };
  pagina.querySelectorAll("input[name=modo]").forEach((r) => (r.onchange = () => trocarTema({ modo: r.value })));
  pagina.querySelectorAll(".amostra").forEach((b) => (b.onclick = () => trocarTema({ cor: b.dataset.cor })));
}

/** Logo em PNG de no máximo 1200 px: uma foto de 5 MB vira algumas dezenas de KB no banco e em cada PDF. */
async function logoPng(arquivo) {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1200 / Math.max(img.width, img.height));
  const tela = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * escala), height: Math.round(img.height * escala) });
  tela.getContext("2d").drawImage(img, 0, 0, tela.width, tela.height);
  const blob = await new Promise((ok) => tela.toBlob(ok, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

// ================================================================= backup
function telaBackup() {
  const ultima = banco.ultimaExportacao();
  pagina.innerHTML = `
    <h1>Exportar / importar</h1>
    <p class="alerta">Seus dados ficam só neste navegador, neste aparelho. Limpar o histórico do navegador ou trocar de
      navegador começa tudo do zero: exporte de vez em quando e guarde o arquivo no Drive ou no e-mail.</p>
    <div class="painel">
      <h2 style="margin-top:0">Exportar meus dados</h2>
      <p>Baixa um arquivo <code>.db</code> com tudo: orçamentos, PDFs, filamentos, parâmetros, a sua marca e o tema.</p>
      <div class="acoes"><button class="primario" id="exportar">Exportar meus dados</button></div>
      <p class="ajuda">${ultima ? `Última exportação: ${h(dataBR(ultima))} às ${h(ultima.slice(11, 16))}.` : "Você ainda não exportou."}</p>
    </div>
    <h2>Vai trocar de navegador ou de computador?</h2>
    <ol class="painel" style="padding-left:36px;margin:0">
      <li>Aqui, clique em <strong>Exportar meus dados</strong>.</li>
      <li>Abra a Minha Calculadora 3D no outro navegador.</li>
      <li>Lá, em <strong>Exportar / importar</strong>, escolha o arquivo e clique em <strong>Importar</strong>.</li>
    </ol>
    <h2>Importar dados</h2>
    <div class="painel">
      <p><strong>Isso substitui todos os dados deste navegador</strong> pelos do arquivo.</p>
      <label>Arquivo exportado (.db)<input type="file" id="arquivo" accept=".db" /></label>
      <div class="acoes"><button id="importar">Importar</button></div>
    </div>
    <h2>Apagar dados</h2>
    <div class="painel">
      <p style="margin-top:0">Apaga tudo deste navegador: orçamentos, PDFs, vendas, propostas, filamentos, parâmetros, a marca, o tema e a pasta escolhida.
        O site volta como novo. <strong>Não dá para desfazer</strong>: exporte antes se quiser guardar alguma coisa.</p>
      <div class="acoes"><button class="perigo" id="apagar">Apagar todos os dados</button></div>
    </div>`;
  $("#apagar").onclick = async () => {
    if (!confirm("Apagar TODOS os dados deste navegador? Não dá para desfazer.")) return;
    if ((prompt('Para confirmar, digite APAGAR') || "").trim().toUpperCase() !== "APAGAR") return avisar("Nada foi apagado.");
    try { await banco.apagarTudo(); } catch (erro) { return avisar(`Não consegui apagar: ${erro.message}`, true); }
    avisar("Dados apagados. O site está zerado.");
    if (location.hash === "#/") rotear(); else location.hash = "#/";
  };
  $("#exportar").onclick = async () => {
    const nome = `minha-calculadora-3d_${hojeIso()}.db`, anterior = banco.ultimaExportacao();
    const bytes = banco.exportar();  // a data da exportação já vai dentro do arquivo
    if ("showSaveFilePicker" in window) {
      // Chrome/Edge: a pessoa escolhe onde salvar; se cancelar, a data volta e o lembrete continua valendo
      try {
        const arquivo = await showSaveFilePicker({ suggestedName: nome, id: "exportar-dados" });
        const escrita = await arquivo.createWritable();
        await escrita.write(bytes);
        await escrita.close();
      } catch (erro) {
        banco.voltarExportacao(anterior);
        if (erro.name !== "AbortError") avisar(`Não consegui salvar o arquivo: ${erro.message}`, true);
        return telaBackup();
      }
    } else baixar(bytes, nome, "application/octet-stream");
    avisar("Dados exportados. Guarde o arquivo no Drive, no e-mail ou num pendrive.");
    telaBackup();
  };
  $("#importar").onclick = async () => {
    const f = $("#arquivo").files[0];
    if (!f) return avisar("Escolha o arquivo .db primeiro.", true);
    if (!confirm("Substituir TODOS os dados deste navegador pelos do arquivo?")) return;
    try {
      await banco.restaurar(new Uint8Array(await f.arrayBuffer()));
      avisar("Dados importados.");
      location.hash = "#/";
    } catch (erro) { avisar(erro.message, true); }
  };
}

// ================================================================= rotas
/** O nome da marca da pessoa no topo do site, depois do nome do app. */
function atualizarCabecalho() {
  const nome = banco.lerMarca().nome;
  $("#nome-marca").textContent = nome || "";
  document.title = nome ? `${nome} · Minha Calculadora 3D` : "Minha Calculadora 3D";
}

function rotear() {
  pagina.onchange = pagina.onclick = null;  // cada tela liga os seus
  aplicarTema(banco.lerTema(), banco.lerMarca().cor);  // o salvo: desfaz prévia não salva e vale após importar
  atualizarCabecalho();
  const [, rota, id] = location.hash.split("/");
  const telas = { "": telaInicio, orcamentos: telaOrcamentos, orcamento: () => telaOrcamento(Number(id)),
                  propostas: telaPropostas, vendas: telaVendas, filamentos: telaFilamentos,
                  parametros: telaParametros, marca: telaMarca, backup: telaBackup };
  const menu = rota === "orcamento" ? "orcamentos" : rota || "";
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("ativo", a.getAttribute("href") === `#/${menu}`));
  (telas[rota || ""] || telaInicio)();
  scrollTo(0, 0);
}

try {
  await banco.abrir();
  addEventListener("hashchange", rotear);
  rotear();
} catch (erro) {
  pagina.innerHTML = `<p class="alerta">Não consegui abrir o app neste navegador: ${h(erro.message)}.
    Se estiver em janela anônima, alguns navegadores bloqueiam o armazenamento.</p>`;
}

// Telas do Custos 3D. Rotas por hash: #/ (orçamentos), #/orcamento/ID, #/filamentos, #/parametros,
// #/marca, #/backup. Cada tela monta o HTML e liga os eventos; os dados vão direto para o banco (banco.js).
import * as banco from "./banco.js";
import { brl, composicao, dataBR, horas, num, valorDificuldade } from "./custos.js";
import { nomeDaCor } from "./cores.js";
import { ArquivoNaoFatiado, ler3mf, sha1 } from "./leitor3mf.js";
import { pdfCliente, pdfExemplo } from "./pdf.js";
import { TEMAS, aplicarTema } from "./tema.js";

const $ = (s, el = document) => el.querySelector(s);
const pagina = $("#pagina");
// Todo valor vindo do banco ou de arquivo passa por h() antes de entrar no HTML: um .db importado pode trazer qualquer coisa
const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const corSegura = (c) => (banco.ehHex(c) ? c : "#808080");  // cor em style=: só hex

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
    <p class="fraco">Arraste os arquivos fatiados do Bambu Studio (<code>.gcode.3mf</code>). Cada arquivo vira um orçamento.</p>
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
          <td><span class="etiqueta">${STATUS[o.status] || h(o.status)}${o.pdf_em ? " · PDF" : ""}</span></td></tr>`;
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
        // Arquivo ainda sendo gravado pelo Bambu Studio, bloqueado ou só na nuvem: aparece, mas não derruba a lista
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
    <p><a href="#/">← Orçamentos</a></p>
    <h1>#${h(orc.id)} ${h(orc.nome)}</h1>
    ${travado ? `<p class="alerta">Impresso em ${h(dataBR(orc.impresso_em))}: os valores estão congelados. Para mudar, duplique o orçamento importando o arquivo de novo.</p>` : ""}
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
    <div id="custo"></div>`;

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
    const excluir = $("#excluir");
    if (excluir) excluir.onclick = () => {
      if (!confirm(`Excluir o orçamento #${orc.id} ${orc.nome}? Não dá para desfazer.`)) return;
      try { banco.excluirOrcamento(orc.id); location.hash = "#/"; avisar("Orçamento excluído."); }
      catch (erro) { avisar(erro.message, true); }
    };
  }
  mostrarCusto();

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
  };
}

// ================================================================= filamentos
function telaFilamentos() {
  const rolos = banco.listarRolos(), p = banco.lerParametros();
  pagina.innerHTML = `
    <h1>Filamentos</h1>
    <p class="fraco">Cada rolo físico é um registro com saldo próprio. Acerte o saldo pela balança com o botão Pesar.</p>
    <form id="novo" class="painel"><h2 style="margin-top:0">Cadastrar rolo</h2><div class="grade">
      <label>Marca<input name="marca" required placeholder="Bambu, Voolt..." /></label>
      <label>Tipo<input name="tipo" required placeholder="PLA, PETG..." /></label>
      <label>Linha<input name="linha" placeholder="Basic, Matte, Silk..." /></label>
      <label>Nome da cor<input name="cor_nome" placeholder="Preto" /></label>
      <label>Cor<input name="cor_hex" type="color" value="#000000" /><span class="ajuda">A mesma do Bambu Studio, para a sugestão acertar.</span></label>
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
        <td><button data-pesar="${h(r.id)}">Pesar</button> <button data-arquivar="${h(r.id)}" data-ativo="${r.ativo ? 1 : 0}">${r.ativo ? "Arquivar" : "Reativar"}</button></td>
      </tr>`).join("")}</tbody></table></div>` : `<p class="fraco">Nenhum rolo ainda.</p>`}`;

  $("#novo").onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    banco.inserirRolo({ ...d, peso_inicial_g: parseFloat(d.peso_inicial_g), preco_pago: parseFloat(String(d.preco_pago).replace(",", ".")) });
    avisar("Rolo cadastrado.");
    telaFilamentos();
  };
  pagina.onclick = (e) => {
    const b = e.target.closest("button[data-pesar], button[data-arquivar]");
    if (!b) return;
    if (b.dataset.arquivar) banco.arquivarRolo(Number(b.dataset.arquivar), b.dataset.ativo !== "1");
    else {
      const g = prompt("Quanto o filamento pesa agora, sem o carretel (g)?");
      if (g === null || isNaN(parseFloat(g.replace(",", ".")))) return;
      banco.ajustarSaldo(Number(b.dataset.pesar), parseFloat(g.replace(",", ".")));
      avisar("Saldo ajustado.");
    }
    telaFilamentos();
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
    <p class="fraco">Vai no cabeçalho dos orçamentos. O que ficar vazio não aparece.</p>
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
      <li>Abra o Custos 3D no outro navegador.</li>
      <li>Lá, em <strong>Exportar / importar</strong>, escolha o arquivo e clique em <strong>Importar</strong>.</li>
    </ol>
    <h2>Importar dados</h2>
    <div class="painel">
      <p><strong>Isso substitui todos os dados deste navegador</strong> pelos do arquivo.</p>
      <label>Arquivo exportado (.db)<input type="file" id="arquivo" accept=".db" /></label>
      <div class="acoes"><button id="importar">Importar</button></div>
    </div>`;
  $("#exportar").onclick = async () => {
    const nome = `custos3d_${new Date().toISOString().slice(0, 10)}.db`, anterior = banco.ultimaExportacao();
    const bytes = banco.exportar();  // a data da exportação já vai dentro do arquivo
    if ("showSaveFilePicker" in window) {
      // Chrome/Edge: a pessoa escolhe onde salvar; se cancelar, a data volta e o lembrete continua valendo
      try {
        const arquivo = await showSaveFilePicker({ suggestedName: nome, id: "custos3d-exportar" });
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
function rotear() {
  pagina.onchange = pagina.onclick = null;  // cada tela liga os seus
  aplicarTema(banco.lerTema(), banco.lerMarca().cor);  // o salvo: desfaz prévia não salva e vale após importar
  const [, rota, id] = location.hash.split("/");
  const telas = { "": telaOrcamentos, orcamento: () => telaOrcamento(Number(id)), filamentos: telaFilamentos,
                  parametros: telaParametros, marca: telaMarca, backup: telaBackup };
  document.querySelectorAll("nav a").forEach((a) =>
    a.classList.toggle("ativo", a.getAttribute("href") === `#/${rota === "orcamento" ? "" : rota || ""}`));
  (telas[rota || ""] || telaOrcamentos)();
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

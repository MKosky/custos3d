// Banco SQLite no navegador (sql.js). O arquivo .db inteiro fica no IndexedDB do navegador de cada pessoa;
// exportar/importar leva esse arquivo para outro navegador. initSqlJs vem do index.html.
import { PARAMETROS_PADRAO, calcular } from "./custos.js";
import { distancia } from "./cores.js";
import { TEMA_PADRAO } from "./tema.js";

// Coluna nova: entra também em COLUNAS_NOVAS_ORCAMENTOS, para bancos já exportados ganharem a coluna.
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS parametros (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS embalagens (
    id    INTEGER PRIMARY KEY,
    nome  TEXT NOT NULL UNIQUE,
    custo REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rolos (
    id             INTEGER PRIMARY KEY,
    marca          TEXT NOT NULL,
    tipo           TEXT NOT NULL,
    linha          TEXT,
    cor_nome       TEXT,
    cor_hex        TEXT,
    peso_inicial_g REAL NOT NULL,
    preco_pago     REAL NOT NULL,
    data_compra    TEXT,
    ativo          INTEGER NOT NULL DEFAULT 1,
    obs            TEXT,
    criado_em      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orcamentos (
    id              INTEGER PRIMARY KEY,
    criado_em       TEXT NOT NULL,
    arquivo         TEXT,
    hash            TEXT,
    nome            TEXT,
    titulo_original TEXT,
    designer        TEXT,
    licenca         TEXT,
    embalagem_id    INTEGER REFERENCES embalagens(id) ON DELETE SET NULL,
    unidades        INTEGER NOT NULL DEFAULT 1,
    perc_lucro      REAL,
    status          TEXT NOT NULL DEFAULT 'orcamento'
                    CHECK (status IN ('orcamento', 'impresso', 'cancelado')),
    impresso_em     TEXT,
    resultado_json  TEXT,
    obs             TEXT,                -- observação interna
    obs_cliente     TEXT,                -- vai no PDF do cliente
    cliente         TEXT,
    cliente_contato TEXT,
    mao_obra_min    REAL,                -- por peça
    dificuldade     INTEGER,             -- 0 a 5, valor em Parâmetros
    pecas_compradas REAL,                -- R$ por peça (argola, ímã, base...)
    validade_dias   INTEGER,
    prazo_dias      INTEGER,
    marketplace     INTEGER,             -- 1 = vai para o marketplace (soma a comissão dele)
    vendedor        INTEGER,             -- 1 = alguém vendeu por você (soma a comissão de vendedor)
    qtd_pedido      INTEGER,             -- peças que o cliente quer; NULL = as peças de uma impressão
    venda           INTEGER,             -- 1 = virou venda, 0 = não virou, NULL = sem resposta
    preco_enviado   REAL,                -- preço por peça do último PDF gerado (o que o cliente recebeu)
    pdf_em          TEXT,
    pdf_cliente     BLOB,
    pdf_interno     BLOB,
    capa            BLOB
);
CREATE TABLE IF NOT EXISTS placas (
    id           INTEGER PRIMARY KEY,
    orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
    indice       INTEGER NOT NULL,
    tempo_s      INTEGER NOT NULL,
    peso_g       REAL NOT NULL,
    incluir      INTEGER NOT NULL DEFAULT 1,
    objetos      TEXT,
    miniatura    BLOB
);
CREATE TABLE IF NOT EXISTS linhas_filamento (
    id       INTEGER PRIMARY KEY,
    placa_id INTEGER NOT NULL REFERENCES placas(id) ON DELETE CASCADE,
    slot     INTEGER,
    tipo     TEXT,
    cor_hex  TEXT,
    perfil   TEXT,
    gramas   REAL NOT NULL,
    rolo_id  INTEGER REFERENCES rolos(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS movimentos (
    id           INTEGER PRIMARY KEY,
    rolo_id      INTEGER NOT NULL REFERENCES rolos(id),
    data         TEXT NOT NULL,
    gramas       REAL NOT NULL,          -- negativo = saiu do rolo
    tipo         TEXT NOT NULL CHECK (tipo IN ('impressao', 'ajuste', 'perda')),
    orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL,
    obs          TEXT
);
CREATE TABLE IF NOT EXISTS vendas (      -- um orçamento pode vender várias vezes
    id           INTEGER PRIMARY KEY,
    orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id),  -- sem cascata: orçamento com venda não é excluído
    data         TEXT NOT NULL,
    qtd          INTEGER NOT NULL,
    valor        REAL NOT NULL,          -- o que entrou para você, já sem taxas
    canal        TEXT NOT NULL,
    custo_unit   REAL NOT NULL           -- custo geral por peça, congelado ao registrar a venda
);
CREATE TABLE IF NOT EXISTS propostas (   -- vários orçamentos num PDF só, para o mesmo cliente
    id              INTEGER PRIMARY KEY,
    criado_em       TEXT NOT NULL,
    cliente         TEXT,
    cliente_contato TEXT,
    orcamentos      TEXT NOT NULL,       -- ids em JSON, na ordem do PDF
    validade_dias   INTEGER,
    prazo_dias      INTEGER,
    obs_cliente     TEXT,
    total           REAL,                -- calculado ao gerar o PDF
    pdf_em          TEXT,
    pdf             BLOB
);
CREATE VIEW IF NOT EXISTS v_rolos AS
SELECT r.*,
       r.peso_inicial_g + COALESCE((SELECT SUM(m.gramas) FROM movimentos m WHERE m.rolo_id = r.id), 0)
           AS saldo_g,
       r.preco_pago / r.peso_inicial_g AS preco_g
FROM rolos r;
`;

const COLUNAS_NOVAS_ORCAMENTOS = [
  ["obs_cliente", "TEXT"], ["validade_dias", "INTEGER"], ["prazo_dias", "INTEGER"], ["venda", "INTEGER"],
  ["pdf_em", "TEXT"], ["pdf_cliente", "BLOB"], ["pdf_interno", "BLOB"], ["cliente", "TEXT"], ["cliente_contato", "TEXT"],
  ["mao_obra_min", "REAL"], ["dificuldade", "INTEGER"], ["pecas_compradas", "REAL"], ["marketplace", "INTEGER"],
  ["vendedor", "INTEGER"], ["qtd_pedido", "INTEGER"], ["preco_enviado", "REAL"],
];
const EMBALAGENS_INICIAIS = [["Nenhuma", 0], ["Chaveiro", 0.7], ["Saco", 2]];
// Campos do orçamento que a tela pode mudar (a lista branca protege o UPDATE montado com o nome da coluna)
export const CAMPOS_ORCAMENTO = ["nome", "embalagem_id", "unidades", "perc_lucro", "obs", "obs_cliente",
  "validade_dias", "prazo_dias", "cliente", "cliente_contato", "mao_obra_min", "dificuldade", "pecas_compradas",
  "marketplace", "vendedor", "qtd_pedido"];
export const CAMPOS_MARCA = { nome: "Nome da empresa", documento: "CNPJ ou CPF", instagram: "Instagram",
  whatsapp: "WhatsApp / telefone", email: "E-mail", site: "Site", local: "Cidade / endereço" };
export const COR_PADRAO = "#621DA6";

let SQL, db, timer, conexao, avisouFalha = false;
// Outra aba gravou: esta recarrega para não gravar por cima com dados velhos (se não tiver nada pendente)
const canal = globalThis.BroadcastChannel ? new BroadcastChannel("custos3d") : null;
if (canal) canal.onmessage = () => !timer && location.reload();
export const ehHex = (c) => /^#[0-9a-f]{6}$/i.test(c ?? "");
const agora = () => {
  const d = new Date(), z = (n) => String(n).padStart(2, "0");  // hora local
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
};

// ---------------------------------------------------------------- IndexedDB (onde o .db fica guardado)
const abrirConexao = () => new Promise((ok, erro) => {
  const req = indexedDB.open("custos3d", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("arquivos");
  req.onsuccess = () => ok(req.result);
  req.onerror = () => erro(req.error);
});

/** Uma transação na conexão aberta em abrir(): começa na hora, o que permite gravar ao fechar a aba. */
const idb = (modo, acao) => new Promise((ok, erro) => {
  const tx = conexao.transaction("arquivos", modo), r = acao(tx.objectStore("arquivos"));
  tx.oncomplete = () => ok(r.result);
  tx.onerror = tx.onabort = () => erro(tx.error);
});

/** db.export() fecha e reabre o banco, o que desliga as chaves estrangeiras (e o ON DELETE CASCADE): religa. */
function bytesDoBanco() {
  const bytes = db.export();
  db.exec("PRAGMA foreign_keys = ON");
  return bytes;
}

function gravar() {
  clearTimeout(timer);
  timer = null;
  return idb("readwrite", (s) => s.put(bytesDoBanco(), "banco"))
    .then(() => canal?.postMessage("gravou"))
    .catch((e) => {
      if (!avisouFalha) {  // navegador sem espaço ou bloqueando: avisa uma vez, senão a pessoa perde tudo sem saber
        avisouFalha = true;
        alert(`Não consegui salvar neste navegador (${e?.message || e}). Exporte seus dados em Exportar / importar.`);
      }
      throw e;
    });
}

/** Grava o banco no IndexedDB. Escritas seguidas viram uma só gravação. */
export function persistir(jaJa = false) {
  if (jaJa) return gravar();
  clearTimeout(timer);
  timer = setTimeout(() => gravar().catch(() => {}), 300);
}
// Ao esconder ou fechar a aba: tira o foco (dispara o "change" do campo que estava sendo editado) e grava já
function aoSair() {
  document.activeElement?.blur?.();
  if (timer) gravar().catch(() => {});
}
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && aoSair());
addEventListener("pagehide", aoSair);

/** Outras coisas deste navegador que não vão no .db: a pasta escolhida em Orçamentos e o cache dela. */
export const guardarNoNavegador = (chave, valor) => idb("readwrite", (s) => s.put(valor, chave));
export const lerDoNavegador = (chave) => idb("readonly", (s) => s.get(chave));

export async function abrir() {
  if (typeof initSqlJs === "undefined")
    throw new Error("não consegui baixar o sql.js de cdn.jsdelivr.net (confira a internet ou o bloqueador de anúncios)");
  conexao = await abrirConexao();
  SQL = await initSqlJs({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/sql.js@1.15.2/dist/${f}` });
  const salvo = await idb("readonly", (s) => s.get("banco"));
  db = new SQL.Database(salvo || undefined);
  criarTabelas();
  navigator.storage?.persist?.();  // pede ao navegador para não apagar os dados quando faltar espaço
  if (!salvo) await persistir(true);
}

// ---------------------------------------------------------------- consultas
const limpar = (params) => params.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
export function linhas(sql, params = []) {
  const st = db.prepare(sql);
  st.bind(limpar(params));
  const saida = [];
  while (st.step()) saida.push(st.getAsObject());
  st.free();
  return saida;
}
const um = (sql, params) => linhas(sql, params)[0];
function rodar(sql, params = []) {
  db.run(sql, limpar(params));
  persistir();
  return um("SELECT last_insert_rowid() AS id").id;
}

function criarTabelas() {
  // A view é recriada sempre: um .db importado não pode trazer uma v_rolos diferente
  db.exec("PRAGMA foreign_keys = ON; DROP VIEW IF EXISTS v_rolos;" + ESQUEMA);
  const colunas = new Set(linhas("PRAGMA table_info(orcamentos)").map((c) => c.name));
  for (const [nome, tipo] of COLUNAS_NOVAS_ORCAMENTOS)
    if (!colunas.has(nome)) db.run(`ALTER TABLE orcamentos ADD COLUMN ${nome} ${tipo}`);
  const existentes = new Set(linhas("SELECT chave FROM parametros").map((r) => r.chave));
  for (const [chave, valor] of Object.entries(PARAMETROS_PADRAO))
    if (!existentes.has(chave)) db.run("INSERT INTO parametros (chave, valor) VALUES (?, ?)", [chave, texto(valor)]);
  if (!um("SELECT COUNT(*) AS n FROM embalagens").n)
    for (const e of EMBALAGENS_INICIAIS) db.run("INSERT INTO embalagens (nome, custo) VALUES (?, ?)", e);
  limparOrfaos();
}

// ---------------------------------------------------------------- parâmetros e marca
// Booleanos como "True"/"False": o formato dos bancos da primeira versão, que continuam importáveis
const texto = (v) => (typeof v === "boolean" ? (v ? "True" : "False") : String(v));
const gravarChave = (chave, valor) =>
  rodar("INSERT INTO parametros (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        [chave, valor]);

export function lerParametros() {
  const salvos = Object.fromEntries(linhas("SELECT chave, valor FROM parametros").map((r) => [r.chave, r.valor]));
  return Object.fromEntries(Object.entries(PARAMETROS_PADRAO).map(([k, padrao]) => {
    const v = salvos[k];
    if (v == null) return [k, padrao];
    if (typeof padrao === "boolean") return [k, ["True", "1", "true"].includes(v)];
    return [k, typeof padrao === "string" ? v : parseFloat(v)];
  }));
}
export const salvarParametros = (p) => Object.entries(p).forEach(([k, v]) => gravarChave(k, texto(v)));

export function lerMarca() {
  const salvos = Object.fromEntries(linhas("SELECT chave, valor FROM parametros WHERE substr(chave, 1, 6) = 'marca_'")
    .map((r) => [r.chave.slice(6), r.valor]));
  return { ...Object.fromEntries(Object.keys(CAMPOS_MARCA).map((k) => [k, ""])), logo: null, ...salvos,
           cor: ehHex(salvos.cor) ? salvos.cor : COR_PADRAO };  // a cor vai em style= e no PDF: só hex
}
/** logo: null apaga a logo. */
export const salvarMarca = (marca) => Object.entries(marca).forEach(([k, v]) =>
  v === null ? rodar("DELETE FROM parametros WHERE chave = ?", [`marca_${k}`]) : gravarChave(`marca_${k}`, v));

/** Tema do site: {modo: "auto"|"escuro"|"claro", cor: hex ou "marca"}. Fica no banco para ir junto na exportação. */
export function lerTema() {
  const t = Object.fromEntries(linhas("SELECT chave, valor FROM parametros WHERE chave IN ('tema_modo', 'tema_cor')")
    .map((r) => [r.chave.slice(5), r.valor]));
  return { modo: ["auto", "escuro", "claro"].includes(t.modo) ? t.modo : TEMA_PADRAO.modo,
           cor: t.cor === "marca" || ehHex(t.cor) ? t.cor : TEMA_PADRAO.cor };
}
export const salvarTema = ({ modo, cor }) => { gravarChave("tema_modo", modo); gravarChave("tema_cor", cor); };

// ---------------------------------------------------------------- embalagens
export const listarEmbalagens = () => linhas("SELECT id, nome, custo FROM embalagens ORDER BY custo, nome");
export const salvarEmbalagem = (id, nome, custo) => id
  ? rodar("UPDATE embalagens SET nome = ?, custo = ? WHERE id = ?", [nome, custo, id])
  : rodar("INSERT INTO embalagens (nome, custo) VALUES (?, ?)", [nome, custo]);
export const excluirEmbalagem = (id) => rodar("DELETE FROM embalagens WHERE id = ?", [id]);

// ---------------------------------------------------------------- rolos
export const listarRolos = (apenasAtivos = false) =>
  linhas(`SELECT * FROM v_rolos ${apenasAtivos ? "WHERE ativo = 1" : ""} ORDER BY ativo DESC, tipo, cor_nome, id`);
export const rotuloRolo = (r) => `#${r.id} ${r.marca} ${r.tipo} ${r.cor_nome || ""}`.trim() + (r.ativo ? "" : " (arquivado)");

export function inserirRolo({ marca, tipo, linha, cor_nome, cor_hex, peso_inicial_g, preco_pago, data_compra, quantidade }) {
  for (let i = 0; i < Math.max(parseInt(quantidade) || 1, 1); i++)
    rodar(`INSERT INTO rolos (marca, tipo, linha, cor_nome, cor_hex, peso_inicial_g, preco_pago, data_compra, obs, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)`,
          [marca.trim(), tipo.trim().toUpperCase(), linha.trim(), cor_nome.trim(), cor_hex.toUpperCase(),
           peso_inicial_g, preco_pago, data_compra, agora()]);
}
export const arquivarRolo = (id, ativo) => rodar("UPDATE rolos SET ativo = ? WHERE id = ?", [ativo ? 1 : 0, id]);
/** Depois de pesar o rolo: registra a diferença para o saldo bater com a balança. */
export function ajustarSaldo(id, novoSaldo) {
  const diferenca = novoSaldo - um("SELECT saldo_g FROM v_rolos WHERE id = ?", [id]).saldo_g;
  if (Math.abs(diferenca) > 1e-9)
    rodar("INSERT INTO movimentos (rolo_id, data, gramas, tipo, obs) VALUES (?, ?, ?, 'ajuste', 'Pesagem')",
          [id, agora(), diferenca]);
}

/** Rolo ativo do mesmo tipo e cor mais parecida; entre iguais, o de MENOS saldo que ainda dá conta. */
export function sugerirRolo(tipo, cor, gramas, rolos) {
  const candidatos = rolos
    .filter((r) => r.ativo && (r.tipo || "").toUpperCase() === (tipo || "").toUpperCase() && r.saldo_g > 0)
    .map((r) => ({ r, dist: distancia(r.cor_hex || "#808080", cor), falta: r.saldo_g < gramas }))
    .filter((c) => c.dist <= 120)  // mais longe que isso já é outra cor
    .sort((a, b) => a.dist - b.dist || a.falta - b.falta || a.r.saldo_g - b.r.saldo_g);
  return candidatos[0]?.r.id ?? null;
}

// ---------------------------------------------------------------- orçamentos
export const orcamentoDoArquivo = (hash) => um("SELECT id FROM orcamentos WHERE hash = ? ORDER BY id LIMIT 1", [hash])?.id;

export function criarOrcamento(arq) {
  const p = lerParametros(), rolos = listarRolos(true);
  db.exec("BEGIN");
  try {
    const emb = um("SELECT id FROM embalagens WHERE nome = 'Nenhuma'");
    const id = rodar(`INSERT INTO orcamentos (criado_em, arquivo, hash, nome, titulo_original, designer, licenca,
                                              embalagem_id, unidades, perc_lucro, capa)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
                     [agora(), arq.arquivo, arq.hash, arq.nome, arq.titulo, arq.designer, arq.licenca, emb?.id,
                      p.perc_lucro, arq.capa]);
    for (const placa of arq.placas) {
      const placaId = rodar(`INSERT INTO placas (orcamento_id, indice, tempo_s, peso_g, objetos, miniatura)
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [id, placa.indice, placa.tempo_s, placa.peso_g, JSON.stringify(placa.objetos), placa.miniatura]);
      for (const f of placa.filamentos)
        rodar(`INSERT INTO linhas_filamento (placa_id, slot, tipo, cor_hex, perfil, gramas, rolo_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [placaId, f.slot, f.tipo, f.cor_hex, f.perfil, f.gramas, sugerirRolo(f.tipo, f.cor_hex, f.gramas, rolos)]);
    }
    db.exec("COMMIT");
    return id;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export const listarOrcamentos = () =>
  linhas(`SELECT id, criado_em, nome, cliente, status, pdf_em, capa FROM orcamentos ORDER BY id DESC`);

export function carregarOrcamento(id) {
  const orc = um("SELECT * FROM orcamentos WHERE id = ?", [id]);
  if (!orc) return null;
  orc.placas = linhas("SELECT id, indice, tempo_s, peso_g, incluir, objetos, miniatura FROM placas " +
                      "WHERE orcamento_id = ? ORDER BY indice", [id]);
  orc.linhas = linhas(`SELECT l.id, p.indice AS placa, l.slot, l.tipo, l.cor_hex, l.perfil, l.gramas, l.rolo_id
                       FROM linhas_filamento l JOIN placas p ON p.id = l.placa_id
                       WHERE p.orcamento_id = ? ORDER BY p.indice, l.slot`, [id]);
  return orc;
}

export function atualizarOrcamento(id, campo, valor) {
  if (!CAMPOS_ORCAMENTO.includes(campo)) throw new Error(`Campo desconhecido: ${campo}`);
  if (um("SELECT status FROM orcamentos WHERE id = ?", [id]).status === "impresso")
    throw new Error("Orçamento já impresso: os valores estão congelados.");
  rodar(`UPDATE orcamentos SET ${campo} = ? WHERE id = ?`, [valor, id]);
}
export const incluirPlaca = (placaId, incluir) => rodar("UPDATE placas SET incluir = ? WHERE id = ?", [incluir ? 1 : 0, placaId]);
export const escolherRolo = (linhaId, roloId) => rodar("UPDATE linhas_filamento SET rolo_id = ? WHERE id = ?", [roloId, linhaId]);

export function excluirOrcamento(id) {
  const o = um("SELECT status, (SELECT COUNT(*) FROM vendas WHERE orcamento_id = ?) AS vendas FROM orcamentos WHERE id = ?", [id, id]);
  if (o.status === "impresso") throw new Error("Orçamento impresso não pode ser excluído (o estoque já saiu dele).");
  if (o.vendas) throw new Error("Este orçamento tem venda registrada e não pode ser excluído.");
  rodar("DELETE FROM orcamentos WHERE id = ?", [id]);
}

export const quantidade = (orc) => Math.max(parseInt(orc.qtd_pedido || orc.unidades || 1), 1);

/** [resultado, parametros]. Impresso: os valores congelados na confirmação; em aberto: o cálculo de agora. */
export function resultadoAtual(orc, p = lerParametros(), rolos = listarRolos()) {
  if (orc.resultado_json) {
    const c = JSON.parse(orc.resultado_json);
    return [c.resultado, { ...PARAMETROS_PADRAO, ...c.parametros }];
  }
  const precoG = Object.fromEntries(rolos.map((r) => [r.id, r.preco_g]));
  const incluidas = orc.placas.filter((pl) => pl.incluir);
  const indices = new Set(incluidas.map((pl) => pl.indice));
  const linhasCusto = orc.linhas.filter((l) => indices.has(l.placa)).map((l) => [l.gramas, precoG[l.rolo_id] ?? null]);
  const emb = um("SELECT custo FROM embalagens WHERE id = ?", [orc.embalagem_id])?.custo || 0;
  const r = calcular(linhasCusto, incluidas.reduce((s, pl) => s + pl.tempo_s, 0), emb, orc.unidades || 1,
    orc.perc_lucro ?? p.perc_lucro, p, { maoObraMin: orc.mao_obra_min, dificuldade: orc.dificuldade,
      pecasCompradas: orc.pecas_compradas, marketplace: !!orc.marketplace, vendedor: !!orc.vendedor });
  return [r, p];
}

/** preco: o preço por peça que foi no PDF, para a venda usar o que o cliente recebeu. */
export const salvarPdf = (id, pdf, preco) =>
  rodar("UPDATE orcamentos SET pdf_em = ?, pdf_cliente = ?, preco_enviado = ? WHERE id = ?", [agora(), pdf, preco, id]);

// ---------------------------------------------------------------- backup
/** O .db para levar a outro navegador. A data vai junto, para o lembrete de exportar contar a partir dela. */
export function exportar() {
  gravarChave("ultima_exportacao", agora());
  return bytesDoBanco();
}
/** A pessoa cancelou onde salvar: volta a data anterior, para o lembrete continuar valendo. */
export const voltarExportacao = (anterior) => (anterior
  ? gravarChave("ultima_exportacao", anterior) : rodar("DELETE FROM parametros WHERE chave = 'ultima_exportacao'"));
export const ultimaExportacao = () => um("SELECT valor FROM parametros WHERE chave = 'ultima_exportacao'")?.valor ?? null;
export const temOrcamentos = () => !!um("SELECT 1 AS x FROM orcamentos LIMIT 1");

/** Remove o lixo que a exclusão deixava enquanto o ON DELETE CASCADE estava desligado. Um orçamento novo pode ter
 *  herdado o id de um excluído junto com as placas velhas: fica só a placa mais nova de cada número. */
function limparOrfaos() {
  db.run(`DELETE FROM placas WHERE EXISTS (SELECT 1 FROM placas q WHERE q.orcamento_id = placas.orcamento_id
            AND q.indice = placas.indice AND q.id > placas.id)`);
  db.run("DELETE FROM placas WHERE orcamento_id NOT IN (SELECT id FROM orcamentos)");
  db.run("DELETE FROM linhas_filamento WHERE placa_id NOT IN (SELECT id FROM placas)");
  db.run("UPDATE orcamentos SET embalagem_id = NULL WHERE embalagem_id NOT IN (SELECT id FROM embalagens)");
  db.run("UPDATE linhas_filamento SET rolo_id = NULL WHERE rolo_id NOT IN (SELECT id FROM rolos)");
}

/** Troca o banco atual por um .db exportado deste app. Só troca depois de conferir; se algo falhar, fica o atual. */
export async function restaurar(bytes) {
  const invalido = () => new Error("Esse arquivo não é um backup do Custos 3D.");
  let novo;
  try {
    novo = new SQL.Database(bytes);
    const valor = (sql) => novo.exec(sql)[0]?.values[0]?.[0];
    if (valor("PRAGMA quick_check") !== "ok" || !valor("SELECT 1 FROM sqlite_master WHERE name = 'orcamentos'")
        || valor("SELECT 1 FROM sqlite_master WHERE type = 'trigger'")) throw invalido();  // o app não usa triggers
  } catch {
    novo?.close();
    throw invalido();
  }
  const antigo = db;
  db = novo;
  try {
    criarTabelas();  // backup de uma versão antiga ganha as colunas novas
  } catch {
    db = antigo;
    novo.close();
    throw invalido();
  }
  antigo.close();
  await persistir(true);
}

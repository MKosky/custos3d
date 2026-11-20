// Leitura do .gcode.3mf (arquivo de placa fatiada com o G-code dentro).
// O .3mf é um zip: slice_info.config (tempo, peso e filamentos por placa), project_settings.config
// (perfis), 3dmodel.model (título, designer, licença) e as miniaturas PNG. JSZip vem do index.html.

export class ArquivoNaoFatiado extends Error {}

const normalizarCor = (cor) => {
  if (!cor) return "#808080";
  cor = cor.trim().toUpperCase();
  return (cor.startsWith("#") ? cor : "#" + cor).slice(0, 7); // '#61B0FF80' (com transparência) vira '#61B0FF'
};

export function nomeAmigavel(nome) {
  for (const sufixo of [".gcode.3mf", "_gcode.3mf", ".3mf"])
    if (nome.toLowerCase().endsWith(sufixo)) return nome.slice(0, -sufixo.length);
  return nome;
}

export async function sha1(bytes) {
  const h = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const xml = (texto) => new DOMParser().parseFromString(texto, "application/xml");

/** file: File do <input> ou do arrastar. Devolve o arquivo com as placas. */
export async function ler3mf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ArquivoNaoFatiado(`${file.name} não é um .3mf válido.`);
  }
  const texto = async (nome) => (zip.file(nome) ? zip.file(nome).async("string") : null);
  const binario = async (nome) => (zip.file(nome) ? zip.file(nome).async("uint8array") : null);

  const info = await texto("Metadata/slice_info.config");
  if (!info)
    throw new ArquivoNaoFatiado(`${file.name} não tem dados de fatiamento: só arquivos .gcode.3mf são aceitos. No fatiador, fatie o projeto e ` +
      "exporte com 'Exportar arquivo de placa fatiada' (.gcode.3mf).");

  let perfis = [];
  try { perfis = JSON.parse((await texto("Metadata/project_settings.config")) || "{}").filament_settings_id || []; }
  catch { /* sem perfis: só o nome do perfil fica vazio */ }

  const meta = {};
  const modelo = await texto("3D/3dmodel.model");
  if (modelo)
    for (const m of xml(modelo).documentElement?.children || [])
      if (m.localName === "metadata" && m.getAttribute("name")) meta[m.getAttribute("name")] = m.textContent.trim();

  const placas = [];
  for (const p of xml(info).querySelectorAll("plate")) {
    const md = Object.fromEntries([...p.children].filter((e) => e.localName === "metadata")
      .map((e) => [e.getAttribute("key"), e.getAttribute("value")]));
    const indice = parseInt(md.index ?? placas.length + 1);
    const filamentos = [...p.children].filter((e) => e.localName === "filament").map((f) => {
      const slot = parseInt(f.getAttribute("id") || 0);
      return {
        slot, tipo: (f.getAttribute("type") || "").toUpperCase(), cor_hex: normalizarCor(f.getAttribute("color")),
        gramas: parseFloat(f.getAttribute("used_g") || 0), perfil: perfis[slot - 1] || "",
      };
    });
    const peso = Number(filamentos.reduce((s, f) => s + f.gramas, 0).toFixed(2)) || parseFloat(md.weight || 0);
    placas.push({
      indice, tempo_s: Math.trunc(parseFloat(md.prediction || 0)), peso_g: peso, filamentos,
      objetos: [...p.children].filter((e) => e.localName === "object").map((o) => o.getAttribute("name") || ""),
      miniatura: await binario(`Metadata/plate_${indice}.png`),
    });
  }
  if (!placas.length) throw new ArquivoNaoFatiado(`${file.name} não tem nenhuma placa fatiada.`);

  return {
    arquivo: file.name, nome: nomeAmigavel(file.name), hash: await sha1(bytes),
    titulo: meta.Title || "", designer: meta.Designer || "", licenca: meta.License || "", placas,
    capa: (await binario("Auxiliaries/.thumbnails/thumbnail_3mf.png")) || (await binario("Metadata/plate_1.png")),
  };
}

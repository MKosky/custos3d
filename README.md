# Custos 3D

Calcula o custo e o preço de venda de impressões 3D a partir do arquivo fatiado do Bambu Studio (`.gcode.3mf`) e gera o orçamento em PDF com a sua marca. Roda direto no navegador, sem instalar nada e sem servidor.

**Abrir:** https://mkosky.github.io/custos3d/

## Como usar

1. **Filamentos:** cadastre seus rolos (marca, tipo, cor igual à do Bambu Studio, peso e preço pago).
2. **Parâmetros:** confira energia, desgaste da máquina, margem de erro, lucro, hora de trabalho e embalagens.
3. **Minha marca:** nome, logo, cor do PDF e contatos (Instagram, WhatsApp, e-mail, site, cidade). Ali também fica o **tema do site**: claro, escuro ou automático, numa cor pronta ou na cor da sua marca.
4. **Orçamentos:** arraste os `.gcode.3mf` ou, no Chrome/Edge do computador, **escolha a pasta** onde você salva os arquivos: o app mostra o que tem de novo nela toda vez que você abre a tela. Cada arquivo vira um orçamento com o rolo de cada cor já sugerido.
5. **Gere o PDF do cliente** no orçamento.

## Onde ficam os dados

- **No navegador de cada pessoa** (IndexedDB). Não há servidor: ninguém vê os dados de ninguém.
- **Exportar / importar:** o botão *Exportar meus dados* baixa um arquivo `.db` com tudo. Para trocar de navegador ou de computador, exporte, abra o site no outro navegador e importe o arquivo. Se faz mais de 14 dias que você não exporta, a tela de orçamentos lembra.
- Limpar os dados do navegador apaga tudo o que não foi exportado.

## A fórmula

É a da aba "Custo" da planilha original:

```
J  Custo de produção = material + energia + degradação
L  Custo geral       = J + mão de obra + acabamento + peças compradas + embalagem
M  Margem de erro    = L × % erro
O  Preço             = arredonda para cima ((L + M) / (1 − % lucro))
   Vendedor          = O / (1 − % vendedor), só nos orçamentos marcados
   Marketplace       = (O + taxa) / (1 − %) no modo "preservar o líquido"; O × % + taxa no modo "planilha"
```

Material, energia e degradação são divididos pelas peças por impressão. Cor sem rolo escolhido usa o preço padrão por kg.

## Código

```
index.html        página única; carrega sql.js, JSZip e jsPDF do CDN
estilo.css        visual (as cores vêm do tema)
js/app.js         as telas e as rotas (#/, #/orcamento/ID, #/filamentos, #/parametros, #/marca, #/backup)
js/banco.js       SQLite no navegador (sql.js) guardado no IndexedDB; esquema e consultas
js/custos.js      fórmula de custo e preço, formatação em R$
js/leitor3mf.js   leitura do .gcode.3mf (placas, tempo, gramas, cores, miniaturas)
js/pdf.js         PDF do cliente com logo, cor e contatos
js/tema.js        temas do site com contraste de leitura garantido
js/cores.js       nome e distância entre cores (sugestão de rolo)
testes.mjs        testes da fórmula e dos temas
```

- **Testes:** `node testes.mjs` (fórmula contra linhas da planilha e contraste dos temas).
- **Rodar no PC:** `npx serve -l tcp://127.0.0.1:8765` na pasta (ou a extensão Live Server do VS Code) e abrir `http://127.0.0.1:8765`. Abrir o `index.html` direto do disco não funciona: os módulos JS precisam de um servidor.
- **Publicar:** cada `git push` na `main` atualiza o site pelo GitHub Pages.
- **Coluna nova no banco:** coloque no `ESQUEMA` e em `COLUNAS_NOVAS_ORCAMENTOS` (`js/banco.js`), para arquivos exportados antes ganharem a coluna ao importar.

## Ainda não tem

Histórico de vendas e lucro, propostas com vários itens, confirmar impressão (baixa de estoque automática), previsão de compra de filamento e PDF interno com a composição do custo.

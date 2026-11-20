<div align="center">

# 🖨️ Minha Calculadora 3D

**Descubra quanto custa cada impressão 3D, cobre o preço certo e envie orçamentos em PDF com a sua marca.**

[![Abrir o app](https://img.shields.io/badge/ABRIR%20O%20APP-mkosky.github.io-7A3FC1?style=for-the-badge)](https://mkosky.github.io/custos3d/)

![100% no navegador](https://img.shields.io/badge/100%25-no%20navegador-2F6FDB?style=flat-square)
![Sem cadastro](https://img.shields.io/badge/sem-cadastro-1E9E6A?style=flat-square)
![Gratuito](https://img.shields.io/badge/gratuito-E8772E?style=flat-square)
![Seus dados ficam com você](https://img.shields.io/badge/seus%20dados-ficam%20com%20você-D64F8F?style=flat-square)

</div>

---

## Por que usar

Quem vende impressão 3D costuma calcular o preço "no olho" e esquecer a energia, o desgaste da máquina, as falhas e a comissão do marketplace. A **Minha Calculadora 3D** lê o arquivo fatiado e faz a conta completa em segundos.

- ⚡ **Orçamento em segundos:** arraste o arquivo e o tempo, o peso e as cores de cada placa já aparecem.
- 💰 **Preço sem prejuízo:** material, energia, desgaste, mão de obra, acabamento, embalagem, margem de erro, lucro e comissões.
- 📄 **PDF com a sua marca:** logo, cor, Instagram, WhatsApp, site e cidade no cabeçalho.
- 📦 **Estoque de filamento:** saldo de cada rolo, baixa automática ao confirmar a impressão e aviso de quando comprar.
- 📈 **Vendas e lucro:** quanto entrou no mês, o lucro real (já sem as perdas) e os produtos que mais dão dinheiro.
- 🔒 **Privado:** não tem servidor nem cadastro. Tudo fica no seu navegador.

## Arquivos aceitos

> [!IMPORTANT]
> O app aceita **somente arquivos `.gcode.3mf`**: o arquivo de placa **já fatiada**, com o G-code dentro, que o fatiador exporta.
> Um `.3mf` de projeto (sem fatiar), um `.stl` ou um `.gcode` solto não têm os dados de tempo e de filamento por placa, e por isso não são aceitos.

## Como funciona

```
 .gcode.3mf  ──►  Orçamento  ──►  PDF para o cliente  ──►  Confirmar impressão  ──►  Venda
                 (custo e preço)   (com a sua marca)       (baixa o filamento)       (lucro do mês)
```

1. **Filamentos:** cadastre seus rolos com marca, tipo, cor, peso e preço pago.
2. **Parâmetros:** ajuste a tarifa de energia, o consumo da impressora, o desgaste, a margem de erro, o lucro, a sua hora de trabalho e as embalagens.
3. **Minha marca:** coloque o nome da marca (ele aparece no PDF e no topo do site), a logo, a cor e os contatos. Ali você também escolhe o **tema do site**: claro, escuro ou automático, numa cor pronta ou na cor da sua marca.
4. **Orçamentos:** arraste os `.gcode.3mf`. No Chrome e no Edge do computador dá para **escolher uma pasta**, e o app mostra os arquivos novos dela toda vez que você abre a tela. O rolo de cada cor já vem sugerido.
5. **Envie o PDF**, confirme a impressão quando imprimir e registre a venda quando o cliente pagar.

## O que tem

| Tela | O que faz |
| --- | --- |
| **Início** | Recebido, lucro, perdas e conversão do mês, filamento e valor em estoque, rolos acabando e produtos mais lucrativos |
| **Orçamentos** | Importação dos `.gcode.3mf`, cálculo do custo e do preço, PDF do cliente, PDF interno, baixa de estoque e vendas |
| **Propostas** | Vários orçamentos do mesmo cliente num PDF só, com foto, quantidade e total |
| **Vendas** | Todas as vendas, com o custo congelado e o lucro de cada uma |
| **Filamentos** | Rolos, pesagem, registro de perdas e previsão de compra |
| **Parâmetros** | Os valores usados no cálculo e as embalagens |
| **Minha marca** | Nome, logo, cor e contatos do PDF, tema do site e uma prévia do PDF |
| **Exportar / importar** | Backup em um arquivo, troca de navegador e opção de apagar tudo |

## A fórmula

```
Custo de produção = material + energia + desgaste da máquina
Custo geral       = custo de produção + mão de obra + acabamento + peças compradas + embalagem
Preço             = (custo geral + margem de erro) ÷ (1 − % de lucro), arredondado para cima
Com vendedor      = preço ÷ (1 − % do vendedor)
No marketplace    = (preço + taxa fixa) ÷ (1 − % de comissão)   ← sobra exatamente o seu preço
```

Material, energia e desgaste são divididos pelas peças de cada impressão. Uma cor sem rolo escolhido usa o preço padrão por kg.

## Seus dados

- Ficam **só no navegador que você usa** (IndexedDB). Ninguém mais vê, nem quem mantém o app.
- **Exportar meus dados** baixa um arquivo com tudo. Para trocar de navegador ou de computador, exporte, abra o site no outro e importe. O app lembra de exportar a cada 14 dias.
- Limpar os dados do navegador apaga o que não foi exportado. Em **Exportar / importar** também há o botão para zerar o site.

## Para desenvolvedores

HTML, CSS e JavaScript puros, sem build e sem framework. As bibliotecas vêm do CDN com versão fixa: [sql.js](https://github.com/sql-js/sql.js) (SQLite em WebAssembly), [JSZip](https://stuk.github.io/jszip/) e [jsPDF](https://github.com/parallax/jsPDF) com [AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable).

```
index.html        página única
estilo.css        visual (as cores vêm do tema)
js/app.js         telas e rotas por hash
js/banco.js       SQLite no navegador, guardado no IndexedDB: esquema, consultas, estoque, vendas e propostas
js/custos.js      fórmula de custo e preço
js/leitor3mf.js   leitura do .gcode.3mf (placas, tempo, gramas, cores e miniaturas)
js/pdf.js         PDFs do cliente, da proposta e interno
js/tema.js        temas do site com contraste de leitura garantido
js/cores.js       nome e distância entre cores (sugestão de rolo)
testes.mjs        testes da fórmula e dos temas
```

- **Testes:** `node testes.mjs`
- **Rodar no PC:** `npx serve -l tcp://127.0.0.1:8765` na pasta (ou a extensão Live Server do VS Code) e abrir `http://127.0.0.1:8765`. Abrir o `index.html` direto do disco não funciona, porque os módulos JS precisam de um servidor.
- **Publicar:** cada `git push` na `main` atualiza o site pelo GitHub Pages.
- **Coluna nova no banco:** inclua no `ESQUEMA` e em `COLUNAS_NOVAS_ORCAMENTOS` (`js/banco.js`), para os arquivos exportados antes ganharem a coluna ao serem importados.

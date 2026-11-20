# Minha Calculadora 3D

Calculadora de custo e preço para quem vende impressão 3D. Você importa o arquivo fatiado, ela calcula quanto a peça custa de verdade e gera o orçamento em PDF com a sua logo.

**Abrir o app:** https://mkosky.github.io/minha-calculadora-3d/

Roda direto no navegador. Não tem cadastro, não tem servidor e os dados não saem do seu computador.

## O problema que ela resolve

Na hora de cobrar uma impressão, é fácil olhar só o peso do filamento e esquecer o resto: a energia da impressora, o desgaste do bico e da mesa, as peças que falham, o tempo de acabamento e a comissão do marketplace. A conta parece boa, mas no fim do mês o lucro não aparece.

Aqui o preço sai da conta completa, com os valores que você mesmo configura.

## Arquivos aceitos

Somente **`.gcode.3mf`**, o arquivo de placa já fatiada que o fatiador exporta com o G-code dentro. É dele que o app tira o tempo de impressão e os gramas de cada cor, placa por placa.

Arquivos `.stl`, `.3mf` de projeto (sem fatiar) e `.gcode` solto não trazem essas informações e não são aceitos.

## O que dá para fazer

- **Orçamentos:** importe um ou vários arquivos de uma vez. No Chrome e no Edge do computador, você pode escolher uma pasta e o app mostra os arquivos novos dela toda vez que você abre a tela.
- **PDF para o cliente:** com logo, nome da marca, cor, fonte (das fontes do Google), Instagram, WhatsApp, site e cidade. Há também um PDF interno, só para você, com a composição do custo.
- **Propostas:** vários orçamentos do mesmo cliente num PDF só.
- **Estoque de filamento:** cada rolo tem o seu saldo. Ao confirmar uma impressão, o filamento sai do rolo; falhas e purgas entram como perda. Uma previsão mostra quantos dias cada cor ainda dura.
- **Vendas:** registre o que entrou em cada orçamento. A tela inicial mostra o recebido, o lucro do mês (já descontando as perdas), a taxa de conversão e os produtos que mais dão lucro.
- **Tema:** claro ou escuro, em cinza, numa cor pronta ou na cor da sua marca.

## Como o preço é calculado

```
Custo de produção = material + energia + desgaste da máquina
Custo geral       = custo de produção + mão de obra + acabamento + peças compradas + embalagem
Preço             = (custo geral + margem de erro) ÷ (1 − % de lucro), arredondado para cima
Com vendedor      = preço ÷ (1 − % do vendedor)
No marketplace    = (preço + taxa fixa) ÷ (1 − % de comissão)
```

Material, energia e desgaste são divididos pelo número de peças de cada impressão. Se uma cor ainda não tem rolo escolhido, ela usa o preço padrão por quilo definido em Parâmetros.

No marketplace, a fórmula acima garante que, depois da comissão, sobra exatamente o seu preço. Se preferir a conta antiga (comissão calculada sobre o preço), dá para trocar em Parâmetros.

## Onde ficam os dados

Tudo fica no navegador que você está usando. Isso tem duas consequências:

1. Ninguém mais tem acesso aos seus orçamentos.
2. Se você limpar os dados do navegador ou trocar de computador, eles não vão junto.

Por isso existe a tela **Exportar / importar**. Ela baixa um arquivo com tudo, que você importa no outro navegador. O app lembra de exportar quando passam 14 dias sem backup. Na mesma tela há a opção de apagar tudo e começar do zero.

## Desenvolvimento

O projeto é HTML, CSS e JavaScript, sem framework e sem etapa de build. As bibliotecas vêm do jsDelivr com versão fixa:

- [sql.js](https://github.com/sql-js/sql.js): SQLite compilado para WebAssembly, guardado no IndexedDB
- [JSZip](https://stuk.github.io/jszip/): leitura do `.gcode.3mf`, que é um arquivo zip
- [jsPDF](https://github.com/parallax/jsPDF) e [AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable): geração dos PDFs
- Fontes do PDF: arquivos TTF do Google Fonts publicados no pacote `@expo-google-fonts`

```
index.html        página única
estilo.css        visual; as cores vêm do tema
js/app.js         telas e rotas
js/banco.js       banco de dados, estoque, vendas e propostas
js/custos.js      fórmula de custo e preço
js/leitor3mf.js   leitura do .gcode.3mf
js/pdf.js         PDFs do cliente, da proposta e interno
js/tema.js        temas com contraste de leitura garantido
js/cores.js       nome das cores e sugestão de rolo
testes.mjs        testes da fórmula e dos temas
```

Para rodar no computador, sirva a pasta com qualquer servidor estático, por exemplo `npx serve -l tcp://127.0.0.1:8765`, e abra `http://127.0.0.1:8765`. Abrir o `index.html` direto do disco não funciona, porque os módulos JavaScript precisam ser servidos por HTTP.

Os testes rodam com `node testes.mjs`. Cada push na branch `main` atualiza o site no GitHub Pages.

Ao criar uma coluna nova no banco, inclua no `ESQUEMA` e em `COLUNAS_NOVAS_ORCAMENTOS`, em `js/banco.js`. Assim os arquivos exportados antes ganham a coluna quando forem importados.

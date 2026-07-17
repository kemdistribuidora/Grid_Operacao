# Grid de Operação — Equipe Secos

Tela simples e travada para os operadores lançarem os tempos de separação de carga,
no lugar de preencherem o Google Sheets direto.

**A ideia central:** o operador nunca abre a planilha. Ele abre um link fixo (GitHub Pages),
digita, clica em Salvar. Não tem como arrastar célula, apagar fórmula ou desalinhar coluna —
porque ele não tem acesso à planilha. Quem escreve é o Apps Script, sempre no formato certo.

Os dados vão para a aba **`EQUIPE SECOS API`**, em formato de lista (uma linha por lançamento).
A aba antiga `EQUIPE SECOS` **não é tocada**.

## Como as peças se encaixam

O GitHub Pages só serve arquivos estáticos — sozinho, ele não escreve no Sheets. Por isso a
solução tem duas partes:

```
  Operador
     │  abre o link fixo
     ▼
  GitHub Pages  ──────────►  index.html (a tela)
     │                          │ fetch (carregar / salvar)
     │                          ▼
     │                    Apps Script /exec  (a API, roda como VOCÊ)
     │                          │
     │                          ▼
     └────────────────►  aba "EQUIPE SECOS API" na planilha
```

- **A tela** (`index.html`) fica no GitHub Pages → é o seu link permanente e bonito.
- **O Apps Script** (`apps-script/Codigo.gs`) é a API que a tela chama por `fetch` para ler e
  gravar. Roda como você, então os operadores não precisam de permissão na planilha.

## Por que a aba nova em formato de lista

A `EQUIPE SECOS` original virou um histórico de várias planilhas coladas lado a lado (dias com
6 colunas, dias com 3, com e sem hora). Escrever dentro daquilo seria frágil. A `EQUIPE SECOS
API` é uma tabela de verdade:

| Data | Rota | Setor | Operador | Hora inicio | Fim | Time | Atualizado em |
|------|------|-------|----------|-------------|-----|------|---------------|
| 15/07/2026 | 35 | Secos 2 | Julio | 18:30 | 18:50 | 0:20 | 15/07/2026 11:40 |
| 15/07/2026 | 35 | Resfriado | Helio | 18:21 | 18:28 | 0:07 | 15/07/2026 11:40 |

Rotas sem movimento no dia (como 33 e 26) **não geram linha**. É o formato que a Tabela
Dinâmica soma sem esforço.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A tela (servida pelo GitHub Pages) |
| `apps-script/Codigo.gs` | A API: lê e grava na aba `EQUIPE SECOS API` |
| `.github/workflows/pages.yml` | Publica o Pages sozinho a cada push |

## Ver o visual agora (sem nada configurado)

Abra `index.html` no navegador. Sem link de API configurado, ele roda em **MODO PREVIEW**
(um aviso amarelo aparece no topo): dá para testar a digitação e o cálculo do Time à vontade,
mas nada é gravado.

## Publicar — passo a passo

### Parte A — a API (Apps Script)

1. Abra a planilha → **Extensões → Apps Script**
2. Cole o conteúdo de `apps-script/Codigo.gs` no arquivo `Codigo.gs`
3. Rode a função **`prepararAba`** uma vez (menu de funções → Executar). Ela cria a aba
   `EQUIPE SECOS API` já formatada. É seguro rodar de novo — não apaga nada.
4. **Implantar → Nova implantação → App da Web**
   - Executar como: **eu**
   - Quem tem acesso: **qualquer pessoa**
5. Copie o link gerado, que termina em **`/exec`**

> "Qualquer pessoa" é necessário para a página do github.io conseguir chamar a API sem exigir
> login do Google dos operadores. Como o endpoint aceita gravação, quem tiver esse link
> consegue enviar dados — para uma ferramenta interna de operação, isso é normal. O link do
> endpoint não aparece na tela, só no código.

### Parte B — a tela (GitHub Pages)

6. Abra `index.html` e cole o link `/exec` na variável, lá no começo do `<script>`:
   ```js
   var API_URL = 'https://script.google.com/macros/s/AbC.../exec';
   ```
7. Faça commit e push na branch `main`. O workflow `pages.yml` publica sozinho.
8. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (uma vez só).
9. O link fixo fica em: **https://kemdistribuidora.github.io/Grid_Operacao/**

Deixe esse link nos favoritos do PC dos operadores. Pronto.

> Ao mudar o `Codigo.gs`, republique no Apps Script: **Implantar → Gerenciar implantações →
> editar (lápis) → Versão: Nova versão**. Senão o `/exec` continua servindo a versão antiga.
> Ao mudar o `index.html`, basta o push — o Pages atualiza sozinho.

## Como funciona

- **Salvar** grava o dia inteiro de uma vez, com trava (`LockService`) contra dois PCs ao mesmo
  tempo. Regravar um dia **substitui** os lançamentos daquela data — nunca duplica — e não toca
  nos outros dias.
- **Time** é calculado pelo Apps Script, não digitado. Atravessa a meia-noite (23:40 → 00:10 = 0:30).
- **Reabrir** uma data já lançada traz o que está na planilha, para corrigir.
- A comunicação usa `fetch` simples (GET para ler, POST com corpo de texto para gravar), o que
  evita o bloqueio de CORS do Apps Script. **Não troque o POST para `Content-Type:
  application/json`** — isso dispara um preflight que o Apps Script rejeita.

## Ajustes comuns

Tudo no `CONFIG`, no topo do `Codigo.gs` (e republicar a implantação):

- **Entrou/saiu operador** → `operadores`, dentro de `SETORES`
- **Nova rota** → `ROTAS`, na posição desejada
- **Renomear a aba** → `ABA` (rode `prepararAba` de novo depois)

Um operador que já está na planilha mas saiu da lista não é apagado — o grid mostra o nome dele
ao reabrir o dia. Só não aparece como opção para novos lançamentos.

## Relatórios a partir da aba API

Com a lista pronta, os relatórios saem de **Inserir → Tabela dinâmica**:

- Tempo total por operador no mês → Linhas: Operador · Valores: SUM de Time
- Quantas rotas rodaram por dia → Linhas: Data · Valores: COUNT de Rota
- Comparar Secos 2 x Resfriado → Colunas: Setor · Valores: SUM de Time

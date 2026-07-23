# Grid de Operação — Equipe Secos

Tela simples e travada para os operadores lançarem os tempos de separação de carga,
no lugar de preencherem o Google Sheets direto.

**A ideia central:** o operador nunca abre a planilha. Ele abre um link fixo (GitHub Pages),
escolhe o **setor** que vai preencher, digita, clica em Salvar. Não tem como arrastar célula,
apagar fórmula ou desalinhar coluna — porque ele não tem acesso à planilha. Quem escreve é o
Apps Script, sempre no formato certo.

**4 setores, um por vez:** a barra de cima tem `Secos 1`, `Secos 2`, `Resfriados`, `Congelados`.
Cada um tem sua lista de operadores. Salvar grava **só o setor aberto** — os outros setores do
mesmo dia ficam intactos. A tela lembra o último setor usado (por PC).

A coluna lateral são os **números dos caminhões** (16–38), iguais nos 4 setores.

Os dados vão para a aba **`EQUIPE SECOS API`**, em formato de lista (uma linha por lançamento).
A aba antiga `EQUIPE SECOS` **não é tocada**.

> **Confirme os operadores:** eu preenchi `Secos 2` e `Resfriados` com os nomes que apareciam
> nos dados, mas **chutei os de `Secos 1` e `Congelados`**. Ajuste as listas no `CONFIG` do
> `Codigo.gs` (seção "Ajustes comuns").

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

Colunas, na ordem da planilha:

`Data de carregamento · Frota · Departamento · Separador · Conferente · Hora inicio · Fim ·
Time · Início operação · Término operação · Inconsistência · Atualizado em`

- **Frota** = número do caminhão. **Departamento** = setor (Secos 1/2, Resfriados, Congelados).
- Dois pares de horário, ambos digitados: **Hora início/Fim** (separação) e **Início/Término
  operação** (operação). O **Time** é calculado pelo script = Fim − Hora início (a separação).
- **Inconsistência** grava `Sim`/`Não`. **Atualizado em** é interno (quando a linha foi gravada).
- Caminhões sem movimento no dia **não geram linha**. É o formato que a Tabela Dinâmica soma
  sem esforço.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A tela (servida pelo GitHub Pages) |
| `apps-script/Codigo.gs` | A API: lê e grava na aba `EQUIPE SECOS API` |
| `imagens/` | Logo (`Distribuidora_KEM.png`) e ícone (`icone.png`). **Precisa ir no push** para a logo aparecer no Pages |
| `.github/workflows/pages.yml` | Publica o Pages sozinho a cada push |

## Ver o visual agora (sem nada configurado)

Abra `index.html` no navegador. Sem link de API configurado, ele roda em **MODO PREVIEW**
(um aviso amarelo aparece no topo): dá para testar a digitação e o cálculo do Time à vontade,
mas nada é gravado.

## Publicar — passo a passo

### Parte A — a API (Apps Script)

1. Abra a planilha → **Extensões → Apps Script**
2. Cole o conteúdo de `apps-script/Codigo.gs` no arquivo `Codigo.gs`
3. Confira, no topo do `CONFIG`, o **`PLANILHA_ID`** — é o trecho do link da planilha entre
   `/d/` e `/edit`. Já vem preenchido com o ID da planilha atual.
4. Rode a função **`prepararAba`** uma vez (menu de funções → Executar). Na primeira vez o
   Google pede autorização — aceite. Ela cria a aba `EQUIPE SECOS API` já formatada. É seguro
   rodar de novo, não apaga nada.
5. **Implantar → Nova implantação → App da Web**
   - Executar como: **eu**
   - Quem tem acesso: **qualquer pessoa** (sem "com conta do Google")
6. Copie o link gerado, que termina em **`/exec`**

> **Teste o endpoint antes de seguir:** cole o link `/exec` numa aba do navegador e acrescente
> `?acao=ping` no final. Deve aparecer um texto tipo `{"ok":true,"dados":"pong",...}`. Se
> aparecer isso, a API está no ar. Se aparecer tela de login, página em branco ou erro, veja a
> seção **Se der errado** mais abaixo — não adianta seguir enquanto o ping não responder.

> "Qualquer pessoa" é necessário para a página do github.io chamar a API sem exigir login do
> Google dos operadores. Como o endpoint aceita gravação, quem tiver esse link consegue enviar
> dados — para uma ferramenta interna de operação, isso é normal. O link não aparece na tela,
> só no código.

> **Comunicação sem CORS:** a leitura usa JSONP (uma tag `<script>`) e a gravação usa POST
> `no-cors` seguido de uma releitura que confirma o que entrou. Isso contorna o bloqueio de
> CORS do Apps Script (o Google não permite o código enviar o cabeçalho que o `fetch` exigiria).
> Não vale a pena tentar trocar por `fetch`+`json` — foi por isso que a primeira versão falhou.

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

## Se der errado

Faça o teste do ping (`/exec?acao=ping`) e veja o que acontece:

| O que aparece no ping | O que significa | O que fazer |
|---|---|---|
| `{"ok":true,"dados":"pong"}` | API no ar | Confira se o `API_URL` do `index.html` é **exatamente** esse link `/exec` e deu push |
| Tela de login do Google | Acesso não está "Qualquer pessoa" | Reimplante como **Qualquer pessoa** e crie uma **Nova versão** |
| Página em branco / erro | Script não achou a planilha, ou versão velha | Confira o `PLANILHA_ID`; rode `prepararAba`; reimplante como Nova versão |
| `{"ok":false,...}` | O script rodou mas deu erro interno | A mensagem no JSON diz qual — geralmente aba ou permissão |

**Erro de CORS no console** (`No 'Access-Control-Allow-Origin'`): quase sempre é o `index.html`
apontando para uma implantação **antiga**. Cada "Nova implantação" gera uma URL `/exec`
diferente. Use a URL da implantação **ativa** e dê push. Preferir sempre **Gerenciar
implantações → Nova versão** (mantém a mesma URL) em vez de criar implantações novas.

**Confirmação ao salvar:** ao clicar em Salvar, o status mostra *"Salvo e confirmado: N
lançamento(s)"*. Esse número vem de uma releitura da planilha depois de gravar — ou seja, se
apareceu, os dados **entraram** de verdade. Se aparecer "Não deu pra confirmar", a gravação ou
a releitura falhou; refaça o teste do ping.

## Como funciona

- **Salvar** grava um setor de cada vez, com trava (`LockService`) contra dois PCs ao mesmo
  tempo. Regravar um (data + setor) **substitui** só aqueles lançamentos — nunca duplica — e
  não toca nos outros setores nem nos outros dias.
- **Time** é calculado pelo Apps Script, não digitado. Atravessa a meia-noite (23:40 → 00:10 = 0:30).
- **Reabrir** uma data já lançada traz o que está na planilha, para corrigir.
- **Tudo por JSONP, uma ida e volta por ação.** Cada chamada ao Apps Script custa 1,5–4s de
  overhead do Google, então o que mais pesa é a *quantidade* de chamadas, não o tamanho dos
  dados. Por isso:
  - **Abrir a página = 1 chamada.** O `doGet` sem ação devolve config **e** o dia do setor
    lembrado (o front manda `?setor=` do `localStorage`).
  - **Salvar = 1 chamada.** `?acao=salvar` grava e já responde o resultado, sem releitura.
  - O payload vai **compacto** (`[[cam, separador, inicio, fim, conferente, 0|1], ...]`) e só com
    os caminhões preenchidos — URL curta e menos trabalho no servidor.
  - Se a URL passasse de ~6.000 caracteres (caso raro, grid inteiro cheio), cai automaticamente
    no caminho antigo por POST + releitura, que não tem limite de tamanho.

> Se um dia voltar a ficar lento, o próximo passo é o `salvarSetor`: hoje ele reescreve a aba
> inteira a cada gravação para manter tudo ordenado. Com muitos meses de histórico isso cresce.
> A solução seria atualizar só as linhas do (data + setor) em vez de reescrever tudo.

## Ajustes comuns

Tudo no `CONFIG`, no topo do `Codigo.gs` (e republicar a implantação como Nova versão):

- **Operadores de um setor** → a lista `operadores` daquele setor, dentro de `SETORES`.
  É aqui que você corrige `Secos 1` e `Congelados`.
- **Novo setor** → mais um item em `SETORES` (com `id`, `nome`, `cor`, `operadores`)
- **Novo caminhão** → `ROTAS`, na posição desejada
- **Renomear a aba** → `ABA` (rode `prepararAba` de novo depois)

O `id` de um setor (ex.: `secos2`) é usado internamente e não deve mudar depois que houver
dados gravados; o `nome` (ex.: `Secos 2`) é o que aparece na tela e grava na coluna Setor.

Um operador que já está na planilha mas saiu da lista não é apagado — o grid mostra o nome dele
ao reabrir o dia. Só não aparece como opção para novos lançamentos.

## Relatórios a partir da aba API

Com a lista pronta, os relatórios saem de **Inserir → Tabela dinâmica**:

- Tempo total por operador no mês → Linhas: Operador · Valores: SUM de Time
- Quantas rotas rodaram por dia → Linhas: Data · Valores: COUNT de Rota
- Comparar Secos 2 x Resfriado → Colunas: Setor · Valores: SUM de Time

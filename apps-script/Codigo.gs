/**
 * GRID DE OPERAÇÃO — EQUIPE SECOS  (API para o front no GitHub Pages)
 *
 * A tela fica no GitHub Pages (index.html). Este script é a API que ela
 * chama por fetch: lê e grava na aba "EQUIPE SECOS API", em formato de
 * lista (uma linha por lançamento: data, rota, setor, operador, ini, fim, tempo).
 *
 * A aba antiga "EQUIPE SECOS" NÃO é tocada por este script.
 *
 * ---------------------------------------------------------------
 * COMO PUBLICAR (uma vez só):
 *   1. Planilha > Extensões > Apps Script
 *   2. Cole este arquivo em Codigo.gs (não precisa mais do Grid.html)
 *   3. Rode a função "prepararAba" uma vez (cria a aba API já formatada)
 *   4. Implantar > Nova implantação > App da Web
 *        Executar como: EU
 *        Quem tem acesso: QUALQUER PESSOA
 *      Copie o link que termina em /exec.
 *   5. Cole esse link na variável API_URL do index.html e publique no Pages.
 *
 * "Executar como: EU" é o que resolve o acesso: os operadores usam o grid
 * sem ter permissão de edição na planilha. "Qualquer pessoa" é necessário
 * para o front no github.io conseguir chamar a API sem login do Google.
 * ---------------------------------------------------------------
 */

/* ============================================================
   PONTOS DE ENTRADA DA API
   ============================================================ */

/** Leituras. ?acao=config | ?acao=dia&data=15/07/2026 | (sem acao) = config + dia de hoje. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    let dados;
    if (p.acao === 'config') {
      dados = getConfig();
    } else if (p.acao === 'dia') {
      dados = carregarDia(normalizarData(p.data) || p.data);
    } else {
      const cfg = getConfig();
      dados = { config: cfg, dia: carregarDia(cfg.hoje) };
    }
    return jsonOut({ ok: true, dados: dados });
  } catch (err) {
    return jsonOut({ ok: false, mensagem: 'Erro: ' + err });
  }
}

/** Gravação. O front envia o corpo como texto JSON (sem preflight CORS). */
function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return jsonOut(salvarDia(payload));
  } catch (err) {
    return jsonOut({ ok: false, mensagem: 'Erro: ' + err });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

const CONFIG = {
  ABA: 'EQUIPE SECOS API',

  // Ordem das rotas no grid, de cima para baixo (igual à planilha antiga).
  ROTAS: [35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 36, 37, 38],

  // id = usado internamente | nome = o que aparece no grid e grava na coluna Setor
  SETORES: [
    { id: 'secos', nome: 'Secos 2', operadores: ['Julio', 'Alzoni', 'Marcelo', 'Julio/Alzoni', 'Julio/Marcelo', 'Marcelo/Alzoni'] },
    { id: 'resfriado', nome: 'Resfriado', operadores: ['Helio', 'Alaor'] },
  ],

  FUSO: 'America/Sao_Paulo',
};

// Colunas da aba API (base 1). Mudar a ordem aqui muda a aba inteira.
const COL = { DATA: 1, ROTA: 2, SETOR: 3, OPERADOR: 4, INICIO: 5, FIM: 6, TIME: 7, ATUALIZADO: 8 };
const CABECALHO = ['Data', 'Rota', 'Setor', 'Operador', 'Hora inicio', 'Fim', 'Time', 'Atualizado em'];
const LINHA_CABECALHO = 1;
const PRIMEIRA_LINHA_DADOS = 2;

/* ============================================================
   CONFIG PARA O FRONT
   ============================================================ */

function getConfig() {
  const operadores = {};
  CONFIG.SETORES.forEach(s => { operadores[s.nome] = s.operadores; });
  return {
    rotas: CONFIG.ROTAS,
    setores: CONFIG.SETORES.map(s => ({ id: s.id, nome: s.nome })),
    operadores: operadores,
    hoje: Utilities.formatDate(new Date(), CONFIG.FUSO, 'dd/MM/yyyy'),
  };
}

/* ============================================================
   A ABA
   ============================================================ */

/** Cria a aba API já formatada. Seguro rodar de novo: não apaga nada. */
function prepararAba() {
  const aba = pegarAba();
  Logger.log('Aba "%s" pronta. %s lançamento(s) gravado(s).',
    CONFIG.ABA, Math.max(0, aba.getLastRow() - 1));
  return aba.getName();
}

function pegarAba() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName(CONFIG.ABA);
  if (!aba) {
    aba = planilha.insertSheet(CONFIG.ABA);
    formatarAba(aba);
  } else if (aba.getRange(LINHA_CABECALHO, 1).getValue() === '') {
    formatarAba(aba);
  }
  return aba;
}

function formatarAba(aba) {
  aba.getRange(LINHA_CABECALHO, 1, 1, CABECALHO.length)
     .setValues([CABECALHO])
     .setFontWeight('bold')
     .setBackground('#d9d9d9');

  aba.setFrozenRows(1);
  aba.getRange('A:A').setNumberFormat('dd/MM/yyyy');
  aba.getRange('E:F').setNumberFormat('HH:mm');
  aba.getRange('G:G').setNumberFormat('[h]:mm');   // [h] deixa somar tempo passando de 24h
  aba.getRange('H:H').setNumberFormat('dd/MM/yyyy HH:mm');

  [90, 55, 90, 130, 90, 90, 70, 140].forEach((larg, i) => aba.setColumnWidth(i + 1, larg));
}

/* ============================================================
   LER / GRAVAR
   ============================================================ */

/** Lê todos os lançamentos como matriz (sem o cabeçalho). */
function lerTudo(aba) {
  const ultima = aba.getLastRow();
  if (ultima < PRIMEIRA_LINHA_DADOS) return [];
  return aba.getRange(PRIMEIRA_LINHA_DADOS, 1, ultima - 1, CABECALHO.length).getDisplayValues();
}

/** Devolve o dia no formato que o grid entende, para abrir preenchido. */
function carregarDia(dataBR) {
  const aba = pegarAba();
  const linhas = lerTudo(aba).filter(l => normalizarData(l[COL.DATA - 1]) === dataBR);

  const registros = {};
  CONFIG.ROTAS.forEach(rota => {
    registros[rota] = {};
    CONFIG.SETORES.forEach(s => {
      registros[rota][s.id + '_operador'] = '';
      registros[rota][s.id + '_inicio'] = '';
      registros[rota][s.id + '_fim'] = '';
    });
  });

  linhas.forEach(l => {
    const rota = String(l[COL.ROTA - 1]).trim();
    const setor = CONFIG.SETORES.find(s => s.nome === String(l[COL.SETOR - 1]).trim());
    if (!setor || !registros[rota]) return;
    registros[rota][setor.id + '_operador'] = l[COL.OPERADOR - 1] || '';
    registros[rota][setor.id + '_inicio'] = normalizarHora(l[COL.INICIO - 1]);
    registros[rota][setor.id + '_fim'] = normalizarHora(l[COL.FIM - 1]);
  });

  return { data: dataBR, temDados: linhas.length > 0, registros: registros };
}

/**
 * Grava o dia. Substitui por completo os lançamentos daquela data:
 * o que o grid mandar é o que fica. Rotas vazias não viram linha.
 */
function salvarDia(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { ok: false, mensagem: 'Outra pessoa está salvando agora. Tente de novo em alguns segundos.' };
  }

  try {
    const dataBR = normalizarData(payload.data);
    if (!dataBR) return { ok: false, mensagem: 'Data inválida.' };

    const aba = pegarAba();
    const agora = Utilities.formatDate(new Date(), CONFIG.FUSO, 'dd/MM/yyyy HH:mm');

    // Tudo que NÃO é do dia sendo salvo é preservado — mas canonizado, para a
    // coluna não ficar com tipos misturados (rota texto x rota número etc.)
    const outrosDias = lerTudo(aba)
      .filter(l => normalizarData(l[COL.DATA - 1]) !== dataBR)
      .map(canonizar);

    // Monta as linhas novas do dia, na ordem das rotas e dos setores
    const doDia = [];
    CONFIG.ROTAS.forEach(rota => {
      const r = payload.registros[rota] || {};
      CONFIG.SETORES.forEach(s => {
        const operador = String(r[s.id + '_operador'] || '').trim();
        const inicio = normalizarHora(r[s.id + '_inicio']);
        const fim = normalizarHora(r[s.id + '_fim']);
        if (!operador && !inicio && !fim) return; // rota parada não vira linha
        const linha = [];
        linha[COL.DATA - 1] = dataBR;
        linha[COL.ROTA - 1] = rota;
        linha[COL.SETOR - 1] = s.nome;
        linha[COL.OPERADOR - 1] = operador;
        linha[COL.INICIO - 1] = inicio;
        linha[COL.FIM - 1] = fim;
        linha[COL.TIME - 1] = calcularDuracao(inicio, fim);
        linha[COL.ATUALIZADO - 1] = agora;
        doDia.push(linha);
      });
    });

    const tudo = ordenar(outrosDias.concat(doDia));

    // Escreve primeiro, limpa a sobra depois. Se falhar no meio, nada se perde.
    if (tudo.length) {
      aba.getRange(PRIMEIRA_LINHA_DADOS, 1, tudo.length, CABECALHO.length).setValues(tudo);
    }
    const linhasAntes = aba.getLastRow() - 1;
    const sobra = linhasAntes - tudo.length;
    if (sobra > 0) {
      aba.getRange(PRIMEIRA_LINHA_DADOS + tudo.length, 1, sobra, CABECALHO.length).clearContent();
    }

    return {
      ok: true,
      mensagem: doDia.length
        ? doDia.length + ' lançamento(s) salvos às ' + agora.slice(-5)
        : 'Dia salvo sem lançamentos às ' + agora.slice(-5),
    };
  } catch (e) {
    return { ok: false, mensagem: 'Erro ao salvar: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

/** Reescreve uma linha lida da planilha com os tipos canônicos das colunas. */
function canonizar(l) {
  const rotaTxt = String(l[COL.ROTA - 1]).trim();
  const rotaNum = Number(rotaTxt);
  const inicio = normalizarHora(l[COL.INICIO - 1]);
  const fim = normalizarHora(l[COL.FIM - 1]);
  const linha = [];
  linha[COL.DATA - 1] = normalizarData(l[COL.DATA - 1]);
  linha[COL.ROTA - 1] = isNaN(rotaNum) ? rotaTxt : rotaNum;
  linha[COL.SETOR - 1] = String(l[COL.SETOR - 1]).trim();
  linha[COL.OPERADOR - 1] = String(l[COL.OPERADOR - 1] || '').trim();
  linha[COL.INICIO - 1] = inicio;
  linha[COL.FIM - 1] = fim;
  linha[COL.TIME - 1] = calcularDuracao(inicio, fim);
  linha[COL.ATUALIZADO - 1] = l[COL.ATUALIZADO - 1] || '';
  return linha;
}

/** Data crescente; dentro do dia, a ordem das rotas do grid; Secos 2 antes de Resfriado. */
function ordenar(linhas) {
  const posRota = {};
  CONFIG.ROTAS.forEach((r, i) => { posRota[r] = i; });
  const posSetor = {};
  CONFIG.SETORES.forEach((s, i) => { posSetor[s.nome] = i; });
  const ordemDe = (obj, chave) => (chave in obj ? obj[chave] : 999);

  return linhas.slice().sort((a, b) => {
    const dA = dataParaNumero(a[COL.DATA - 1]), dB = dataParaNumero(b[COL.DATA - 1]);
    if (dA !== dB) return dA - dB;
    const rA = ordemDe(posRota, String(a[COL.ROTA - 1]).trim());
    const rB = ordemDe(posRota, String(b[COL.ROTA - 1]).trim());
    if (rA !== rB) return rA - rB;
    return ordemDe(posSetor, String(a[COL.SETOR - 1]).trim())
         - ordemDe(posSetor, String(b[COL.SETOR - 1]).trim());
  });
}

/** "15/07/2026" -> 20260715, para ordenar. Data inválida vai para o fim. */
function dataParaNumero(valor) {
  const d = normalizarData(valor);
  if (!d) return 99999999;
  const p = d.split('/');
  return Number(p[2] + p[1] + p[0]);
}

/* ============================================================
   FORMATOS
   ============================================================ */

/** Date, "15/07/2026" ou "5/7/2026" -> "15/07/2026". Se não for data, ''. */
function normalizarData(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, CONFIG.FUSO, 'dd/MM/yyyy');
  const m = String(valor || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  return m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[3];
}

/** "18:30", "18:30:00" ou Date -> "18:30". Se não for hora válida, ''. */
function normalizarHora(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, CONFIG.FUSO, 'HH:mm');
  const m = String(valor || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return '';
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return String(h).padStart(2, '0') + ':' + m[2];
}

/** "18:30" + "18:50" -> "0:20". Atravessa a meia-noite. Falta dado -> ''. */
function calcularDuracao(inicio, fim) {
  const a = minutosDe(inicio), b = minutosDe(fim);
  if (a === null || b === null) return '';
  let diff = b - a;
  if (diff < 0) diff += 24 * 60; // turno que vira o dia
  return Math.floor(diff / 60) + ':' + String(diff % 60).padStart(2, '0');
}

function minutosDe(hhmm) {
  const h = normalizarHora(hhmm);
  if (!h) return null;
  return Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
}

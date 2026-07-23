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
 *   3. Confira o CONFIG.PLANILHA_ID abaixo (o ID que está no link da planilha)
 *   4. Rode a função "prepararAba" uma vez (cria a aba API e pede autorização)
 *   5. Implantar > Nova implantação > App da Web
 *        Executar como: EU
 *        Quem tem acesso: QUALQUER PESSOA
 *      Copie o link que termina em /exec.
 *   6. Cole esse link na variável API_URL do index.html e publique no Pages.
 *
 * "Executar como: EU" resolve o acesso: os operadores usam o grid sem ter
 * permissão na planilha. "Qualquer pessoa" é necessário para o github.io
 * chamar a API sem login do Google.
 *
 * LEITURA usa JSONP (?callback=...) e GRAVAÇÃO usa POST — os dois evitam o
 * bloqueio de CORS do Apps Script, que não deixa o código enviar cabeçalhos.
 * ---------------------------------------------------------------
 */

/* ============================================================
   PONTOS DE ENTRADA DA API
   ============================================================ */

/**
 * Tudo passa por aqui (JSONP), para gastar UMA ida e volta por ação —
 * cada chamada ao Apps Script custa segundos, então evitamos chamadas extras.
 *
 *   ?acao=ping                                     -> teste rápido ("pong")
 *   ?acao=config                                   -> caminhões, setores, conferentes
 *   ?acao=dia&data=15/07/2026&setor=secos2         -> lançamentos de UM setor no dia
 *   ?acao=salvar&data=..&setor=..&dados=[[...]]    -> grava e já responde o resultado
 *   (sem acao) &setor=secos2                       -> config + o dia de hoje daquele setor
 *
 * Com ?callback=nome, responde nome(json) para funcionar por <script> (sem CORS).
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  let out;
  try {
    if (p.acao === 'ping') {
      out = { ok: true, dados: 'pong', aba: CONFIG.ABA };
    } else if (p.acao === 'config') {
      out = { ok: true, dados: getConfig() };
    } else if (p.acao === 'dia') {
      out = { ok: true, dados: carregarSetor(normalizarData(p.data) || p.data, p.setor) };
    } else if (p.acao === 'salvar') {
      // Já devolve {ok, mensagem} — o front não precisa reler para confirmar.
      out = salvarSetor({
        data: p.data,
        setor: p.setor,
        registros: registrosDeCompacto(p.dados),
      });
    } else {
      // Abertura da página: config + o dia já preenchido, numa chamada só.
      const cfg = getConfig();
      const setor = acharSetor(p.setor) || CONFIG.SETORES[0];
      out = { ok: true, dados: { config: cfg, dia: carregarSetor(cfg.hoje, setor.id) } };
    }
  } catch (err) {
    out = { ok: false, mensagem: 'Erro: ' + err };
  }
  return responder(out, p.callback);
}

/**
 * Converte o formato compacto que o front manda na URL:
 *   [[frota, separador, conferente, inicio, fim, opInicio, opFim, 0|1], ...]
 * para o formato interno. Só vêm os caminhões preenchidos, o que deixa a
 * URL curta e o processamento leve.
 */
function registrosDeCompacto(txt) {
  const lista = JSON.parse(txt || '[]');
  const registros = {};
  lista.forEach(l => {
    registros[l[0]] = {
      separador: l[1] || '',
      conferente: l[2] || '',
      inicio: l[3] || '',
      fim: l[4] || '',
      op_inicio: l[5] || '',
      op_fim: l[6] || '',
      inconsistencia: l[7] === 1 || l[7] === true,
    };
  });
  return registros;
}

/** Gravação de UM setor. O front envia o corpo como texto (POST simples, sem preflight). */
function doPost(e) {
  let out;
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = salvarSetor(payload);
  } catch (err) {
    out = { ok: false, mensagem: 'Erro: ' + err };
  }
  return responder(out, (e && e.parameter && e.parameter.callback));
}

/** JSON puro, ou nome(JSON) quando há callback (JSONP). */
function responder(obj, callback) {
  const txt = JSON.stringify(obj);
  if (callback) {
    const cb = String(callback).replace(/[^\w$.]/g, ''); // só identificador seguro
    return ContentService.createTextOutput(cb + '(' + txt + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

const CONFIG = {
  // ID da planilha (o trecho entre /d/ e /edit no link). Abrir por ID faz o
  // script funcionar mesmo se for um projeto standalone, não preso à planilha.
  PLANILHA_ID: '12YepnQuYfgKxaOgmPQSLx8qV6nCFRhsKyvtCts9VJiM',

  ABA: 'CARREGAMENTO',

  // Números dos caminhões (do menor ao maior).
  ROTAS: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],

  // id  = usado internamente (não muda)
  // nome = o que aparece na barra de setores e grava na coluna Setor
  // cor  = destaque da aba do setor quando selecionado
  // operadores = as opções do menu suspenso daquele setor
  SETORES: [
    // ATENÇÃO: confirme os operadores de Secos 1 e Resfriados (chutei pelos dados antigos).
    { id: 'secos1',     nome: 'Secos 1',     cor: '#e6f4ea', operadores: ['Julio', 'Marcelo', 'Alzoni', 'Julio/Marcelo', 'Julio/Alzoni', 'Marcelo/Alzoni'] },
    { id: 'secos2',     nome: 'Secos 2',     cor: '#e8f0fe', operadores: ['Julio', 'Alzoni', 'Marcelo', 'Julio/Alzoni', 'Julio/Marcelo', 'Marcelo/Alzoni'] },
    { id: 'resfriados', nome: 'Resfriados',  cor: '#fce8e6', operadores: ['Helio', 'Alaor'] },
    { id: 'congelados', nome: 'Congelados',  cor: '#e0f7fa', operadores: ['Josue', 'Douglas', 'Jeferson', 'Vitor', 'Andre', 'Francisco'] },
  ],

  // Quem confere a carga. Lista única, vale para os 4 setores.
  CONFERENTES: ['Francisco', 'João Paulo', 'Alzoni'],

  // Valores gravados na coluna Inconsistência. TÊM que ser idênticos aos da
  // validação de dados daquela coluna na planilha (a lista suspensa), senão
  // o Google recusa a gravação. Hoje a validação aceita SIM / NÃO (maiúsculos).
  INCONSIST_SIM: 'SIM',
  INCONSIST_NAO: 'NÃO',

  FUSO: 'America/Sao_Paulo',
};

// Colunas da aba API (base 1). Mudar a ordem aqui muda a aba inteira.
// (ROTA = Frota/caminhão, SETOR = Departamento — nomes internos mantidos.)
const COL = {
  DATA: 1, ROTA: 2, SETOR: 3, SEPARADOR: 4, CONFERENTE: 5,
  INICIO: 6, FIM: 7, TIME: 8, OP_INICIO: 9, OP_FIM: 10,
  INCONSIST: 11, ATUALIZADO: 12,
};
const CABECALHO = ['Data de carregamento', 'Frota', 'Departamento', 'Separador', 'Conferente',
                   'Hora inicio', 'Fim', 'Time', 'Início operação', 'Término operação',
                   'Inconsistência', 'Atualizado em'];
const LINHA_CABECALHO = 1;
const PRIMEIRA_LINHA_DADOS = 2;

/* ============================================================
   CONFIG PARA O FRONT
   ============================================================ */

function getConfig() {
  return {
    caminhoes: CONFIG.ROTAS,
    setores: CONFIG.SETORES.map(s => ({
      id: s.id, nome: s.nome, cor: s.cor, operadores: s.operadores,
    })),
    conferentes: CONFIG.CONFERENTES,
    hoje: Utilities.formatDate(new Date(), CONFIG.FUSO, 'dd/MM/yyyy'),
  };
}

/** Acha um setor pelo id ('secos2') ou pelo nome ('Secos 2'). */
function acharSetor(idOuNome) {
  const chave = String(idOuNome || '').trim();
  return CONFIG.SETORES.find(s => s.id === chave || s.nome === chave) || null;
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

function pegarPlanilha() {
  if (CONFIG.PLANILHA_ID) return SpreadsheetApp.openById(CONFIG.PLANILHA_ID);
  const ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (!ativa) throw new Error('Sem planilha: defina CONFIG.PLANILHA_ID.');
  return ativa;
}

function pegarAba() {
  const planilha = pegarPlanilha();
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
  aba.getRange('F:G').setNumberFormat('HH:mm');    // Hora inicio / Fim (separação)
  aba.getRange('H:H').setNumberFormat('[h]:mm');   // Time — [h] deixa somar passando de 24h
  aba.getRange('I:J').setNumberFormat('HH:mm');    // Início / Término operação
  aba.getRange('L:L').setNumberFormat('dd/MM/yyyy HH:mm');

  [130, 70, 110, 140, 130, 90, 90, 70, 110, 110, 120, 140]
    .forEach((larg, i) => aba.setColumnWidth(i + 1, larg));
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

/**
 * Devolve os lançamentos de UM setor num dia, para o grid abrir preenchido.
 * registros = { "35": {operador, inicio, fim}, ... } com todos os caminhões.
 */
function carregarSetor(dataBR, setorIdOuNome) {
  const setor = acharSetor(setorIdOuNome);
  if (!setor) throw new Error('Setor desconhecido: ' + setorIdOuNome);

  const aba = pegarAba();
  const linhas = lerTudo(aba).filter(l =>
    normalizarData(l[COL.DATA - 1]) === dataBR &&
    String(l[COL.SETOR - 1]).trim() === setor.nome);

  const registros = {};
  CONFIG.ROTAS.forEach(cam => { registros[cam] = registroVazio(); });

  linhas.forEach(l => {
    const cam = String(l[COL.ROTA - 1]).trim();
    if (!registros[cam]) return;
    registros[cam] = {
      separador: l[COL.SEPARADOR - 1] || '',
      conferente: l[COL.CONFERENTE - 1] || '',
      inicio: normalizarHora(l[COL.INICIO - 1]),
      fim: normalizarHora(l[COL.FIM - 1]),
      op_inicio: normalizarHora(l[COL.OP_INICIO - 1]),
      op_fim: normalizarHora(l[COL.OP_FIM - 1]),
      inconsistencia: ehSim(l[COL.INCONSIST - 1]),
    };
  });

  return { data: dataBR, setor: setor.id, temDados: linhas.length > 0, registros: registros };
}

function registroVazio() {
  return { separador: '', conferente: '', inicio: '', fim: '', op_inicio: '', op_fim: '', inconsistencia: false };
}

/**
 * Grava UM setor de um dia. Substitui só os lançamentos de (data + setor);
 * os outros setores do mesmo dia e os outros dias ficam intactos.
 * Caminhão vazio não vira linha.
 */
function salvarSetor(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { ok: false, mensagem: 'Outra pessoa está salvando agora. Tente de novo em alguns segundos.' };
  }

  try {
    const dataBR = normalizarData(payload.data);
    if (!dataBR) return { ok: false, mensagem: 'Data inválida.' };
    const setor = acharSetor(payload.setor);
    if (!setor) return { ok: false, mensagem: 'Setor inválido.' };

    const aba = pegarAba();
    const agora = Utilities.formatDate(new Date(), CONFIG.FUSO, 'dd/MM/yyyy HH:mm');

    // Preserva tudo, MENOS as linhas deste mesmo (data + setor). Canoniza o resto
    // para a coluna não ficar com tipos misturados.
    const preservado = lerTudo(aba).filter(l => !(
      normalizarData(l[COL.DATA - 1]) === dataBR &&
      String(l[COL.SETOR - 1]).trim() === setor.nome
    )).map(canonizar);

    // Monta as linhas novas do setor, na ordem dos caminhões
    const novas = [];
    CONFIG.ROTAS.forEach(cam => {
      const r = (payload.registros || {})[cam] || {};
      const separador = String(r.separador || '').trim();
      const conferente = String(r.conferente || '').trim();
      const inicio = normalizarHora(r.inicio);
      const fim = normalizarHora(r.fim);
      const opInicio = normalizarHora(r.op_inicio);
      const opFim = normalizarHora(r.op_fim);
      const inconsistencia = r.inconsistencia === true;
      // Caminhão totalmente em branco não vira linha (mas só a flag marcada já vira)
      if (!separador && !conferente && !inicio && !fim && !opInicio && !opFim && !inconsistencia) return;
      const linha = [];
      linha[COL.DATA - 1] = dataBR;
      linha[COL.ROTA - 1] = cam;
      linha[COL.SETOR - 1] = setor.nome;
      linha[COL.SEPARADOR - 1] = separador;
      linha[COL.CONFERENTE - 1] = conferente;
      linha[COL.INICIO - 1] = inicio;
      linha[COL.FIM - 1] = fim;
      linha[COL.TIME - 1] = calcularDuracao(inicio, fim); // Time = Fim − Hora início (separação)
      linha[COL.OP_INICIO - 1] = opInicio;
      linha[COL.OP_FIM - 1] = opFim;
      linha[COL.INCONSIST - 1] = inconsistencia ? CONFIG.INCONSIST_SIM : CONFIG.INCONSIST_NAO;
      linha[COL.ATUALIZADO - 1] = agora;
      novas.push(linha);
    });

    const tudo = ordenar(preservado.concat(novas));

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
      mensagem: novas.length
        ? novas.length + ' lançamento(s) salvos às ' + agora.slice(-5)
        : setor.nome + ' salvo sem lançamentos às ' + agora.slice(-5),
    };
  } catch (e) {
    return { ok: false, mensagem: 'Erro ao salvar: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

/** Reescreve uma linha lida da planilha com os tipos canônicos das colunas. */
function canonizar(l) {
  const camTxt = String(l[COL.ROTA - 1]).trim();
  const camNum = Number(camTxt);
  const inicio = normalizarHora(l[COL.INICIO - 1]);
  const fim = normalizarHora(l[COL.FIM - 1]);
  const linha = [];
  linha[COL.DATA - 1] = normalizarData(l[COL.DATA - 1]);
  linha[COL.ROTA - 1] = isNaN(camNum) ? camTxt : camNum;
  linha[COL.SETOR - 1] = String(l[COL.SETOR - 1]).trim();
  linha[COL.SEPARADOR - 1] = String(l[COL.SEPARADOR - 1] || '').trim();
  linha[COL.CONFERENTE - 1] = String(l[COL.CONFERENTE - 1] || '').trim();
  linha[COL.INICIO - 1] = inicio;
  linha[COL.FIM - 1] = fim;
  linha[COL.TIME - 1] = calcularDuracao(inicio, fim);
  linha[COL.OP_INICIO - 1] = normalizarHora(l[COL.OP_INICIO - 1]);
  linha[COL.OP_FIM - 1] = normalizarHora(l[COL.OP_FIM - 1]);
  linha[COL.INCONSIST - 1] = ehSim(l[COL.INCONSIST - 1]) ? CONFIG.INCONSIST_SIM : CONFIG.INCONSIST_NAO;
  linha[COL.ATUALIZADO - 1] = l[COL.ATUALIZADO - 1] || '';
  return linha;
}

/** "Sim" / "sim" / true / "VERDADEIRO" -> true. Qualquer outra coisa -> false. */
function ehSim(valor) {
  if (valor === true) return true;
  const t = String(valor || '').trim().toLowerCase();
  return t === 'sim' || t === 'true' || t === 'verdadeiro';
}

/** Ordena: data crescente; caminhão crescente (menor->maior); setor na ordem do CONFIG. */
function ordenar(linhas) {
  const posSetor = {};
  CONFIG.SETORES.forEach((s, i) => { posSetor[s.nome] = i; });
  const ordemSetor = nome => (nome in posSetor ? posSetor[nome] : 999);
  const numCam = v => { const n = Number(String(v).trim()); return isNaN(n) ? 1e9 : n; };

  return linhas.slice().sort((a, b) => {
    const dA = dataParaNumero(a[COL.DATA - 1]), dB = dataParaNumero(b[COL.DATA - 1]);
    if (dA !== dB) return dA - dB;
    const cA = numCam(a[COL.ROTA - 1]), cB = numCam(b[COL.ROTA - 1]);
    if (cA !== cB) return cA - cB;
    return ordemSetor(String(a[COL.SETOR - 1]).trim()) - ordemSetor(String(b[COL.SETOR - 1]).trim());
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

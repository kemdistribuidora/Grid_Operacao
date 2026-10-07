import test from 'node:test';
import assert from 'node:assert/strict';
import { criarContexto, criarAbaFalsa } from './helpers/mockGas.mjs';

// ---------- normalizarData ----------
test('normalizarData aceita dd/mm/aaaa', () => {
  const ctx = criarContexto();
  assert.equal(ctx.normalizarData('5/7/2026'), '05/07/2026');
});

test('normalizarData aceita objeto Date', () => {
  const ctx = criarContexto();
  assert.equal(ctx.normalizarData(new Date(2026, 6, 15)), '15/07/2026');
});

test('normalizarData rejeita lixo', () => {
  const ctx = criarContexto();
  assert.equal(ctx.normalizarData('lixo'), '');
  assert.equal(ctx.normalizarData(''), '');
});

// ---------- normalizarHora ----------
test('normalizarHora aceita HH:mm e HH:mm:ss', () => {
  const ctx = criarContexto();
  assert.equal(ctx.normalizarHora('8:05'), '08:05');
  assert.equal(ctx.normalizarHora('18:30:00'), '18:30');
});

test('normalizarHora rejeita hora/minuto invalido', () => {
  const ctx = criarContexto();
  assert.equal(ctx.normalizarHora('24:00'), '');
  assert.equal(ctx.normalizarHora('10:60'), '');
  assert.equal(ctx.normalizarHora(''), '');
});

test('normalizarHora aceita Date', () => {
  const ctx = criarContexto();
  assert.equal(ctx.normalizarHora(new Date(2026, 0, 1, 9, 3)), '09:03');
});

// ---------- calcularDuracao ----------
test('calcularDuracao calcula intervalo simples', () => {
  const ctx = criarContexto();
  assert.equal(ctx.calcularDuracao('18:30', '18:50'), '0:20');
});

test('calcularDuracao atravessa meia-noite', () => {
  const ctx = criarContexto();
  assert.equal(ctx.calcularDuracao('23:50', '00:10'), '0:20');
});

test('calcularDuracao com dado faltando retorna vazio', () => {
  const ctx = criarContexto();
  assert.equal(ctx.calcularDuracao('', '18:50'), '');
  assert.equal(ctx.calcularDuracao('18:30', ''), '');
});

// ---------- ehSim ----------
test('ehSim reconhece variacoes de sim', () => {
  const ctx = criarContexto();
  assert.equal(ctx.ehSim('SIM'), true);
  assert.equal(ctx.ehSim('sim'), true);
  assert.equal(ctx.ehSim(true), true);
  assert.equal(ctx.ehSim('VERDADEIRO'), true);
  assert.equal(ctx.ehSim('NÃO'), false);
  assert.equal(ctx.ehSim(''), false);
});

// ---------- acharSetor / getConfig ----------
test('acharSetor encontra por id ou nome', () => {
  const ctx = criarContexto();
  assert.equal(ctx.acharSetor('secos2').nome, 'Secos 2');
  assert.equal(ctx.acharSetor('Resfriados').id, 'resfriados');
  assert.equal(ctx.acharSetor('nao existe'), null);
});

test('getConfig devolve caminhoes, setores e conferentes', () => {
  const ctx = criarContexto();
  const cfg = ctx.getConfig();
  assert.equal(cfg.caminhoes.length, 23);
  assert.equal(cfg.setores.length, 5);
  assert.ok(cfg.conferentes.includes('Alzoni'));
  assert.match(cfg.hoje, /^\d{2}\/\d{2}\/\d{4}$/);
});

// ---------- registrosDeCompacto ----------
test('registrosDeCompacto converte lista compacta em mapa por frota', () => {
  const ctx = criarContexto();
  const registros = ctx.registrosDeCompacto(JSON.stringify([
    ['16', 'Julio', 'Alzoni', '08:00', '08:20', '08:00', '09:00', 1, 'Falta nota']
  ]));
  assert.equal(registros['16'].separador, 'Julio');
  assert.equal(registros['16'].inconsistencia, true);
  assert.equal(registros['16'].motivo, 'Falta nota');
});

test('registrosDeCompacto vazio/undefined vira mapa vazio', () => {
  const ctx = criarContexto();
  assert.equal(Object.keys(ctx.registrosDeCompacto('')).length, 0);
  assert.equal(Object.keys(ctx.registrosDeCompacto(undefined)).length, 0);
});

// ---------- ordenar / dataParaNumero ----------
test('dataParaNumero ordena aaaa mm dd, invalida vai pro fim', () => {
  const ctx = criarContexto();
  assert.equal(ctx.dataParaNumero('15/07/2026'), 20260715);
  assert.equal(ctx.dataParaNumero('lixo'), 99999999);
});

test('ordenar por data, depois caminhao, depois setor', () => {
  const ctx = criarContexto();
  const COL = { DATA: 1, ROTA: 2, SETOR: 3 };
  const linha = (data, rota, setor) => {
    const l = [];
    l[COL.DATA - 1] = data; l[COL.ROTA - 1] = rota; l[COL.SETOR - 1] = setor;
    return l;
  };
  const linhas = [
    linha('16/07/2026', 20, 'Secos 1'),
    linha('15/07/2026', 30, 'Secos 1'),
    linha('15/07/2026', 20, 'Congelados'),
    linha('15/07/2026', 20, 'Secos 1'),
  ];
  const out = ctx.ordenar(linhas);
  assert.deepEqual(out.map(l => [l[COL.DATA - 1], l[COL.ROTA - 1], l[COL.SETOR - 1]]), [
    ['15/07/2026', 20, 'Secos 1'],
    ['15/07/2026', 20, 'Congelados'],
    ['15/07/2026', 30, 'Secos 1'],
    ['16/07/2026', 20, 'Secos 1'],
  ]);
});

// ---------- responder (via doGet ping) ----------
test('doGet acao=ping responde ok sem callback', () => {
  const ctx = criarContexto();
  const saida = ctx.doGet({ parameter: { acao: 'ping' } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.ok, true);
  assert.equal(corpo.dados, 'pong');
  assert.equal(saida._mime, 'JSON');
});

test('doGet acao=ping com callback responde JSONP e sanitiza nome', () => {
  const ctx = criarContexto();
  const saida = ctx.doGet({ parameter: { acao: 'ping', callback: 'cb;alert(1)' } });
  assert.match(saida._texto, /^cbalert1\(/);
  assert.equal(saida._mime, 'JAVASCRIPT');
});

// ---------- carregarSetor ----------
test('carregarSetor rejeita setor desconhecido', () => {
  const aba = criarAbaFalsa();
  const ctx = criarContexto({ aba });
  assert.throws(() => ctx.carregarSetor('15/07/2026', 'inexistente'), /Setor desconhecido/);
});

test('carregarSetor preenche todos os caminhoes, mesmo sem lancamento', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  const r = ctx.carregarSetor('15/07/2026', 'secos1');
  assert.equal(r.temDados, false);
  assert.equal(Object.keys(r.registros).length, 23);
  assert.equal(r.registros['16'].separador, '');
});

test('carregarSetor filtra por data+setor e mapeia lancamento existente', () => {
  const COL = { DATA: 1, ROTA: 2, SETOR: 3, SEPARADOR: 4, CONFERENTE: 5, INICIO: 6, FIM: 7, TIME: 8, OP_INICIO: 9, OP_FIM: 10, INCONSIST: 11, MOTIVO: 12, ATUALIZADO: 13 };
  const linha = [];
  linha[COL.DATA - 1] = '15/07/2026'; linha[COL.ROTA - 1] = '20'; linha[COL.SETOR - 1] = 'Secos 1';
  linha[COL.SEPARADOR - 1] = 'Julio'; linha[COL.CONFERENTE - 1] = 'Alzoni';
  linha[COL.INICIO - 1] = '08:00'; linha[COL.FIM - 1] = '08:20';
  linha[COL.INCONSIST - 1] = 'SIM'; linha[COL.MOTIVO - 1] = 'Atraso';
  const aba = criarAbaFalsa({ existente: [, , ['h'], linha] });
  const ctx = criarContexto({ aba });
  const r = ctx.carregarSetor('15/07/2026', 'secos1');
  assert.equal(r.temDados, true);
  assert.equal(r.registros['20'].separador, 'Julio');
  assert.equal(r.registros['20'].inconsistencia, true);
  assert.equal(r.registros['20'].motivo, 'Atraso');
});

// ---------- salvarSetor ----------
test('salvarSetor rejeita data invalida', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  const r = ctx.salvarSetor({ data: 'lixo', setor: 'secos1', registros: {} });
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /Data inválida/);
});

test('salvarSetor rejeita setor invalido', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  const r = ctx.salvarSetor({ data: '15/07/2026', setor: 'inexistente', registros: {} });
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /Setor inválido/);
});

test('salvarSetor com lock ocupado devolve mensagem amigavel', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba, lockFalha: true });
  const r = ctx.salvarSetor({ data: '15/07/2026', setor: 'secos1', registros: {} });
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /Outra pessoa está salvando/);
});

test('salvarSetor grava so caminhoes preenchidos e calcula Time', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  const r = ctx.salvarSetor({
    data: '15/07/2026', setor: 'secos1',
    registros: { 16: { separador: 'Julio', conferente: 'Alzoni', inicio: '08:00', fim: '08:20' } }
  });
  assert.equal(r.ok, true);
  assert.match(r.mensagem, /1 lançamento\(s\) salvos/);
  const COL = { ROTA: 2, TIME: 8 };
  const linha = aba.getRange(4, 1, 1, 13).getValues()[0];
  assert.equal(linha[COL.ROTA - 1], 16);
  assert.equal(linha[COL.TIME - 1], '0:20');
});

test('salvarSetor preserva lancamentos de outro setor/data e limpa sobra', () => {
  const COL = { DATA: 1, ROTA: 2, SETOR: 3 };
  const outraLinha = []; outraLinha[COL.DATA - 1] = '16/07/2026'; outraLinha[COL.ROTA - 1] = '17'; outraLinha[COL.SETOR - 1] = 'Secos 1';
  const aba = criarAbaFalsa({ existente: [, , ['h'], outraLinha] });
  const ctx = criarContexto({ aba });
  ctx.salvarSetor({ data: '15/07/2026', setor: 'secos1', registros: { 16: { separador: 'Julio' } } });
  const total = aba.getLastRow() - 3;
  assert.equal(total, 2); // outraLinha preservada + 1 nova
});

test('salvarSetor sem nenhum caminhao preenchido nao cria linha', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  const r = ctx.salvarSetor({ data: '15/07/2026', setor: 'secos1', registros: {} });
  assert.equal(r.ok, true);
  assert.match(r.mensagem, /salvo sem lançamentos/);
  assert.equal(aba.getLastRow(), 3);
});

// ---------- doGet / doPost (fluxo completo) ----------
test('doGet acao=config responde config completa', () => {
  const ctx = criarContexto();
  const saida = ctx.doGet({ parameter: { acao: 'config' } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.ok, true);
  assert.equal(corpo.dados.setores.length, 5);
});

test('doGet acao=dia devolve lancamentos do setor', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  const saida = ctx.doGet({ parameter: { acao: 'dia', data: '15/07/2026', setor: 'secos1' } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.ok, true);
  assert.equal(corpo.dados.setor, 'secos1');
});

test('doGet acao=salvar grava e responde resultado numa unica ida', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  const dados = JSON.stringify([['16', 'Julio', 'Alzoni', '08:00', '08:20', '', '', 0, '']]);
  const saida = ctx.doGet({ parameter: { acao: 'salvar', data: '15/07/2026', setor: 'secos1', dados } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.ok, true);
});

test('doGet sem acao devolve config + dia de hoje do setor', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  const saida = ctx.doGet({ parameter: { setor: 'secos2' } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.ok, true);
  assert.ok(corpo.dados.config);
  assert.equal(corpo.dados.dia.setor, 'secos2');
});

test('doGet com erro interno devolve ok:false sem lancar', () => {
  const ctx = criarContexto({ abaAusente: true });
  const saida = ctx.doGet({ parameter: { acao: 'dia', data: '15/07/2026', setor: 'setor-que-nao-existe' } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.ok, false);
  assert.match(corpo.mensagem, /^Erro:/);
});

test('doPost grava payload e responde sucesso', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  const payload = JSON.stringify({ data: '15/07/2026', setor: 'secos1', registros: { 16: { separador: 'Julio' } } });
  const saida = ctx.doPost({ postData: { contents: payload } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.ok, true);
});

test('doPost sem body devolve ok:false sem lancar', () => {
  const ctx = criarContexto();
  const saida = ctx.doPost({});
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.ok, false);
});

test('doPost com JSON invalido devolve ok:false sem lancar', () => {
  const ctx = criarContexto();
  const saida = ctx.doPost({ postData: { contents: '{invalido' } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.ok, false);
  assert.match(corpo.mensagem, /^Erro:/);
});

// ---------- Paletes ----------
test('registrosDeCompacto le paletes na posicao 9', () => {
  const ctx = criarContexto();
  const registros = ctx.registrosDeCompacto(JSON.stringify([
    [16, 'Julio', 'Alzoni', '08:00', '08:20', '', '', 0, '', 12]
  ]));
  assert.equal(registros['16'].paletes, 12);
});

test('normalizarPaletes aceita inteiro e rejeita lixo', () => {
  const ctx = criarContexto();
  assert.equal(ctx.normalizarPaletes('12'), 12);
  assert.equal(ctx.normalizarPaletes(0), 0);
  assert.equal(ctx.normalizarPaletes(' 7 '), 7);
  assert.equal(ctx.normalizarPaletes(''), '');
  assert.equal(ctx.normalizarPaletes(undefined), '');
  assert.equal(ctx.normalizarPaletes('-3'), '');
  assert.equal(ctx.normalizarPaletes('2.5'), '');
  assert.equal(ctx.normalizarPaletes('abc'), '');
});

test('salvarSetor grava Paletes na coluna 14 e carregarSetor devolve', () => {
  const aba = criarAbaFalsa({ existente: [, , ['h']] });
  const ctx = criarContexto({ aba });
  ctx.salvarSetor({
    data: '15/07/2026', setor: 'secos1',
    registros: { 16: { separador: 'Julio', conferente: 'Alzoni', inicio: '08:00', fim: '08:20', paletes: '9' } }
  });
  const linha = aba.getRange(4, 1, 1, 14).getValues()[0];
  assert.equal(linha[13], 9);
  assert.equal(ctx.carregarSetor('15/07/2026', 'secos1').registros['16'].paletes, 9);
});

test('aba antiga com 13 colunas ganha coluna e titulo Paletes', () => {
  const aba = criarAbaFalsa({ existente: [, , ['Data de carregamento']], colunas: 13 });
  const ctx = criarContexto({ aba });
  ctx.carregarSetor('15/07/2026', 'secos1');
  assert.equal(aba.getMaxColumns(), 14);
  assert.equal(aba.getRange(3, 14).getValue(), 'Paletes');
});

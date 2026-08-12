import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODIGO_PATH = path.resolve(__dirname, '../../apps-script/Codigo.gs');

const pad = n => String(n).padStart(2, '0');

/** existente: array de linhas, indice 0 = linha 1 da planilha (base 1). */
export function criarAbaFalsa({ existente = [], nome = 'CARREGAMENTO' } = {}) {
  const grid = new Map();
  existente.forEach((linha, indice) => {
    if (linha) grid.set(indice + 1, linha.slice());
  });

  const maiorLinha = () => {
    let max = 0;
    for (const l of grid.keys()) if (l > max) max = l;
    return max;
  };

  const range = (linha, coluna, numLinhas, numColunas) => ({
    getValues() {
      const out = [];
      for (let i = 0; i < numLinhas; i++) {
        const linhaDados = grid.get(linha + i) || [];
        const out2 = [];
        for (let j = 0; j < numColunas; j++) out2.push(linhaDados[coluna - 1 + j] ?? '');
        out.push(out2);
      }
      return out;
    },
    getValue() {
      return this.getValues()[0][0];
    },
    getDisplayValues() {
      return this.getValues().map(l => l.map(v => {
        if (v instanceof Date) return 'DATA';
        if (v === '' || v === null || v === undefined) return '';
        return String(v);
      }));
    },
    setValues(valores) {
      for (let i = 0; i < valores.length; i++) {
        const linhaDados = grid.get(linha + i) || [];
        for (let j = 0; j < valores[i].length; j++) linhaDados[coluna - 1 + j] = valores[i][j];
        grid.set(linha + i, linhaDados);
      }
      return this;
    },
    clearContent() {
      for (let i = 0; i < numLinhas; i++) grid.delete(linha + i);
      return this;
    },
    setNumberFormat() { return this; },
    setFontWeight() { return this; },
    setBackground() { return this; }
  });

  return {
    _grid: grid,
    getName: () => nome,
    getLastRow: () => maiorLinha(),
    getRange: (l, c, nl = 1, nc = 1) => range(l, c, nl, nc),
    setFrozenRows() {},
    setColumnWidth() {}
  };
}

export function criarContexto({ aba = null, abaAusente = false, fusoHorario = 'America/Sao_Paulo', lockFalha = false } = {}) {
  const sandbox = {
    console, Date, Array, Object, JSON, Number, String, RegExp, Set, Error, Math, isNaN,
    Logger: { log() {} },
    LockService: {
      getScriptLock: () => ({
        waitLock() { if (lockFalha) throw new Error('lock indisponivel'); },
        releaseLock() {}
      })
    },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: () => (abaAusente ? null : aba),
        insertSheet: () => aba,
        getSpreadsheetTimeZone: () => fusoHorario
      }),
      getActiveSpreadsheet: () => null
    },
    Utilities: {
      formatDate: (data, _tz, formato) => {
        if (!(data instanceof Date)) return '';
        if (formato === 'dd/MM/yyyy') return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()}`;
        if (formato === 'HH:mm') return `${pad(data.getHours())}:${pad(data.getMinutes())}`;
        if (formato === 'dd/MM/yyyy HH:mm') return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()} ${pad(data.getHours())}:${pad(data.getMinutes())}`;
        throw new Error(`formato nao suportado no mock: ${formato}`);
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON', JAVASCRIPT: 'JAVASCRIPT' },
      createTextOutput(texto) {
        return {
          _texto: texto,
          _mime: null,
          setMimeType(mime) { this._mime = mime; return this; }
        };
      }
    }
  };

  vm.createContext(sandbox);
  const codigo = fs.readFileSync(CODIGO_PATH, 'utf8');
  new vm.Script(codigo, { filename: 'Codigo.gs' }).runInContext(sandbox);
  return sandbox;
}

/* A dependency-free, uncompressed OOXML workbook. Every calculation is a real Excel formula with cell references, also
   across sheets. Next to each formula cell stand the same formula with variable names (symbolic) and with the numbers
   filled in, without cell addresses. One small formula engine computes the cached values and both text forms from the
   same parsed formula, so the text can never drift from what Excel calculates. */
(function (root) {
  'use strict';
  const enc = new TextEncoder();
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const column = n => { let out = ''; for (; n; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out; return out; };
  const columnIndex = letters => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

  // ------------------------------------------------------------------ formula engine (Excel subset)
  class FormulaError extends Error { constructor(code) { super(code); this.code = code; } }
  const TOKEN = /\s*(?:'((?:[^']|'')+)'!(\$?[A-Z]{1,3}\$?\d+)|([A-Z][A-Z0-9.]*)(?=\()|(\$?[A-Z]{1,3}\$?\d+)|(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|"((?:[^"]|"")*)"|(<=|>=|<>|[-+*/^=<>(),:]))/y;
  function tokenize(src) {
    const out = [];
    let at = 0;
    while (at < src.length) {
      if (/^\s*$/.test(src.slice(at))) break;
      TOKEN.lastIndex = at;
      const m = TOKEN.exec(src);
      if (!m) throw new Error('Onbekende formuletekst bij "' + src.slice(at, at + 12) + '" in ' + src);
      at = TOKEN.lastIndex;
      if (m[2]) out.push({k: 'ref', sheet: m[1].replaceAll("''", "'"), ref: m[2]});
      else if (m[3]) out.push({k: 'fn', name: m[3]});
      else if (m[4]) out.push({k: 'ref', sheet: null, ref: m[4]});
      else if (m[5]) out.push({k: 'num', v: Number(m[5])});
      else if (m[6] !== undefined) out.push({k: 'str', v: m[6].replaceAll('""', '"')});
      else out.push({k: 'op', v: m[7]});
    }
    return out;
  }
  function parse(src) {
    const t = tokenize(src);
    let i = 0;
    const isOp = (...ops) => t[i]?.k === 'op' && ops.includes(t[i].v);
    const fail = what => { throw new Error('Formule: ' + what + ' verwacht in ' + src); };
    const expect = v => { if (!isOp(v)) fail(v); i++; };
    const binary = (next, ops) => () => { let a = next(); while (isOp(...ops)) { const op = t[i++].v; a = {t: 'bin', op, a, b: next()}; } return a; };
    const primary = () => {
      const tok = t[i++];
      if (!tok) fail('waarde');
      if (tok.k === 'num') return {t: 'num', v: tok.v};
      if (tok.k === 'str') return {t: 'str', v: tok.v};
      if (tok.k === 'ref') {
        const ref = tok.ref.replaceAll('$', '');
        if (isOp(':')) { i++; const end = t[i++]; if (end?.k !== 'ref' || end.sheet) fail('celbereik'); return {t: 'range', sheet: tok.sheet, from: ref, to: end.ref.replaceAll('$', '')}; }
        return {t: 'ref', sheet: tok.sheet, ref};
      }
      if (tok.k === 'fn') {
        expect('(');
        const args = [];
        if (!isOp(')')) { args.push(compare()); while (isOp(',')) { i++; args.push(compare()); } }
        expect(')');
        return {t: 'fn', name: tok.name, args};
      }
      if (tok.k === 'op' && tok.v === '(') { const a = compare(); expect(')'); return {t: 'paren', a}; }
      return fail('waarde');
    };
    // As in Excel, a leading minus binds tighter than ^.
    const unary = () => { if (isOp('-')) { i++; return {t: 'neg', a: unary()}; } if (isOp('+')) { i++; return unary(); } return primary(); };
    const power = binary(unary, ['^']);
    const multiply = binary(power, ['*', '/']);
    const add = binary(multiply, ['+', '-']);
    const compare = binary(add, ['=', '<>', '<', '>', '<=', '>=']);
    const ast = compare();
    if (i < t.length) fail('einde');
    return ast;
  }
  const splitRef = ref => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return [columnIndex(m[1]), Number(m[2])]; };
  function expand(node) {
    const [c1, r1] = splitRef(node.from), [c2, r2] = splitRef(node.to), out = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(column(c) + r);
    return out;
  }
  const toNumber = v => {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    throw new FormulaError('#VALUE!');
  };
  const truthy = v => typeof v === 'string' ? (() => { throw new FormulaError('#VALUE!'); })() : Boolean(toNumber(v));
  const equal = (x, y) => {
    const blank = v => v === null || v === undefined;
    if (blank(x)) return blank(y) || y === 0 || y === '' || y === false;
    if (blank(y)) return x === 0 || x === '' || x === false;
    if (typeof x === 'string' && typeof y === 'string') return x.toLowerCase() === y.toLowerCase();
    return typeof x === typeof y && x === y;
  };
  function evaluate(node, sheet, get) {
    const ev = n => evaluate(n, sheet, get);
    const list = args => args.flatMap(arg => arg.t === 'range' ? expand(arg).map(ref => get(arg.sheet || sheet, ref, true)).filter(finite) : [toNumber(ev(arg))]);
    switch (node.t) {
      case 'num': case 'str': return node.v;
      case 'ref': return get(node.sheet || sheet, node.ref);
      case 'paren': return ev(node.a);
      case 'neg': return -toNumber(ev(node.a));
      case 'range': throw new FormulaError('#VALUE!');
      case 'bin': {
        const a = ev(node.a), b = ev(node.b);
        switch (node.op) {
          case '+': return toNumber(a) + toNumber(b);
          case '-': return toNumber(a) - toNumber(b);
          case '*': return toNumber(a) * toNumber(b);
          case '/': { const d = toNumber(b); if (d === 0) throw new FormulaError('#DIV/0!'); return toNumber(a) / d; }
          case '^': { const v = toNumber(a) ** toNumber(b); if (!Number.isFinite(v)) throw new FormulaError('#NUM!'); return v; }
          case '=': return equal(a, b);
          case '<>': return !equal(a, b);
          case '<': return toNumber(a) < toNumber(b);
          case '>': return toNumber(a) > toNumber(b);
          case '<=': return toNumber(a) <= toNumber(b);
          case '>=': return toNumber(a) >= toNumber(b);
        }
        break;
      }
      case 'fn': {
        const args = node.args;
        switch (node.name) {
          case 'IF': return truthy(ev(args[0])) ? ev(args[1]) : args.length > 2 ? ev(args[2]) : false;
          case 'AND': return args.every(arg => truthy(ev(arg)));
          case 'SUM': return list(args).reduce((s, v) => s + v, 0);
          case 'MAX': { const v = list(args); return v.length ? Math.max(...v) : 0; }
          case 'MIN': { const v = list(args); return v.length ? Math.min(...v) : 0; }
          case 'ABS': return Math.abs(toNumber(ev(args[0])));
        }
        throw new Error('Functie niet ondersteund: ' + node.name);
      }
    }
    throw new Error('Onbekende formule-opbouw');
  }

  // Getallen in de ingevulde formules: hele getallen volledig, grote getallen met hooguit twee decimalen, anders zes
  // significante cijfers. De cel zelf houdt de volle precisie.
  const nlNumber = v => {
    if (!finite(v)) return 'niet beschikbaar';
    const abs = Math.abs(v);
    const options = Number.isInteger(v) ? {maximumFractionDigits: 0} : abs >= 1000 ? {maximumFractionDigits: 2} : {maximumSignificantDigits: 6};
    return new Intl.NumberFormat('nl-NL', options).format(v).replace(/^[-−]/, '−');
  };
  const OPS = {'+': ' + ', '-': ' − ', '*': ' × ', '/': ' / ', '^': '^', '=': ' = ', '<>': ' ≠ ', '<': ' < ', '>': ' > ', '<=': ' ≤ ', '>=': ' ≥ '};
  const FN = {IF: 'ALS', AND: 'EN', MAX: 'max', MIN: 'min'};
  // mode 'filled': celverwijzingen worden getallen; mode 'symbolic': celverwijzingen worden variabelenamen.
  function render(node, ctx) {
    const r = n => render(n, ctx);
    const leaf = (sheet, ref) => {
      if (ctx.mode === 'symbolic') return ctx.name(sheet, ref);
      const v = ctx.value(sheet, ref);
      if (typeof v === 'number') return v < 0 ? '(' + nlNumber(v) + ')' : nlNumber(v);
      if (typeof v === 'string') return '"' + v + '"';
      if (typeof v === 'boolean') return v ? 'WAAR' : 'ONWAAR';
      return '0';
    };
    const items = args => args.flatMap(arg => arg.t === 'range' ? expand(arg).filter(ref => ctx.exists(arg.sheet || ctx.sheet, ref)).map(ref => leaf(arg.sheet || ctx.sheet, ref)) : [r(arg)]);
    switch (node.t) {
      case 'num': return node.v < 0 ? '(' + nlNumber(node.v) + ')' : nlNumber(node.v);
      case 'str': return '"' + node.v + '"';
      case 'ref': return leaf(node.sheet || ctx.sheet, node.ref);
      case 'range': return items([node]).join('; ');
      case 'paren': return '(' + r(node.a) + ')';
      case 'neg': return '−' + r(node.a);
      case 'bin': return r(node.a) + OPS[node.op] + r(node.b);
      case 'fn': {
        if (node.name === 'SUM') { const v = items(node.args); return v.length > 1 ? '(' + v.join(' + ') + ')' : v[0] ?? '0'; }
        if (node.name === 'ABS') return '|' + r(node.args[0]) + '|';
        return (FN[node.name] || node.name.toLowerCase()) + '(' + items(node.args).join('; ') + ')';
      }
    }
    return '';
  }

  // ------------------------------------------------------------------ cells
  // name + qualifier geven de variabelenaam in de symbolische formule: binnen dezelfde qualifier alleen de naam,
  // daarbuiten naam[qualifier], bijvoorbeeld lcoh[vergelijking] of kg[2 mod, module 1].
  const text = (value, style = 0) => ({kind: 'value', value, style});
  const header = row => row.map(v => text(v, 1));
  const input = (value, name, qualifier = null, style = 2) => ({kind: 'value', value: finite(value) ? value : null, style, name, qualifier});
  const fx = (expression, name, qualifier = null) => ({kind: 'formula', expression, style: 3, name, qualifier});
  const symbolic = of => ({kind: 'text', of, mode: 'symbolic', style: 4});
  const filled = of => ({kind: 'text', of, mode: 'filled', style: 4});
  const sheetRef = (sheet, ref) => "'" + sheet + "'!" + ref;

  function workbook() {
    const sheets = [], registry = new Map(), names = new Set();
    const keyOf = (sheet, ref) => sheet + '!' + ref;
    function add(name, rows, widths) { sheets.push({name, rows, widths}); names.add(name); }
    function index() {
      for (const {name, rows} of sheets) rows.forEach((row, i) => row.forEach((entry, j) => {
        if (entry === undefined || entry === null || entry === '') return;
        const ref = column(j + 1) + (i + 1);
        if (typeof entry === 'object') { entry.sheet = name; entry.ref = ref; }
        registry.set(keyOf(name, ref), entry);
      }));
    }
    function get(sheet, ref, loose = false) {
      if (!names.has(sheet)) throw new Error('Onbekend blad in formule: ' + sheet);
      const entry = registry.get(keyOf(sheet, ref));
      if (entry === undefined) { if (loose) return null; throw new Error('Formule verwijst naar lege cel ' + keyOf(sheet, ref)); }
      if (typeof entry !== 'object') return entry;
      if (entry.kind === 'formula') { const out = resolve(entry); if (out.error) throw new FormulaError(out.error); return out.value; }
      if (entry.kind === 'text') return textOf(entry);
      return entry.value ?? null;
    }
    function resolve(cell) {
      if (cell.result) return cell.result;
      if (cell.busy) throw new Error('Kringverwijzing in ' + keyOf(cell.sheet, cell.ref));
      cell.busy = true;
      try {
        cell.ast = cell.ast || parse(cell.expression);
        const value = evaluate(cell.ast, cell.sheet, get);
        cell.result = {value: typeof value === 'number' && !Number.isFinite(value) ? null : value};
      } catch (error) {
        if (!(error instanceof FormulaError)) throw error;
        cell.result = {error: error.code};
      } finally { cell.busy = false; }
      return cell.result;
    }
    function nameOf(self) {
      return (sheet, ref) => {
        const target = registry.get(keyOf(sheet, ref));
        if (!target || typeof target !== 'object' || !target.name) return '?';
        return target.qualifier && target.qualifier !== self.qualifier ? target.name + '[' + target.qualifier + ']' : target.name;
      };
    }
    function textOf(entry) {
      const cell = entry.of;
      if (!cell || cell.kind !== 'formula') return '';
      cell.ast = cell.ast || parse(cell.expression);
      const ctx = {mode: entry.mode, sheet: cell.sheet, name: nameOf(cell), exists: (s, r) => registry.has(keyOf(s, r)), value: (s, r) => { try { return get(s, r); } catch (error) { if (error instanceof FormulaError) return error.code; throw error; } }};
      const body = render(cell.ast, ctx);
      return entry.mode === 'symbolic' && cell.name ? cell.name + ' = ' + body : body;
    }
    function serialize({rows, widths}) {
      const body = rows.map((row, i) => '<row r="' + (i + 1) + '">' + row.map((entry, j) => {
        const ref = column(j + 1) + (i + 1);
        if (entry === undefined || entry === null || entry === '') return '';
        const c = typeof entry === 'object' ? entry : text(entry);
        const attrs = ' r="' + ref + '" s="' + c.style + '"';
        if (c.kind === 'formula') {
          const out = resolve(c), v = out.value, f = '<f>' + xml(c.expression) + '</f>';
          if (out.error) return '<c' + attrs + ' t="e">' + f + '<v>' + out.error + '</v></c>';
          if (typeof v === 'boolean') return '<c' + attrs + ' t="b">' + f + '<v>' + (v ? 1 : 0) + '</v></c>';
          if (finite(v)) return '<c' + attrs + '>' + f + '<v>' + v + '</v></c>';
          return '<c' + attrs + ' t="str">' + f + '<v>' + xml(v ?? '') + '</v></c>';
        }
        const value = c.kind === 'text' ? textOf(c) : c.value;
        if (finite(value)) return '<c' + attrs + '><v>' + value + '</v></c>';
        if (value === null || value === undefined || value === '') return '<c' + attrs + '/>';
        return '<c' + attrs + ' t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
      }).join('') + '</row>').join('');
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + widths.map((width, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>').join('') + '</cols><sheetData>' + body + '</sheetData><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>';
    }
    function files() {
      index();
      const out = {
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>',
        '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' + sheets.map(({name}, i) => '<sheet name="' + xml(name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>',
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000000;[Red]-0.000000"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF4A5563"/><name val="Consolas"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C2340"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1CC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4F2E8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
      };
      sheets.forEach((s, i) => { out['xl/worksheets/sheet' + (i + 1) + '.xml'] = serialize(s); });
      return out;
    }
    return {add, files};
  }

  // ------------------------------------------------------------------ the report
  const MOMENT_KEYS = ['capaciteit_mw', 'minimumlast', 'bop_variabel', 'bop_vast', 'systeemverbruik_vol', 'faradayverlies_10', 'deellastvoordeel', 'degradatie_jaar', 'degradatie_jaren'];
  const sumEq = row => Array.isArray(row.eq_uren_per_module) ? row.eq_uren_per_module.reduce((sum, v) => sum + v, 0) : 0;
  const complete = row => Number.isInteger(row?.modules) && row.modules >= 1 && [row.waterstof_t, row.verbruik_mwh, row.standby_mwh].every(finite)
    && Array.isArray(row.eq_uren_per_module) && row.eq_uren_per_module.length === row.modules && row.eq_uren_per_module.every(finite);

  // De kostenketen tot de kostprijs. `A(key)` geeft de cel van een aanname, `J(key)` de cel van een jaaruitkomst.
  const chain = {
    perKw: A => '(' + A('offerte_meur') + '-' + A('offerte_modules') + '*' + A('vaste_kosten_module_meur') + ')*1000000/(' + A('offerte_mw') + '*1000)',
    capex: (A, J, perKw) => perKw + '*' + A('capaciteit_mw') + '*1000+' + J('modules') + '*' + A('vaste_kosten_module_meur') + '*1000000',
    subsidy: A => A('capex_subsidie_eur_kw') + '*' + A('capaciteit_mw') + '*1000',
    crf: A => 'IF(' + A('rente') + '=0,1/' + A('looptijd_jaar') + ',' + A('rente') + '/(1-(1+' + A('rente') + ')^(-' + A('looptijd_jaar') + ')))',
    powerPrice: A => A('stroomprijs_eur_mwh') + '+MAX(0,' + A('netkosten_eur_mwh') + '+' + A('belasting_eur_mwh') + '-' + A('korting_net_belasting_eur_mwh') + ')'
  };

  function build(report) {
    if (!report?.result?.aannames || !report.base || !report.comparison) throw new Error('Geen volledig rekenrapport beschikbaar.');
    const a = report.result.aannames, base = report.base, comparison = report.comparison, ctx = report.context || {};
    for (const row of [base, comparison]) if (!complete(row)) throw new Error('Deze uitkomst bevat niet alle jaargegevens voor een controleerbaar Excel-rapport. Bereken het scenario opnieuw.');
    const book = workbook();
    const has = key => finite(a[key]);

    // ---------------------------------------------------------------- Aannames
    const byKey = new Map((report.assumptions || []).map(v => [v.key, v]));
    const assumptionRows = [header(['Rekensleutel', 'Omschrijving', 'Waarde in rekeneenheid', 'Eenheid', 'Herkomst', 'Toelichting', 'Ondergrens (rekeneenheid)', 'Bovengrens (rekeneenheid)'])];
    const assumptionRow = {};
    for (const [key, value] of Object.entries(a)) {
      const m = byKey.get(key) || {}, scale = finite(m.scale) && m.scale ? m.scale : 1;
      assumptionRow[key] = assumptionRows.length + 1;
      assumptionRows.push([key, m.label || key, input(value, key), scale === 100 ? 'fractie (1 = 100 %)' : m.unit || '', m.source || 'herkomst niet vastgelegd', m.explanation || '',
        finite(m.min) ? input(m.min / scale, key + '_min', null, 0) : '', finite(m.max) ? input(m.max / scale, key + '_max', null, 0) : '']);
    }
    const A = key => { if (!assumptionRow[key]) throw new Error('Aanname ontbreekt: ' + key); return "'Aannames'!$C$" + assumptionRow[key]; };
    const bound = (key, col) => assumptionRows[assumptionRow[key] - 1]?.[col === 'G' ? 6 : 7] ? "'Aannames'!$" + col + '$' + assumptionRow[key] : null;

    // ---------------------------------------------------------------- Jaarinvoer
    const QB = 'basis', QC = 'vergelijking';
    const yearRows = [header(['Rekensleutel', 'Simulatie-uitkomst of afgeleide waarde', 'Eenheid', 'Formule (symbolisch)', 'Basis: ' + base.modules + ' module(s)', 'Basis: ingevulde formule', 'Vergelijking: ' + comparison.modules + ' module(s)', 'Vergelijking: ingevulde formule'])];
    const yearRow = {};
    const J = (key, which) => "'Jaarinvoer'!" + (which === 'b' ? 'E' : 'G') + yearRow[key];
    const both = (key, label, unit, make) => {
      yearRow[key] = yearRows.length + 1;
      const b = make(base, QB, 'E'), c = make(comparison, QC, 'G');
      const formula = [b, c].some(v => v?.kind === 'formula');
      yearRows.push([key, label, unit, formula ? symbolic(b?.kind === 'formula' ? b : c) : 'invoer uit de simulatie', b ?? '', b?.kind === 'formula' ? filled(b) : '', c ?? '', c?.kind === 'formula' ? filled(c) : '']);
    };
    both('modules', 'Aantal modules', 'aantal', (r, q) => input(r.modules, 'modules', q));
    both('ton', 'Waterstof per jaar', 'ton/jaar', (r, q) => input(r.waterstof_t, 'waterstof_ton', q));
    both('kg', 'Waterstof per jaar in kilo', 'kg/jaar', (r, q, col) => fx(col + yearRow.ton + '*1000', 'kg_waterstof', q));
    both('power', 'Productieverbruik', 'MWh/jaar', (r, q) => input(r.verbruik_mwh, 'productieverbruik_mwh', q));
    both('standby', 'Standbyverbruik', 'MWh/jaar', (r, q) => input(r.standby_mwh, 'standby_mwh', q));
    const hoursFirst = yearRows.length + 1, maxModules = Math.max(base.modules, comparison.modules);
    for (let i = 0; i < maxModules; i++) both('hours' + (i + 1), 'Bedrijfsuren module ' + (i + 1), 'uur/jaar', (r, q) => i < r.modules ? input(r.eq_uren_per_module[i], 'uren_module_' + (i + 1), q) : null);
    both('eq', 'Som slijtage-uren van alle modules', 'uur/jaar', (r, q, col) => fx('SUM(' + col + hoursFirst + ':' + col + (hoursFirst + r.modules - 1) + ')', 'slijtage_uren', q));
    both('coverage', 'Dekking vóór jaaromrekening', 'uur', (r, q) => input(r.dekking_uur, 'dekking_uur', q));
    both('supply', 'Windaanbod na jaaromrekening', 'MWh/jaar', (r, q) => input(r.aanbod_mwh, 'aanbod_mwh', q));
    yearRows.push(['Toelichting', 'Geel zijn jaargemiddelden uit de simulatie. Jaarinvoer aanpassen simuleert geen nieuwe technische inzet.']);
    yearRows.push([]);
    yearRows.push(header(['Windjaar', 'Dekking (uur)', 'Omrekenfactor naar 8.760 uur', 'Windaanbod (MWh/jaar)', 'Formule omrekenfactor (symbolisch)', 'Omrekenfactor: ingevulde formule']));
    for (const item of ctx.coverage || []) {
      const n = yearRows.length + 1, q = String(item.year), factor = fx('IF(B' + n + '>0,8760/B' + n + ',"")', 'omrekenfactor', q);
      yearRows.push([item.year, input(item.hours, 'dekking_uur', q), factor, input(item.supplyMwh, 'aanbod_mwh', q, 0), symbolic(factor), filled(factor)]);
    }

    // ---------------------------------------------------------------- Narekenen
    const calcRows = [header(['Rekenstap', 'Eenheid', 'Formule (symbolisch)', 'Basis: ' + base.modules + ' module(s)', 'Basis: ingevulde formule', 'Vergelijking: ' + comparison.modules + ' module(s)', 'Vergelijking: ingevulde formule', 'Toelichting'])];
    const calcRow = {};
    const C = (key, col) => col + calcRow[key];
    // expression(col, w): col is de kolom op Narekenen (D of F), w de kolom op Jaarinvoer ('b' of 'c').
    function step(key, name, label, unit, expression, note = '') {
      calcRow[key] = calcRows.length + 1;
      const b = fx(expression('D', 'b'), name, QB), c = fx(expression('F', 'c'), name, QC);
      calcRows.push([label, unit, symbolic(b), b, filled(b), c, filled(c), note]);
    }
    if (has('capaciteit_mw')) step('moduleMw', 'modulevermogen', 'Stackvermogen per module', 'MW', (col, w) => A('capaciteit_mw') + '/' + J('modules', w));
    if (has('capaciteit_mw') && has('minimumlast')) step('minimumMw', 'minimaal_stackvermogen', 'Minimaal stackvermogen per draaiende module', 'MW', col => C('moduleMw', col) + '*' + A('minimumlast'), 'Exclusief BoP.');
    step('perKw', 'prijs_per_kw', 'Variabele investering per kW', '€/kW', () => chain.perKw(A));
    step('capex', 'capex', 'Totale bruto investering', '€', (col, w) => chain.capex(A, key => J(key, w), C('perKw', col)));
    step('subsidy', 'subsidie', 'Eenmalige investeringssubsidie', '€', () => chain.subsidy(A));
    step('crf', 'annuiteitsfactor', 'Annuïteitsfactor', '1/jaar', () => chain.crf(A), 'Bij 0 % rente: 1 / looptijd.');
    step('annualCapital', 'kapitaal_per_jaar', 'Investering per jaar', '€/jaar', col => '(' + C('capex', col) + '-' + C('subsidy', col) + ')*' + C('crf', col));
    step('opex', 'opex', 'Vaste exploitatiekosten', '€/jaar', col => A('opex_aandeel') + '*' + C('capex', col));
    step('capitalOpex', 'kapitaal_en_opex', 'Kapitaal en vaste OPEX per jaar', '€/jaar', col => C('annualCapital', col) + '+' + C('opex', col));
    step('stack', 'stackvervanging', 'Stackvervanging per jaar', '€/jaar', (col, w) => A('stack_aandeel') + '*(' + C('capex', col) + '/' + J('modules', w) + ')*' + J('eq', w) + '/' + A('stack_levensduur_uur'), 'Continue slijtagebenadering; geen kasstroom op één vervangingsdatum.');
    step('powerPrice', 'stroomprijs_totaal', 'Totale elektriciteitsprijs', '€/MWh', () => chain.powerPrice(A));
    step('energy', 'stroom_mwh', 'Stroom inclusief stand-by', 'MWh/jaar', (col, w) => J('power', w) + '+' + J('standby', w));
    step('electricity', 'stroomkosten', 'Elektriciteitskosten', '€/jaar', col => C('energy', col) + '*' + C('powerPrice', col));
    step('annual', 'jaarkosten', 'Totale jaarkosten', '€/jaar', col => C('capitalOpex', col) + '+' + C('stack', col) + '+' + C('electricity', col));
    step('kwhPerKg', 'kwh_per_kg', 'Stroom per kilo waterstof', 'kWh/kg', (col, w) => 'IF(' + J('kg', w) + '>0,' + C('energy', col) + '*1000/' + J('kg', w) + ',"")');
    step('lcoh', 'lcoh', 'Kostprijs waterstof (LCOH)', '€/kg', (col, w) => 'IF(' + J('kg', w) + '>0,' + C('annual', col) + '/' + J('kg', w) + ',"")', 'Bij nul waterstof is de kostprijs niet gedefinieerd.');
    step('revenue', 'opbrengst_per_kg', 'Premie en zuurstofopbrengst', '€/kg', () => A('waterstofpremie_eur_kg') + '+' + A('zuurstofprijs_eur_t') + '*8/1000', 'Aangenomen: alle 8 kg zuurstof per kg waterstof worden verkocht.');
    step('net', 'netto_lcoh', 'Netto kostprijs na opbrengsten', '€/kg', (col, w) => 'IF(' + J('kg', w) + '>0,' + C('lcoh', col) + '-' + C('revenue', col) + ',"")');
    calcRows.push([]);
    calcRows.push(header(['Verschil', 'Eenheid', 'Formule (symbolisch)', 'Uitkomst', 'Ingevulde formule', '', '', 'Toelichting']));
    const difference = (key, name, label, unit, expression, note = '') => {
      calcRow[key] = calcRows.length + 1;
      const cell = fx(expression, name);
      calcRows.push([label, unit, symbolic(cell), cell, filled(cell), '', '', note]);
    };
    difference('deltaLcoh', 'verschil_lcoh', 'Verschil LCOH (vergelijking − basis)', '€/kg', 'IF(AND(' + J('kg', 'b') + '>0,' + J('kg', 'c') + '>0),' + C('lcoh', 'F') + '-' + C('lcoh', 'D') + ',"")', 'Negatief betekent goedkoper.');
    difference('extraKg', 'extra_kg', 'Extra waterstof', 'kg/jaar', J('kg', 'c') + '-' + J('kg', 'b'));
    difference('extraCost', 'extra_jaarkosten', 'Extra jaarkosten', '€/jaar', C('annual', 'F') + '-' + C('annual', 'D'));
    difference('marginal', 'kosten_extra_kg', 'Kosten extra kilo’s', '€/extra kg', 'IF(' + C('extraKg', 'D') + '>0,' + C('extraCost', 'D') + '/' + C('extraKg', 'D') + ',"")', 'Alleen bij meer productie. Marginale kosten verschillen van de gemiddelde kostprijs (LCOH).');
    const N = (key, col) => "'Narekenen'!" + C(key, col);

    // ---------------------------------------------------------------- Uitsplitsing
    const partRows = [header(['Deel van het kostprijsverschil', 'Eenheid', 'Formule (symbolisch)', 'Uitkomst', 'Ingevulde formule', 'Toelichting'])];
    const guard = expression => 'IF(AND(' + J('kg', 'b') + '>0,' + J('kg', 'c') + '>0),' + expression + ',"")';
    const partCells = [];
    const part = (name, label, expression, note) => { const cell = fx(guard(expression), name); partCells.push(cell); partRows.push([label, '€/kg', symbolic(cell), cell, filled(cell), note]); };
    part('meer_waterstof', 'Meer waterstof', '(' + N('capitalOpex', 'D') + '+' + N('stack', 'D') + ')*(1/' + J('kg', 'c') + '-1/' + J('kg', 'b') + ')', 'Dezelfde vaste kosten verdeeld over meer of minder kilo’s.');
    part('andere_installatie', 'Andere installatiekosten', '(' + N('capitalOpex', 'F') + '-' + N('capitalOpex', 'D') + ')/' + J('kg', 'c'), 'Verschil in kapitaal en vaste OPEX per kilo van de vergelijking.');
    part('ander_stroomverbruik', 'Ander stroomverbruik per kilo', N('electricity', 'F') + '/' + J('kg', 'c') + '-' + N('electricity', 'D') + '/' + J('kg', 'b'), 'Stroomkosten per kilo, vergelijking − basis.');
    part('andere_stackvervanging', 'Andere stackvervanging', '(' + N('stack', 'F') + '-' + N('stack', 'D') + ')/' + J('kg', 'c'), 'Verschil in stackkosten per kilo van de vergelijking.');
    const partSum = fx(guard('D2+D3+D4+D5'), 'som_uitsplitsing');
    partRows.push(['Som van de delen', '€/kg', symbolic(partSum), partSum, filled(partSum), 'Telt op tot het kostprijsverschil.']);
    const partDelta = fx(N('deltaLcoh', 'D'), 'verschil_lcoh');
    partRows.push(['Kostprijsverschil volgens Narekenen', '€/kg', symbolic(partDelta), partDelta, filled(partDelta), '']);
    const partCheck = fx('IF(AND(' + J('kg', 'b') + '>0,' + J('kg', 'c') + '>0),D6-D7,"")', 'afwijking');
    partRows.push(['Afwijking (moet 0 zijn)', '€/kg', symbolic(partCheck), partCheck, filled(partCheck), 'Een afwijking van nul (afgezien van afrondingsruis) bewijst dat de uitsplitsing sluit.']);

    // ---------------------------------------------------------------- Toetsgevallen
    const m = report.materiality, allRows = (report.result.rijen || []).filter(row => finite(row.lcoh_eur_kg));
    const tested = m?.testCases?.length && Array.isArray(m.testedModules) ? m.testedModules.map(n => allRows.find(row => row.modules === n)) : [];
    let caseRows = null;
    if (tested.length >= 2 && tested.every(complete)) {
      caseRows = [header(['Toetsgeval', 'Aantal modules', 'Rekenstap', 'Formule (symbolisch)', 'Uitkomst', 'Ingevulde formule', 'Eenheid'])];
      caseRows.push(['Gebruik', '', 'Elk toetsgeval verandert één kostenaanname en rekent de kostprijs van elk aantal modules opnieuw uit, met dezelfde gesimuleerde productie en hetzelfde stroomverbruik. Dit zijn dezelfde toetsgevallen als in de conclusie op de pagina.']);
      caseRows.push([]);
      caseRows.push(header(['Jaaruitkomsten', 'Aantal modules', 'Rekenstap', 'Formule (symbolisch)', 'Uitkomst', 'Ingevulde formule', 'Eenheid']));
      const own = {};
      for (const row of tested) {
        const q = row.modules + ' mod', w = row === base ? 'b' : row === comparison ? 'c' : row.modules === base.modules ? 'b' : row.modules === comparison.modules ? 'c' : null;
        const at = {};
        const line = (key, name, label, unit, make) => {
          at[key] = 'E' + (caseRows.length + 1);
          const cell = make();
          caseRows.push(['Jaaruitkomst', row.modules, label, cell.kind === 'formula' ? symbolic(cell) : 'invoer uit de simulatie', cell, cell.kind === 'formula' ? filled(cell) : '', unit]);
        };
        const linked = (key, name, value) => w && yearRow[key] ? fx(J(key, w), name, q) : input(value, name, q);
        line('modules', 'modules', 'Aantal modules', 'aantal', () => linked('modules', 'modules', row.modules));
        line('ton', 'waterstof_ton', 'Waterstof per jaar', 'ton/jaar', () => linked('ton', 'waterstof_ton', row.waterstof_t));
        line('kg', 'kg_waterstof', 'Waterstof per jaar in kilo', 'kg/jaar', () => fx(at.ton + '*1000', 'kg_waterstof', q));
        line('power', 'productieverbruik_mwh', 'Productieverbruik', 'MWh/jaar', () => linked('power', 'productieverbruik_mwh', row.verbruik_mwh));
        line('standby', 'standby_mwh', 'Standbyverbruik', 'MWh/jaar', () => linked('standby', 'standby_mwh', row.standby_mwh));
        const first = caseRows.length + 1;
        row.eq_uren_per_module.forEach((hours, i) => line('hours' + (i + 1), 'uren_module_' + (i + 1), 'Bedrijfsuren module ' + (i + 1), 'uur/jaar', () => linked('hours' + (i + 1), 'uren_module_' + (i + 1), hours)));
        line('eq', 'slijtage_uren', 'Som slijtage-uren', 'uur/jaar', () => fx('SUM(E' + first + ':E' + (caseRows.length) + ')', 'slijtage_uren', q));
        own[row.modules] = at;
      }
      const label = key => byKey.get(key)?.label || key;
      const cases = [{key: null, kind: 'uitgangspunt'}, ...m.testCases];
      for (const item of cases) {
        const title = !item.key ? 'Uitgangspunt: alle aannames zoals ingevoerd'
          : item.kind === 'band' ? label(item.key) + ': rand van de bandbreedte (' + nlNumber(item.value) + ')'
          : label(item.key) + ' 25 % ' + (item.kind === 'laag' ? 'lager' : 'hoger');
        caseRows.push([]);
        caseRows.push(header([title, '', '', '', '', '', '']));
        let varied = null;
        if (item.key) {
          let expression;
          if (item.kind === 'band') {
            // Zoals materiality() in report-model.js: de randen zijn MIN(0,3; eigen waarde) en MAX(2; eigen waarde).
            const low = Math.abs(item.value - Math.min(0.3, a[item.key])) < Math.abs(item.value - Math.max(2, a[item.key]));
            expression = low ? 'MIN(0.3,' + A(item.key) + ')' : 'MAX(2,' + A(item.key) + ')';
          } else {
            expression = A(item.key) + '*' + (item.kind === 'laag' ? '0.75' : '1.25');
            const lo = bound(item.key, 'G'), hi = bound(item.key, 'H');
            if (lo) expression = 'MAX(' + lo + ',' + expression + ')';
            if (hi) expression = 'MIN(' + hi + ',' + expression + ')';
          }
          const cell = fx(expression, item.key + '_toets');
          varied = 'E' + (caseRows.length + 1);
          caseRows.push([title, '', 'Gewijzigde aanname: ' + label(item.key), symbolic(cell), cell, filled(cell), byKey.get(item.key)?.unit || '']);
        }
        const V = key => key === item.key ? varied : A(key);
        const helper = {};
        const line = (key, name, step, unit, expression, q = null, modules = '') => {
          helper[key] = 'E' + (caseRows.length + 1);
          const cell = fx(expression, name, q);
          caseRows.push([title, modules, step, symbolic(cell), cell, filled(cell), unit]);
          return cell;
        };
        line('perKw', 'prijs_per_kw', 'Variabele investering per kW', '€/kW', chain.perKw(V));
        line('subsidy', 'subsidie', 'Eenmalige investeringssubsidie', '€', chain.subsidy(V));
        line('crf', 'annuiteitsfactor', 'Annuïteitsfactor', '1/jaar', chain.crf(V));
        line('powerPrice', 'stroomprijs_totaal', 'Totale elektriciteitsprijs', '€/MWh', chain.powerPrice(V));
        const lcohRefs = [];
        for (const row of tested) {
          const at = own[row.modules], q = row.modules + ' mod';
          const capex = 'E' + (caseRows.length + 1);
          line('capex' + row.modules, 'capex', 'Totale bruto investering', '€', chain.capex(V, key => at[key], helper.perKw), q, row.modules);
          lcohRefs.push(['E' + (caseRows.length + 1), row.modules]);
          line('lcoh' + row.modules, 'lcoh', 'Kostprijs waterstof (LCOH)', '€/kg',
            'IF(' + at.kg + '>0,((' + capex + '-' + helper.subsidy + ')*' + helper.crf + '+' + V('opex_aandeel') + '*' + capex + '+' + V('stack_aandeel') + '*' + capex + '/' + at.modules + '*' + at.eq + '/' + V('stack_levensduur_uur') + '+(' + at.power + '+' + at.standby + ')*' + helper.powerPrice + ')/' + at.kg + ',"")', q, row.modules);
        }
        const all = lcohRefs.map(([ref]) => ref).join(',');
        const cheapest = lcohRefs.slice(0, -1).reduceRight((rest, [ref, n]) => 'IF(' + ref + '=MIN(' + all + '),' + n + ',' + rest + ')', String(lcohRefs[lcohRefs.length - 1][1]));
        line('cheapest', 'goedkoopste_aantal', 'Goedkoopste aantal modules in dit toetsgeval', 'modules', cheapest);
      }
    }

    // ---------------------------------------------------------------- Controle
    const checkRows = [header(['Controle', 'Eenheid', 'Uitkomst pagina: basis', 'Uitkomst pagina: vergelijking', 'Verschil Excel − pagina: basis', 'Verschil Excel − pagina: vergelijking', 'Formule (symbolisch)', 'Basis: ingevulde formule', 'Vergelijking: ingevulde formule'])];
    for (const [key, field, scale, unit, name] of [['capex', 'capex_meur', 1e6, '€', 'capex'], ['capitalOpex', 'kapitaal_meur_jaar', 1e6, '€/jaar', 'kapitaal_en_opex'], ['stack', 'stack_meur_jaar', 1e6, '€/jaar', 'stackvervanging'], ['electricity', 'stroom_meur_jaar', 1e6, '€/jaar', 'stroomkosten'], ['annual', 'kosten_meur_jaar', 1e6, '€/jaar', 'jaarkosten'], ['lcoh', 'lcoh_eur_kg', 1, '€/kg', 'lcoh'], ['net', 'netto_eur_kg', 1, '€/kg', 'netto_lcoh']]) {
      const n = checkRows.length + 1, bv = finite(base[field]) ? base[field] * scale : null, ev = finite(comparison[field]) ? comparison[field] * scale : null;
      // Zonder waterstof is de kostprijs in Excel leeg (""); dan is er ook geen verschil.
      const gap = (cell, page) => 'IF(' + cell + '="","",' + cell + '-' + page + ')';
      const db = fx(bv !== null ? gap(N(key, 'D'), 'C' + n) : '""', 'verschil_' + name, QB), dc = fx(ev !== null ? gap(N(key, 'F'), 'D' + n) : '""', 'verschil_' + name, QC);
      checkRows.push([field, unit, bv === null ? '' : input(bv, 'pagina_' + name, QB, 0), ev === null ? '' : input(ev, 'pagina_' + name, QC, 0), db, dc, symbolic(bv !== null ? db : dc), filled(db), filled(dc)]);
    }
    checkRows.push(['Interpretatie', 'Een verschil van nul (afgezien van afrondingsruis) betekent dat de kostenformules aansluiten op de opgeslagen pagina-uitkomst.']);
    for (const check of report.checks || []) checkRows.push([check.label, check.ok ? 'Sluit aan' : 'Controleer', check.detail]);

    // ---------------------------------------------------------------- Tienminuten
    let momentRows = null;
    if (report.moments) momentRows = moments(report.moments, A, MOMENT_KEYS.every(has));

    // ---------------------------------------------------------------- Leeswijzer
    const sheetList = ['Aannames: alle invoer', 'Jaarinvoer: jaaruitkomsten van de simulatie', 'Narekenen: de kostenketen tot de kostprijs', 'Uitsplitsing: waar het kostprijsverschil vandaan komt', ...(caseRows ? ['Toetsgevallen: elke kostenaanname 25 % lager en hoger'] : []), 'Controle: aansluiting op de pagina', ...(momentRows ? ['Tienminuten: drie momenten van één dag, van wind tot kilo’s'] : [])];
    const infoRows = [header(['Rekenrapport · Elektrolyser opsplitsen', 'Waarde']),
      ['Gebruik', 'Elke berekening is een echte Excel-formule met verwijzingen naar cellen, ook naar andere bladen. Klik op een groene cel om de formule te zien.'],
      ['Bladen', sheetList.join(' · ')],
      ['Geel', 'Bewerkbare numerieke invoer. Aannames staan in oorspronkelijke rekeneenheden; percentages zijn fracties.'],
      ['Groen', 'Excel-formules. De opgeslagen uitkomsten zijn direct zichtbaar; Excel rekent opnieuw bij openen of wijzigen.'],
      ['Formule (symbolisch)', 'Dezelfde formule met namen in plaats van celadressen, bijvoorbeeld lcoh = jaarkosten / kg_waterstof. Een naam met [ ] hoort bij een andere opstelling of module, bijvoorbeeld lcoh[vergelijking].'],
      ['Ingevulde formule', 'Dezelfde formule met de getallen ingevuld, zonder celadressen. ALS(voorwaarde; dan; anders) is de Excel-functie IF; getallen zijn afgerond weergegeven, de cel rekent met volle precisie. Na het wijzigen van invoer klopt de ingevulde tekst pas weer na een nieuwe export.'],
      ['Reikwijdte', 'Excel rekent de kosten na op vaste jaaruitkomsten. Een wijziging van techniek, moduleaantal of wind vraagt een nieuwe simulatie op de website.'],
      ['Belangrijk', 'Wijziging van minimumlast, rendement, storingen of levensduur kan productie/slijtage veranderen. Deze technische doorwerking wordt niet opnieuw gesimuleerd in Excel; alleen de tienminutenmomenten rekenen de kilo’s van die momenten opnieuw uit.'],
      ['Vermogenscurve', 'Het vermogen per turbine is een uitkomst van de vermogenscurve van het rekenmodel en staat als gele invoer op Tienminuten.'],
      ['Vergelijking', base.modules + ' module(s) tegenover ' + comparison.modules + ' module(s), met gelijk totaalvermogen.'],
      ['Windjaren', (ctx.years || report.result.jaren || []).join(', ')],
      ['Besturing', ctx.strategy || report.result.strategie || ''],
      ['Stand-by', (ctx.standby || report.result.standbybeleid || 'vast') === 'voorspelling' ? 'Met voorspelling' : 'Vast'],
      ['Technologie', ctx.technology || report.result.technologie || 'Niet vastgelegd'],
      ['Modelversie', ctx.modelVersion ?? report.result.model_versie ?? 'Niet vastgelegd'],
      ['Berekeningssleutel', ctx.key || report.result.sleutel || 'Niet vastgelegd'],
      ['Rapport gemaakt (ISO)', report.generatedAt || new Date().toISOString()],
      ['Windmethode', ctx.windMethod || report.result.windmethode || 'Niet vastgelegd'],
      ['Windaanbod', ctx.windExplanation || report.result.windmethode_uitleg || ''],
      ['Windprofiel', ctx.windProfileName || ctx.windProfile || 'Niet vastgelegd'],
      ['Windparken', ctx.parksText || 'Niet vastgelegd'],
      ['Jaaromrekening', ctx.annualisation || 'De simulatie schaalt geldige tienminutenstappen naar 8.760 uur. Jaaruitkomsten worden gemiddeld over de gekozen windjaren.'],
      ['Controle', 'Sluitende kostenformules bewijzen de rekenkundige aansluiting; aannames en windmodel bepalen de toepasbaarheid.']];
    for (const limitation of ctx.limitations || []) infoRows.push(['Beperking', limitation]);

    book.add('Leeswijzer', infoRows, [40, 115]);
    book.add('Aannames', assumptionRows, [36, 45, 24, 28, 30, 90, 18, 18]);
    book.add('Jaarinvoer', yearRows, [20, 40, 14, 48, 24, 40, 24, 40]);
    book.add('Narekenen', calcRows, [40, 14, 70, 22, 60, 22, 60, 60]);
    book.add('Uitsplitsing', partRows, [36, 10, 80, 18, 70, 60]);
    if (caseRows) book.add('Toetsgevallen', caseRows, [44, 14, 40, 80, 20, 90, 12]);
    book.add('Controle', checkRows, [40, 26, 24, 24, 24, 24, 50, 40, 40]);
    if (momentRows) book.add('Tienminuten', momentRows, [24, 26, 44, 70, 18, 70, 12]);
    return zip(book.files());
  }

  // Tien minuten van dichtbij: de ruwe dagwaarden zijn gele invoer, elke rekenstap een formule.
  function moments(data, A, live) {
    const rows = [header(['Moment', 'Configuratie', 'Rekenstap', 'Formule (symbolisch)', 'Uitkomst', 'Ingevulde formule', 'Eenheid'])];
    rows.push(['Datum', data.date || 'Niet beschikbaar']);
    rows.push(['Gebruik', live ? 'Geel is de afgeronde invoer uit het dagantwoord; groen rekent met de aannames op Aannames. Wijzig je daar bijvoorbeeld de BoP of de minimumlast, dan rekenen de kilo’s van deze momenten mee.' : 'Deze momenten staan als tekst: de uitkomst mist aannames om ze als formule op te bouwen.']);
    for (const note of data.notes || []) rows.push(['Toelichting', note]);
    for (const moment of data.moments || []) {
      rows.push([]); rows.push(header([moment.title, '', 'Selectie', moment.criterion, '', '', '']));
      if (moment.available === false) { rows.push(['Geen moment beschikbaar']); continue; }
      const stamp = finite(moment.timestamp) ? new Intl.DateTimeFormat('nl-NL', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam'}).format(new Date(moment.timestamp * 1000)) : '';
      rows.push([moment.title, 'Tijd (Nederland)', stamp]);
      const t = moment.title;
      const at = () => 'E' + (rows.length + 1);
      const line = (config, label, unit, cell) => { const ref = at(); rows.push([t, config, label, cell.kind === 'formula' ? symbolic(cell) : 'invoer uit het dagantwoord', cell, cell.kind === 'formula' ? filled(cell) : '', unit]); return ref; };
      const textRows = (list, config) => { for (const step of list || []) rows.push([t, config, step.label, step.formula + ' · ' + step.expression, input(step.value, null, null, 0), '', step.unit]); };
      if (!live) {
        textRows(moment.wind, 'Windaanbod');
        for (const config of moment.configurations || []) {
          const label = config.modules + ' module(s)';
          textRows(config.rows, label);
          for (const module of config.moduleRows || []) textRows(module.rows, label + ' · module ' + module.module);
        }
        continue;
      }
      // Wind: van gemeten wind op 10 m tot het aanbod voor de elektrolyser.
      const wind = moment.windInput;
      if (wind) {
        for (const station of wind.stations || []) line('Windaanbod', station.label + ': KNMI-meting op 10 m', 'm/s', input(station.value, 'knmi_wind', station.label));
        const supplyParts = [];
        for (const park of wind.parks || []) {
          const q = park.label, c = 'Windaanbod · ' + park.label;
          const v10 = line(c, 'Gekozen wind op 10 m (' + park.rule + ')', 'm/s', input(park.v10, 'v10', q));
          let hub;
          if (park.hoogtevertaling === 'alpha') {
            const height = line(c, 'Ashoogte', 'm', input(park.ashoogte, 'ashoogte', q));
            const alpha = line(c, 'Hoogte-exponent α', '-', input(park.alpha, 'alpha', q));
            hub = line(c, 'Wind op ashoogte', 'm/s', fx(v10 + '*(' + height + '/10)^' + alpha, 'v_as', q));
          } else {
            const factor = line(c, 'Maandfactor naar ashoogte', '-', input(park.factor, 'maandfactor', q));
            hub = line(c, 'Wind op ashoogte', 'm/s', fx(v10 + '*' + factor, 'v_as', q));
          }
          const wake = line(c, 'Zogverlies', 'fractie', input(park.zog, 'zogverlies', q));
          line(c, 'Wind na zog', 'm/s', fx(hub + '*(1-' + wake + ')', 'v_turbine', q));
          const kw = line(c, 'Vermogen per turbine uit de vermogenscurve', 'kW', input(park.turbine_kw, 'turbine_kw', q));
          const count = line(c, 'Aantal turbines', 'aantal', input(park.turbines, 'turbines', q));
          let mw = line(c, 'Parkvermogen', 'MW', fx(kw + '*' + count + '/1000', 'park_mw', q));
          if (finite(park.dagfactor)) {
            const day = line(c, 'Dagfactor naar gemeten dagproductie', '-', input(park.dagfactor, 'dagfactor', q));
            mw = line(c, 'Geschaald naar gemeten dagproductie', 'MW', fx(mw + '*' + day, 'park_mw_geschaald', q));
          }
          const share = line(c, 'Toegewezen aandeel', 'fractie', input(park.share, 'aandeel', q));
          supplyParts.push(mw + '*' + share);
        }
        if (supplyParts.length) line('Windaanbod', 'Aanbod voor de elektrolyser', 'MW', fx(supplyParts.join('+'), 'aanbod'));
        line('Windaanbod', 'Aanbod volgens het dagantwoord', 'MW', input(wind.supply, 'aanbod_dagantwoord'));
      } else textRows(moment.wind, 'Windaanbod');
      // Elektrolyser: per configuratie en per module.
      for (const config of moment.configurations || []) {
        const cq = config.modules + ' mod', label = config.modules + ' module(s)';
        const count = line(label, 'Aantal modules', 'aantal', input(config.modules, 'modules', cq));
        const size = line(label, 'Vermogen per module', 'MW', fx(A('capaciteit_mw') + '/' + count, 'modulevermogen', cq));
        line(label, 'Startdrempel inclusief BoP', 'MW', fx(A('minimumlast') + '*' + size + '*(1+' + A('bop_variabel') + ')+' + A('bop_vast') + '*' + size, 'startdrempel', cq));
        const secFull = line(label, 'Stackverbruik bij vollast, nieuw', 'kWh/kg', fx(A('systeemverbruik_vol') + '*(1-' + A('faradayverlies_10') + '*0.1)/(1+' + A('bop_variabel') + '+' + A('bop_vast') + ')', 'stackverbruik_vol_nieuw', cq));
        const ageing = line(label, 'Gemiddelde degradatie (meer verbruik per kg)', 'fractie', fx(A('degradatie_jaar') + '*' + A('degradatie_jaren') + '/2', 'degradatie', cq));
        for (const reason of config.reasons || []) rows.push([t, label, 'Besturing', reason]);
        const stacks = [], powers = [], kgs = [], traces = [];
        for (const module of config.moduleRows || []) {
          const mq = cq + ', module ' + module.module, c = label + ' · module ' + module.module;
          const start = finite(module.startMinutes) ? module.startMinutes : finite(module.productiveFraction) ? 10 - 10 * module.productiveFraction : 0;
          const s = line(c, 'Stackvermogen (gekozen door de besturing)', 'MW', input(module.stackMw, 'stackvermogen', mq));
          const st = line(c, 'Opstartminuten', 'min', input(start, 'opstartminuten', mq));
          const load = line(c, 'Lastfractie', 'fractie', fx(s + '/' + size, 'last', mq));
          powers.push(line(c, 'Elektrisch vermogen inclusief BoP', 'MW', fx('IF(' + s + '>0,' + s + '*(1+' + A('bop_variabel') + ')+' + A('bop_vast') + '*' + size + ',0)', 'vermogen', mq)));
          const sec = line(c, 'Stackverbruik bij deze last en degradatie', 'kWh/kg', fx('IF(' + s + '>0,' + secFull + '*(1-' + A('deellastvoordeel') + '*(1-' + load + '))*(1+' + ageing + '),"")', 'stackverbruik', mq));
          const faraday = line(c, 'Faradayfactor', 'fractie', fx('IF(' + s + '>0,MAX(0,1-' + A('faradayverlies_10') + '*0.1/' + load + '),0)', 'faradayfactor', mq));
          const productive = line(c, 'Productief deel van tien minuten', 'fractie', fx('MAX(0,10-' + st + ')/10', 'productief_deel', mq));
          kgs.push(line(c, 'Waterstof in tien minuten', 'kg', fx('IF(AND(' + s + '>0,' + load + '>=' + A('minimumlast') + '-0.000000001),' + s + '*1000/' + sec + '*' + faraday + '/6*' + productive + ',0)', 'kg', mq)));
          traces.push(line(c, 'Waterstof volgens het dagantwoord', 'kg', input(module.traceKg, 'kg_dagantwoord', mq)));
          stacks.push(s);
        }
        if (!stacks.length) continue;
        line(label, 'Actieve modules', 'modules', fx(stacks.map(s => '(' + s + '>0)').join('+'), 'actieve_modules', cq));
        const power = line(label, 'Totaal draaiend verbruik', 'MW', fx('SUM(' + powers.join(',') + ')', 'vermogen_totaal', cq));
        line(label, 'Stroom in tien minuten', 'kWh', fx(power + '*1000/6', 'stroom_kwh', cq));
        const kg = line(label, 'Berekende waterstof', 'kg', fx('SUM(' + kgs.join(',') + ')', 'kg_totaal', cq));
        const trace = line(label, 'Waterstof volgens het dagantwoord', 'kg', fx('SUM(' + traces.join(',') + ')', 'kg_dagantwoord_totaal', cq));
        const delta = line(label, 'Verschil narekenen − dagantwoord', 'kg', fx(kg + '-' + trace, 'verschil_kg', cq));
        const tolerance = line(label, 'Tolerantie door afgeronde tussenwaarden', 'kg', fx('0.005*MAX(1,' + count + ')', 'tolerantie', cq));
        line(label, 'Controle waterstof', '', fx('IF(ABS(' + delta + ')<=' + tolerance + ',"Sluit aan","Controleer")', 'controle', cq));
        if (config.check && config.check.ok === null) rows.push([t, label, 'Let op', config.check.detail]);
      }
    }
    return rows;
  }

  function zip(files) {
    const chunks = [], central = []; let offset = 0;
    const u16 = (view, i, n) => view.setUint16(i, n, true), u32 = (view, i, n) => view.setUint32(i, n >>> 0, true);
    const table = Array.from({length: 256}, (_, n) => { for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
    for (const [path, content] of Object.entries(files)) {
      const name = enc.encode(path), data = enc.encode(content); let crc = 0xffffffff; for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0;
      const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer); u32(l, 0, 0x04034b50); u16(l, 4, 20); u16(l, 6, 0x800); u16(l, 12, 33); u32(l, 14, crc); u32(l, 18, data.length); u32(l, 22, data.length); u16(l, 26, name.length); local.set(name, 30);
      const dir = new Uint8Array(46 + name.length), d = new DataView(dir.buffer); u32(d, 0, 0x02014b50); u16(d, 4, 20); u16(d, 6, 20); u16(d, 8, 0x800); u16(d, 14, 33); u32(d, 16, crc); u32(d, 20, data.length); u32(d, 24, data.length); u16(d, 28, name.length); u32(d, 42, offset); dir.set(name, 46);
      chunks.push(local, data); central.push(dir); offset += local.length + data.length;
    }
    const size = central.reduce((sum, c) => sum + c.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer); u32(e, 0, 0x06054b50); u16(e, 8, central.length); u16(e, 10, central.length); u32(e, 12, size); u32(e, 16, offset);
    const out = new Uint8Array(offset + size + end.length); let at = 0; for (const c of [...chunks, ...central, end]) { out.set(c, at); at += c.length; } return out;
  }

  // parse/evaluate/render staan open voor de tests; ze veranderen niets aan het werkboek.
  root.OpsReportExcel = Object.freeze({build, formula: Object.freeze({parse, evaluate, render, nlNumber})});
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OpsReportExcel;
})(globalThis);

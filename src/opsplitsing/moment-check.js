/* Eén moment van tien minuten uit de jaarrun narekenen.

   Het antwoord van /api/opsplitsing/moment (opsplitsing.py, moment_trace) bevat de toestand vóór de stap en elke tussenuitkomst
   van dezelfde simulatie als Bereken, onafgerond. Hier wordt die stap opnieuw opgebouwd: de toestand vóór de stap en de aannames
   zijn gele invoer, al het andere zijn Excel-formules met celverwijzingen. Dezelfde cellen vullen de tabel op de pagina en het
   Excel-bestand, en elke formule staat naast de waarde uit de simulatie met een controle ("klopt" binnen 10⁻⁹ relatief).

   De formules volgen simulate() in opsplitsing.py regel voor regel: desired_count, equal_share, sequential_loads, stack_kg_h,
   draw_mw, de opstartminuten en het warmhouden. Bij stand-by ‘met voorspelling’ beslist een windvoorspelling over starten en
   warmhouden; die besluiten (toegestane starts, volgorde, warm gehouden) zijn dan invoer uit de simulatie. */
(function (root) {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const TOL = '0.000000001';
  const STEP = '(1/6)';
  const plural = n => n === 1 ? '1 module' : n + ' modules';
  const STRATEGY = {verdelen: 'verdelen', bijschakelen: 'bijschakelen', samen: 'samen'};

  // Aannames die één tijdstap gebruikt, in rekeneenheden van het model (percentages als fractie).
  const ASSUMPTIONS = [
    ['capaciteit_mw', 'Totaal stackvermogen', 'MW'],
    ['minimumlast', 'Minimumlast per module', 'fractie'],
    ['systeemverbruik_vol', 'Energieverbruik bij vollast (systeem, nieuwe stack)', 'kWh/kg'],
    ['deellastvoordeel', 'Deellastvoordeel stack', 'fractie'],
    ['faradayverlies_10', 'Faradayverlies bij 10 % last', 'fractie'],
    ['bop_vast', 'BoP-vast', 'fractie van module'],
    ['bop_variabel', 'BoP-variabel', 'fractie van stack'],
    ['degradatie_jaar', 'Stackdegradatie', 'fractie per jaar'],
    ['degradatie_jaren', 'Degradatieperiode', 'jaar'],
    ['min_aan_min', 'Minimale aan-tijd', 'min'],
    ['min_uit_min', 'Minimale uit-tijd', 'min'],
    ['startvertraging_min', 'Startvertraging', 'min'],
    ['standby', 'Warmhouden', 'fractie van module'],
    ['koud_na_uur', 'Koud na', 'uur'],
    ['opstart_warm_min', 'Opstarttijd warm', 'min'],
    ['opstart_koud_min', 'Opstarttijd koud', 'min']
  ];

  const stamp = iso => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('nl-NL', {dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Amsterdam'}).format(d);
  };
  const clock = iso => new Intl.DateTimeFormat('nl-NL', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'}).format(new Date(iso));

  function build(data) {
    const kit = root.OpsReportExcel?.kit;
    if (!kit) throw new Error('De Excel-module is niet geladen.');
    if (!data?.configuraties || !data.aannames) throw new Error('Geen volledig antwoord voor dit moment.');
    const {workbook, text, header, input, fx, symbolic, filled, zip} = kit;
    const book = workbook();
    const a = data.aannames, predict = data.standbybeleid === 'voorspelling', strategy = data.strategie;
    for (const [key, label] of ASSUMPTIONS) if (!finite(a[key])) throw new Error('Aanname ontbreekt: ' + label);

    // ---------------------------------------------------------------- Aannames
    const assumptionRows = [header(['Rekensleutel', 'Omschrijving', 'Waarde', 'Eenheid'])], at = {};
    for (const [key, label, unit] of ASSUMPTIONS) { at[key] = assumptionRows.length + 1; assumptionRows.push([key, label, input(a[key], key), unit]); }
    const A = key => "'Aannames'!$C$" + at[key];

    const views = [];
    const sheets = [];
    for (const n of Object.keys(data.configuraties).map(Number).sort((x, y) => x - y)) {
      const config = data.configuraties[n], s = config.stap;
      const rows = [header(['Rekenstap', 'Eenheid', 'Formule (symbolisch)', 'Uitkomst', 'Ingevulde formule', 'Jaarrun (simulatie)', 'Controle'])];
      const view = {modules: n, size: config.module_mw, sections: [], checks: [], config};
      let section = null;
      const open = (title, intro = '', collapsed = false) => {
        rows.push([]);
        rows.push(header([title, '', intro, '', '', '', '']));
        section = {title, intro, collapsed, lines: []};
        view.sections.push(section);
      };
      const note = textLine => { rows.push(['', '', textLine]); section.lines.push({note: textLine}); };
      // Eén regel: label, eenheid, cel (invoer of formule) en eventueel de waarde uit de simulatie met een controle.
      const line = (label, unit, cell, model) => {
        const r = rows.length + 1, hasModel = model !== undefined && model !== null;
        const modelCell = hasModel ? text(typeof model === 'boolean' ? (model ? 1 : 0) : model) : '';
        const check = hasModel ? fx('IF(ABS(D' + r + '-F' + r + ')<=' + TOL + '*MAX(1,ABS(F' + r + ')),"klopt","verschil")', null) : '';
        const formula = cell.kind === 'formula';
        rows.push([label, unit, formula ? symbolic(cell) : 'invoer uit de jaarrun', cell, formula ? filled(cell) : '', modelCell, check]);
        section.lines.push({label, unit, cell, formula, model: hasModel ? modelCell : null, check: hasModel ? check : null});
        if (hasModel) view.checks.push({label: section.title + ' · ' + label, check});
        return 'D' + r;
      };
      const flag = value => value ? 1 : 0;
      const list = n => Array.from({length: n}, (_, i) => i);
      const inSet = (set, i) => Array.isArray(set) && set.includes(i);
      const q = i => 'module ' + (i + 1);

      // ---------------------------------------------------------------- invoer
      open('Invoer: dit moment', 'Het aanbod en de toestand vóór deze tien minuten komen uit de doorlopende jaarsimulatie.');
      const P = line('Windaanbod voor de elektrolyser', 'MW', input(data.aanbod_mw, 'aanbod'));
      const N = line('Aantal modules', 'aantal', input(n, 'N'));
      const searchBefore = predict ? null : line('Tijd dat er al wind is voor meer modules dan er draaien (vóór dit moment)', 'uur', input(s.voor.zoeken_uur, 'zoeken_voor'));
      const st = list(n).map(i => {
        open('Toestand vóór dit moment · module ' + (i + 1), '1 = ja, 0 = nee.', true);
        const m = {};
        m.on = line('Draaide in de vorige tien minuten', '1/0', input(flag(s.voor.aan[i]), 'aan', q(i)));
        m.onH = line('Aan-tijd tot nu', 'uur', input(s.voor.aan_uur[i], 'aan_uur', q(i)));
        m.offH = line('Uit-tijd tot nu', 'uur', input(s.voor.uit_uur[i], 'uit_uur', q(i)));
        m.rest = line('Resterende opstartminuten', 'min', input(s.voor.opstart_rest_min[i], 'opstart_rest', q(i)));
        if (predict) m.heat = line('Warmtegraad (1 = op temperatuur, 0 = koud)', 'fractie', input(s.voor.warmte[i], 'warmte', q(i)));
        m.eq = line('Slijtage-uren tot nu', 'uur', input(s.voor.eq_uur[i], 'eq_uur', q(i)));
        m.down = line('In gepland onderhoud of stackwissel', '1/0', input(flag(s.onderhoud[i]), 'onderhoud', q(i)));
        m.running = line('Draait en is beschikbaar', '1/0', fx('IF(AND(' + m.on + '=1,' + m.down + '=0),1,0)', 'draaiend', q(i)), inSet(s.draaiend, i));
        m.must = line('Moet blijven draaien (minimale aan-tijd nog niet om)', '1/0', fx('IF(AND(' + m.running + '=1,' + m.onH + '<' + A('min_aan_min') + '/60),1,0)', 'verplicht', q(i)), inSet(s.verplicht, i));
        m.ready = line('Mag starten (staat stil, beschikbaar, minimale uit-tijd om)', '1/0', fx('IF(AND(' + m.on + '=0,' + m.down + '=0,' + m.offH + '>=' + A('min_uit_min') + '/60),1,0)', 'startklaar', q(i)), inSet(s.startklaar, i));
        if (predict) {
          m.rankIn = line('Volgorde volgens de besturing (0 = niet gekozen)', 'rang', input(s.gekozen.includes(i) ? s.gekozen.indexOf(i) + 1 : 0, 'rang', q(i)));
          m.warmIn = line('Warm gehouden volgens de voorspelling', '1/0', input(flag(s.toestand?.[i] === 'warm'), 'warm_gehouden', q(i)));
        }
        return m;
      });
      const sum = (key, fallback = '0') => st.length ? st.map(m => m[key]).join('+') : fallback;

      // ---------------------------------------------------------------- modulegrootte
      open('Modulegrootte', 'Alle modules zijn even groot.');
      const size = line('Vermogen per module', 'MW', fx(A('capaciteit_mw') + '/' + N, 'size'), config.module_mw);
      const minDraw = line('Minimaal stroomverbruik per module (minimumlast incl. BoP)', 'MW', fx(A('minimumlast') + '*' + size + '*(1+' + A('bop_variabel') + ')+' + A('bop_vast') + '*' + size, 'drempel'), config.drempel_mw);
      const fullDraw = line('Stroomverbruik per module op vollast', 'MW', fx(size + '*(1+' + A('bop_variabel') + ')+' + A('bop_vast') + '*' + size, 'vollast'), config.vollast_mw);
      const secFull = line('Stackverbruik op vollast, nieuwe stack', 'kWh/kg', fx(A('systeemverbruik_vol') + '*(1-' + A('faradayverlies_10') + '*0.1)/(1+' + A('bop_variabel') + '+' + A('bop_vast') + ')', 'sec_vol'));
      const ageing = line('Gemiddeld extra verbruik door degradatie', 'fractie', fx(A('degradatie_jaar') + '*' + A('degradatie_jaren') + '/2', 'degradatie'));
      // Waterstof per uur uit één module bij stackvermogen `stack` (stack_kg_h).
      const kgPerHour = (stack, load) => 'IF(OR(' + load + '<=0,' + load + '<' + A('minimumlast') + '-' + TOL + '),0,' + stack + '*1000/(' + secFull + '*(1-' + A('deellastvoordeel') + '*(1-' + load + '))*(1+' + ageing + '))*MAX(0,1-' + A('faradayverlies_10') + '*0.1/' + load + '))';

      // ---------------------------------------------------------------- besturing
      open('Besturing: hoeveel modules draaien', 'Besturing ‘' + (STRATEGY[strategy] || strategy) + '’' + (predict ? ', stand-by met voorspelling.' : ', stand-by vast.'));
      const avail = line('Beschikbare modules', 'aantal', fx(N + '-(' + sum('down') + ')', 'beschikbaar'), s.beschikbaar.length);
      const running = line('Draaiende modules', 'aantal', fx(sum('running'), 'draaiend'), s.draaiend.length);
      const must = line('Waarvan verplicht door minimale aan-tijd', 'aantal', fx(sum('must'), 'verplicht'), s.verplicht.length);
      const ready = line('Modules die mogen starten', 'aantal', fx(sum('ready'), 'startklaar'), s.startklaar.length);
      const fits = line('Zoveel modules passen boven hun minimum', 'aantal', fx('IF(' + minDraw + '>0,MIN(' + avail + ',INT(' + P + '/' + minDraw + ')),' + avail + ')', 'passen'), s.passen);
      let desired;
      if (strategy === 'verdelen') {
        open('Keuze ‘verdelen’: elk aantal draaiende modules', 'Het aantal met de meeste waterstof per uur wint; bij gelijkspel het kleinste. Het model kiest op het aanbod afgerond op 0,01 MW.', true);
        const rounded = line('Aanbod afgerond op 0,01 MW', 'MW', fx('ROUND(' + P + ',2)', 'aanbod_afgerond'));
        let best = '0', bestK = '0';
        for (let k = 1; k <= n; k++) {
          const ck = 'k = ' + k;
          const share = line('k = ' + k + ': stackvermogen per module', 'MW', fx('MIN(' + size + ',(' + rounded + '/' + k + '-' + A('bop_vast') + '*' + size + ')/(1+' + A('bop_variabel') + '))', 'aandeel', ck));
          const load = line('k = ' + k + ': last per module', 'fractie', fx(share + '/' + size, 'last', ck));
          const total = line('k = ' + k + ': waterstof alle k modules', 'kg/uur', fx('IF(' + k + '<=' + fits + ',' + k + '*' + kgPerHour(share, load) + ',0)', 'kg_uur', ck));
          const nextBest = line('k = ' + k + ': beste tot nu', 'kg/uur', fx('IF(' + total + '>' + best + '+' + TOL + ',' + total + ',' + best + ')', 'beste', ck));
          bestK = line('k = ' + k + ': beste aantal tot nu', 'aantal', fx('IF(' + total + '>' + best + '+' + TOL + ',' + k + ',' + bestK + ')', 'beste_k', ck));
          best = nextBest;
        }
        open('Besturing (vervolg)', 'Het gewenste aantal, begrensd door de minimale aan- en uit-tijd en de startvertraging.');
        desired = line('Gewenst aantal (meeste waterstof)', 'aantal', fx(bestK, 'gewenst'), s.gewenst);
      } else if (strategy === 'bijschakelen') {
        desired = line('Gewenst aantal (bijschakelen tot het aanbod past)', 'aantal', fx('IF(' + P + '>=' + minDraw + ',MIN(' + fits + ',-INT(-' + P + '/' + fullDraw + ')),0)', 'gewenst'), s.gewenst);
      } else {
        desired = line('Gewenst aantal (alles of niets)', 'aantal', fx('IF(AND(' + fits + '>=' + avail + ',' + avail + '>0),' + avail + ',0)', 'gewenst'), s.gewenst);
      }
      let startable;
      if (predict) {
        startable = line('Starts die de voorspelling toestaat', 'aantal', input(s.starters_toegestaan, 'startbaar'));
        note('Met voorspelling start een extra module alleen als de voorspelling lang genoeg wind geeft voor de minimale aan-tijd plus de opstarttijd; dat besluit is invoer.');
      } else {
        const search = line('Tijd dat er al wind is voor meer modules (na dit moment)', 'uur', fx('IF(' + desired + '>' + running + ',' + searchBefore + '+' + STEP + ',0)', 'zoeken_na'), s.zoeken_uur_na);
        const wait = line('Wachten op de startvertraging', '1/0', fx('IF(AND(' + ready + '>0,' + search + '<' + A('startvertraging_min') + '/60-' + TOL + '),1,0)', 'wachten'), flag(s.wachten));
        startable = line('Modules die nu starten mogen', 'aantal', fx('IF(' + wait + '=1,0,' + ready + ')', 'startbaar'), s.starters_toegestaan);
      }
      const k = line('Aantal draaiende modules k', 'aantal', fx('MIN(MAX(MIN(' + desired + ',' + running + '+' + startable + '),MIN(' + must + ',' + fits + ')),' + fits + ',' + running + '+' + startable + ')', 'k'), s.k);
      view.kCell = section.lines.at(-1).cell;
      let seqRest = null, seqAdjust = null;
      if (strategy === 'bijschakelen') {
        const total = line('Op te nemen stroom', 'MW', fx('MIN(' + P + ',' + k + '*' + fullDraw + ')', 'totaal'));
        seqRest = line('Stroom voor de laatste module', 'MW', fx(total + '-(' + k + '-1)*' + fullDraw, 'rest'));
        seqAdjust = line('Laatste module onder minimum: voorlaatste levert in', '1/0', fx('IF(AND(' + k + '>1,' + seqRest + '<' + minDraw + '),1,0)', 'herverdelen'));
      }

      // ---------------------------------------------------------------- per module
      const totals = {kg: [], used: [], standby: []};
      st.forEach((m, i) => {
        open('Module ' + (i + 1) + ': van last tot waterstof', '', i > 0);
        let rank, chosen;
        if (predict) {
          rank = m.rankIn;
          chosen = line('Draait in dit moment', '1/0', fx('IF(AND(' + rank + '>0,' + rank + '<=' + k + '),1,0)', 'gekozen', q(i)), flag(s.gekozen.includes(i)));
        } else {
          // Volgorde: draaiende modules eerst (verplichte vooraan), dan startklare; binnen een groep de minst versleten, bij gelijke slijtage de laagste nummer.
          const prio = line('Volgorde-sleutel (lager = eerder)', '-', fx('IF(' + m.running + '=1,(1-' + m.must + ')*100000+' + m.eq + ',IF(' + m.ready + '=1,200000+' + m.eq + ',900000))+' + (i + 1) + '*0.000001', 'sleutel', q(i)));
          m.prio = prio;
          // De formule telt de modules met een lagere sleutel; hij wordt ingevuld zodra alle sleutels bestaan (onder de modules).
          m.rankLine = rows.length;
          rank = line('Plaats in de volgorde', 'rang', fx('1', 'rang', q(i)), s.gekozen.includes(i) ? s.gekozen.indexOf(i) + 1 : null);
          chosen = line('Draait in dit moment', '1/0', fx('IF(AND(' + rank + '<=' + k + ',' + prio + '<900000),1,0)', 'gekozen', q(i)), flag(s.gekozen.includes(i)));
        }
        let stack;
        if (strategy === 'bijschakelen') {
          const draw = line('Stroom naar deze module', 'MW', fx('IF(' + rank + '<' + k + ',IF(AND(' + seqAdjust + '=1,' + rank + '=' + k + '-1),' + fullDraw + '-(' + minDraw + '-' + seqRest + '),' + fullDraw + '),IF(' + seqAdjust + '=1,' + minDraw + ',' + seqRest + '))', 'stroom', q(i)));
          stack = line('Stackvermogen', 'MW', fx('IF(' + chosen + '=1,MAX(0,MIN(' + size + ',(' + draw + '-' + A('bop_vast') + '*' + size + ')/(1+' + A('bop_variabel') + '))),0)', 'stack', q(i)), s.stack[i]);
        } else {
          stack = line('Stackvermogen (aanbod gelijk verdeeld over k)', 'MW', fx('IF(' + chosen + '=1,MIN(' + size + ',(' + P + '/' + k + '-' + A('bop_vast') + '*' + size + ')/(1+' + A('bop_variabel') + ')),0)', 'stack', q(i)), s.stack[i]);
        }
        const producing = line('Produceert (boven minimumlast)', '1/0', fx('IF(AND(' + stack + '>0,' + stack + '>=' + A('minimumlast') + '*' + size + '-' + TOL + '),1,0)', 'produceert', q(i)));
        const starting = line('Start in dit moment', '1/0', fx('IF(AND(' + producing + '=1,' + m.on + '=0),1,0)', 'start', q(i)));
        const cold = predict
          ? line('Koude start (warmtegraad onder 0,5)', '1/0', fx('IF(' + m.heat + '>=0.5,0,1)', 'koud', q(i)))
          : line('Koude start (langer uit dan ‘koud na’)', '1/0', fx('IF(' + m.offH + '>=' + A('koud_na_uur') + ',1,0)', 'koud', q(i)));
        const newStart = predict
          ? line('Opstarttijd bij een start nu', 'min', fx(A('opstart_warm_min') + '+(' + A('opstart_koud_min') + '-' + A('opstart_warm_min') + ')*(1-' + m.heat + ')', 'opstart_nieuw', q(i)))
          : line('Opstarttijd bij een start nu', 'min', fx('IF(' + cold + '=1,' + A('opstart_koud_min') + ',' + A('opstart_warm_min') + ')', 'opstart_nieuw', q(i)));
        const rest = line('Resterende opstartminuten in dit moment', 'min', fx('IF(' + starting + '=1,' + newStart + ',' + m.rest + ')', 'opstart_rest_nu', q(i)));
        line('Opstartminuten binnen deze tien minuten', 'min', fx('IF(' + producing + '=1,MIN(10,' + rest + '),0)', 'opstartminuten', q(i)), s.opstart_min[i]);
        const productive = line('Productief deel van de tien minuten (opstartverlies eraf)', 'fractie', fx('IF(' + producing + '=1,MAX(0,10-' + rest + ')/10,0)', 'productief', q(i)));
        const load = line('Last', 'fractie', fx(stack + '/' + size, 'last', q(i)));
        const kgh = line('Waterstof per uur bij deze last (zonder opstartverlies)', 'kg/uur', fx(kgPerHour(stack, load), 'kg_uur', q(i)));
        totals.kg.push(line('Waterstof in deze tien minuten', 'kg', fx('IF(' + producing + '=1,' + kgh + '*' + STEP + '*' + productive + ',0)', 'kg', q(i)), s.kg_module[i]));
        totals.used.push(line('Stroom van de draaiende module', 'MWh', fx('IF(' + producing + '=1,(' + stack + '*(1+' + A('bop_variabel') + ')+' + A('bop_vast') + '*' + size + ')*' + STEP + ',0)', 'stroom_mwh', q(i))));
        totals.standby.push(predict
          ? line('Warmhouden (stilstaand)', 'MWh', fx('IF(' + m.warmIn + '=1,' + A('standby') + '*' + size + '*' + STEP + ',0)', 'warmhouden_mwh', q(i)))
          : line('Warmhouden (stilstaand en nog niet ‘koud na’)', 'MWh', fx('IF(AND(' + producing + '=0,' + m.down + '=0,IF(' + m.on + '=1,0,' + m.offH + ')<' + A('koud_na_uur') + '),' + A('standby') + '*' + size + '*' + STEP + ',0)', 'warmhouden_mwh', q(i))));
        line('Resterende opstartminuten voor het volgende moment', 'min', fx('IF(' + producing + '=1,MAX(0,' + rest + '-10),' + m.rest + ')', 'opstart_rest_na', q(i)), s.na.opstart_rest_min[i]);
      });
      // De plaats in de volgorde telt hoeveel modules een lagere sleutel hebben; pas nu bestaan alle sleutels.
      if (!predict) for (const m of st) {
        const cell = rows[m.rankLine][3];
        cell.expression = '1+' + (st.length > 1 ? st.filter(other => other !== m).map(other => '(' + other.prio + '<' + m.prio + ')').join('+') : '0');
      }

      // ---------------------------------------------------------------- totaal
      open('Totaal van dit moment', 'Zo telt de jaarrun deze tien minuten mee; de jaaruitkomst is de som van alle momenten, omgerekend naar 8.760 uur en met de storingsafslag.');
      line('Waterstof in deze tien minuten', 'kg', fx(totals.kg.join('+'), 'kg_totaal'), s.kg_stap);
      view.kgCell = section.lines.at(-1).cell;
      line('Stroom van de draaiende modules', 'MWh', fx(totals.used.join('+'), 'stroom_totaal'), s.verbruik_mwh);
      line('Stroom voor warmhouden', 'MWh', fx(totals.standby.join('+'), 'warmhouden_totaal'), s.standby_mwh);
      line('Aangeboden energie', 'MWh', fx(P + '*' + STEP, 'aanbod_mwh'));
      sheets.push({name: plural(n), rows});
      views.push(view);
    }

    // ---------------------------------------------------------------- leeswijzer
    const strategyText = {verdelen: 'Verdelen: per tijdstap het aantal modules dat de meeste waterstof geeft, last gelijk verdeeld.',
      bijschakelen: 'Bijschakelen: modules één voor één bij; hooguit één module in deellast.', samen: 'Samen: alle modules tegelijk aan of uit.'}[strategy] || strategy;
    const info = [header(['Eén moment narekenen', '']),
      ['Moment', stamp(data.begin) + ' tot ' + clock(data.eind) + ' (Nederlandse tijd)'],
      ['Wat dit is', 'Eén tijdstap van tien minuten uit dezelfde jaarsimulatie als de uitkomst op de website (windjaar ' + data.jaar + ', stap ' + (data.index + 1) + ' van ' + data.stappen_in_jaar + '). Geen aparte dagsimulatie.'],
      ['Gebruik', 'Geel is invoer: de aannames en de toestand vóór dit moment uit de jaarrun. Groen zijn Excel-formules. Kolom F is de waarde uit de simulatie, kolom G controleert of de formule die precies haalt (verschil hooguit 10⁻⁹ relatief).'],
      ['Waarom dit genoeg is', 'De jaarrun herhaalt dezelfde berekening voor elk moment; alleen de toestand (aan of uit, opstarttijd, aan- en uit-tijd) gaat door naar het volgende moment. Op elk blad staat ook de resterende opstarttijd voor het volgende moment.'],
      ['Besturing', strategyText],
      ['Stand-by', predict ? 'Met voorspelling: starten en warmhouden volgen een windvoorspelling. Die besluiten (toegestane starts, volgorde, warm gehouden) zijn invoer; de rest is formule.' : 'Vast: een gestopte module blijft ‘koud na’ uur warm; een start na langere stilstand is een koude start.'],
      ['Aansluitend', data.aansluitend ? 'Het vorige moment in de reeks ligt tien minuten eerder.' : 'Vóór dit moment ontbreken windgegevens (meetgat); de simulatie gaat dan verder vanaf de vorige meting.'],
      ['Niet in dit blad', 'De windketen tot het aanbod (zie ‘Een dag van dichtbij’) en de storingsafslag, die de simulatie alleen op jaartotalen toepast.'],
      ['Modelversie', String(data.model_versie ?? '')],
      ['Windprofiel', String(data.windprofiel || data.windmethode || '')]];
    book.add('Leeswijzer', info, [26, 120]);
    book.add('Aannames', assumptionRows, [24, 50, 18, 20]);
    for (const sheet of sheets) book.add(sheet.name, sheet.rows, [52, 10, 70, 18, 70, 18, 10]);

    // Uitkomsten voor de pagina.
    const read = cell => book.read(cell);
    for (const view of views) {
      view.ok = view.checks.filter(c => read(c.check) === 'klopt').length;
      view.total = view.checks.length;
      view.failed = view.checks.filter(c => read(c.check) !== 'klopt').map(c => c.label);
    }
    return {data, views, read, xlsx: () => zip(book.files())};
  }

  // ---------------------------------------------------------------- pagina
  function number(value) {
    if (value && typeof value === 'object' && value.error) return value.error;
    if (typeof value === 'boolean') return value ? 'WAAR' : 'ONWAAR';
    if (!finite(value)) return esc(value ?? '');
    return root.OpsReportExcel.formula.nlNumber(value);
  }

  function html(result) {
    const {data, views, read} = result;
    const head = `<p class="moment-check-when"><strong>${esc(stamp(data.begin))}–${esc(clock(data.eind))}</strong> · windjaar ${data.jaar}, stap ${data.index + 1} van ${data.stappen_in_jaar} · aanbod <strong>${number(data.aanbod_mw)} MW</strong></p>`
      + (data.aansluitend ? '' : '<p class="note">Vóór dit moment ontbreken windgegevens; de simulatie gaat verder vanaf de vorige meting.</p>');
    const summary = `<div class="moment-check-summary">${views.map(v => {
      const kg = read(v.kgCell), k = read(v.kCell), startup = v.config.stap.opstart_min.some(x => x > 0);
      return `<section class="${v.failed.length ? 'moment-check-fail' : 'moment-check-pass'}"><h4>${plural(v.modules)} van ${number(v.size)} MW</h4>
        <strong>${number(kg)} <small>kg waterstof</small></strong>
        <p>${number(k)} van ${v.modules} draaien${startup ? ' · opstartverlies in dit moment' : ''}</p>
        <p class="moment-check-verdict">${v.failed.length ? '! ' + (v.total - v.ok) + ' van ' + v.total + ' controles wijken af' : '✓ ' + v.ok + ' van ' + v.total + ' controles kloppen met de jaarrun'}</p></section>`;
    }).join('')}</div>`;
    const table = lines => `<div class="report-scroll" tabindex="0" role="region" aria-label="Rekenstappen"><table class="moment-check-table"><thead><tr><th scope="col">Rekenstap</th><th scope="col">Formule en ingevulde waarden</th><th scope="col">Uitkomst</th><th scope="col">Jaarrun</th></tr></thead><tbody>${lines.map(line => {
      if (line.note) return `<tr><td colspan="4" class="note">${esc(line.note)}</td></tr>`;
      // Ja/nee-velden (1/0) als ja of nee; aantallen en rangen zonder eenheid.
      const flagUnit = line.unit === '1/0', unit = line.unit && !['-', 'rang', 'aantal', '1/0'].includes(line.unit) ? ' ' + esc(line.unit) : '';
      const show = v => flagUnit && (v === 0 || v === 1) ? (v ? 'ja' : 'nee') : number(v);
      const value = read(line.cell);
      const how = line.formula ? `<small>${esc(read({kind: 'text', of: line.cell, mode: 'symbolic'}))}</small><span class="report-expression">= ${esc(read({kind: 'text', of: line.cell, mode: 'filled'}))}</span>` : '<small>invoer uit de jaarrun</small>';
      const ok = line.check ? read(line.check) === 'klopt' : null;
      const model = line.model ? `${show(read(line.model))}${unit} <span class="${ok ? 'moment-check-ok' : 'moment-check-bad'}">${ok ? '✓' : '! wijkt af'}</span>` : '';
      return `<tr class="${line.formula ? '' : 'moment-check-input'}"><th scope="row">${esc(line.label)}</th><td>${how}</td><td class="report-number">${show(value)}${unit}</td><td class="report-number">${model}</td></tr>`;
    }).join('')}</tbody></table></div>`;
    const detail = views.map((v, index) => `<details class="moment-check-config"${index ? '' : ' open'}><summary>${plural(v.modules)}: alle rekenstappen (${v.ok} van ${v.total} kloppen)</summary>${v.failed.length ? `<p class="report-control-warning">Wijkt af: ${v.failed.map(esc).join('; ')}</p>` : ''}${
      v.sections.map(sec => `<details class="moment-check-section"${sec.collapsed ? '' : ' open'}><summary>${esc(sec.title)}</summary>${sec.intro ? `<p class="note">${esc(sec.intro)}</p>` : ''}${table(sec.lines)}</details>`).join('')}</details>`).join('');
    return head + summary + detail;
  }

  // ---------------------------------------------------------------- bediening
  const $ = id => document.getElementById(id);
  const state = {request: null, result: null, years: [], counts: [], token: 0};
  const pad = n => String(n).padStart(2, '0');

  function setResult(result, request) {
    state.request = request; state.result = null; state.token++;
    state.years = [...(result.jaren || [])]; state.counts = (result.rijen || []).map(r => r.modules);
    const panel = $('moment-panel'); if (!panel) return;
    panel.hidden = false;
    const day = $('mc-day');
    day.min = Math.min(...state.years) + '-01-01'; day.max = Math.max(...state.years) + '-12-31';
    if (!day.value || day.value < day.min || day.value > day.max) day.value = result.voorbeelddag || day.min;
    const preferred = state.counts.filter(n => n <= 4);
    const chosen = new Set(preferred.length ? preferred : state.counts.slice(0, 4));
    $('mc-counts').replaceChildren(...state.counts.map(n => {
      const label = document.createElement('label'), box = Object.assign(document.createElement('input'), {type: 'checkbox', value: String(n), checked: chosen.has(n)});
      label.append(box, ' ' + n);
      return label;
    }));
    $('mc-result').replaceChildren(); $('mc-status').textContent = ''; $('mc-excel').disabled = true;
  }

  async function run() {
    if (!state.request) return;
    const counts = [...$('mc-counts').querySelectorAll('input:checked')].map(box => Number(box.value));
    const date = $('mc-day').value, time = $('mc-time').value;
    if (!counts.length) { $('mc-status').textContent = 'Kies minstens één aantal modules.'; return; }
    if (!date || !state.years.includes(Number(date.slice(0, 4)))) { $('mc-status').textContent = 'Kies een dag uit de gebruikte windjaren (' + state.years.join(', ') + ').'; return; }
    const token = ++state.token;
    $('mc-run').disabled = true; $('mc-excel').disabled = true; $('mc-result').replaceChildren();
    $('mc-status').textContent = 'Dit moment wordt uit de jaarsimulatie gehaald…';
    try {
      const r = state.request;
      const response = await fetch('/api/opsplitsing/moment', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
        aannames: r.aannames, strategie: r.strategie, standby: r.standby, windprofiel: r.windprofiel, parken: r.parken, jaren: r.jaren,
        modules: counts, datum: date, tijd: time})});
      const data = await response.json().catch(() => ({error: 'Onverwacht antwoord.'}));
      if (token !== state.token) return;
      if (!response.ok || data.error) throw new Error(data.error || 'Dit moment kon niet worden berekend.');
      state.result = build(data);
      $('mc-result').innerHTML = html(state.result);
      $('mc-excel').disabled = false;
      $('mc-status').textContent = '';
    } catch (error) {
      if (error?.name === 'AbortError' || token !== state.token) return;
      $('mc-status').textContent = error.message;
    } finally {
      if (token === state.token) $('mc-run').disabled = false;
    }
  }

  function download() {
    if (!state.result) return;
    const d = state.result.data, name = 'moment-' + d.datum + '-' + d.tijd.replace(':', '') + '-' + Object.keys(d.configuraties).join('-') + '-modules.xlsx';
    const url = URL.createObjectURL(new Blob([state.result.xlsx()], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link = Object.assign(document.createElement('a'), {href: url, download: name});
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Vanuit ‘Een dag van dichtbij’: dit moment met deze aantallen narekenen.
  function show(date, time, counts) {
    if (!state.request) return;
    $('mc-day').value = date; $('mc-time').value = time;
    for (const box of $('mc-counts').querySelectorAll('input')) box.checked = counts.includes(Number(box.value));
    $('moment-panel').scrollIntoView({block: 'start'});
    run();
  }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
    const time = $('mc-time'); if (!time) return;
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 10) time.append(new Option(pad(h) + ':' + pad(m), pad(h) + ':' + pad(m), false, h === 12 && m === 0));
    $('mc-run').addEventListener('click', run);
    $('mc-excel').addEventListener('click', download);
  });

  const api = {build, html, setResult, show};
  root.OpsMomentCheck = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis === 'undefined' ? this : globalThis);

/* A frozen explanation of an existing result. This does not run or change the simulation. */
(function (root) {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const number = value => finite(value) ? value : null;
  const calc = (fn, ...values) => values.every(finite) ? number(fn(...values)) : null;
  // Getoonde uitkomsten krijgen drie significante cijfers, €/kg hooguit twee decimalen; invoer staat zoals ingevoerd.
  // De ongeronde waarden blijven in base/comparison staan; Excel en JSON houden de volle precisie.
  const nl = options => value => finite(value) ? new Intl.NumberFormat('nl-NL', options).format(value) : 'niet beschikbaar';
  // Drie significante cijfers, ook met een nul aan het eind (24,0 naast 22,4); nul blijft 0.
  const sig = (value, digits = 3) => nl(value ? {minimumSignificantDigits: digits, maximumSignificantDigits: digits} : {})(value);
  const num = nl({maximumFractionDigits: 6});
  const priceDigits = value => Math.abs(value) >= 99.95 ? 0 : Math.abs(value) >= 9.995 ? 1 : 2;
  const price = value => finite(value) ? nl({minimumFractionDigits: priceDigits(value), maximumFractionDigits: priceDigits(value)})(value) : 'niet beschikbaar';
  // Een verschil krijgt de resolutie van de grofste van de twee getoonde waarden: 3.130 t − 2.870 t = 260 t, geen 255,4 t.
  const resolution = (value, kind) => kind === 'price' ? 10 ** -priceDigits(value) : 10 ** (Math.floor(Math.log10(Math.abs(value) || 1)) - 2);
  function diff(after, before, kind = 'sig', signed = true) {
    if (!finite(after) || !finite(before)) return 'niet beschikbaar';
    const step = Math.max(resolution(after, kind), resolution(before, kind)), digits = Math.max(0, Math.round(-Math.log10(step)));
    const value = after - before, rounded = Math.round(value / step) * step;
    const text = nl({minimumFractionDigits: digits, maximumFractionDigits: digits});
    const sign = !signed ? '' : value > 0 ? '+' : value < 0 ? '−' : '';
    return value !== 0 && rounded === 0 ? `${sign}<${text(step)}` : (rounded ? sign : '') + text(Math.abs(rounded));
  }
  const eur = value => !finite(value) ? 'niet beschikbaar' : Math.abs(value) >= 1e6 ? `${sig(value / 1e6)} mln €` : `${sig(value)} €`;
  const ton = value => finite(value) ? `${sig(value / 1000)} ton` : 'niet beschikbaar';
  const expr = (values, join, format = sig) => values.map(value => format(value)).join(join);
  // Eén unit van het totale vermogen die als geheel aan- en uitschakelt, bouwt niemand: 1 module is een rekenreferentie.
  const moduleLabel = n => n === 1 ? '1 module (theoretische referentie)' : `${n} modules`;
  const counts = list => list.length > 2 && list.every((n, i) => !i || n === list[i - 1] + 1) ? `${list[0]}–${list[list.length - 1]}` : list.join(', ');
  const startsPerYear = row => finite(row.starts_warm_per_module) && finite(row.starts_koud_per_module) ? (row.starts_warm_per_module + row.starts_koud_per_module) * row.modules : null;
  const near = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b));
  const sum = values => Array.isArray(values) && values.length && values.every(finite) ? number(values.reduce((a, b) => a + b, 0)) : null;

  function costs(row, a) {
    const n = number(row.modules);
    const perKw = calc((offer, count, fixed, power) => (offer - count * fixed) * 1e6 / (power * 1000), a.offerte_meur, a.offerte_modules, a.vaste_kosten_module_meur, a.offerte_mw);
    const capex = calc((price, power, count, fixed) => price * power * 1000 + count * fixed * 1e6, perKw, a.capaciteit_mw, n, a.vaste_kosten_module_meur);
    const subsidy = calc((grant, power) => grant * power * 1000, a.capex_subsidie_eur_kw, a.capaciteit_mw);
    const annuity = calc((rate, years) => rate ? rate / (1 - (1 + rate) ** -years) : 1 / years, a.rente, a.looptijd_jaar);
    const financing = calc((capital, grant, factor) => (capital - grant) * factor, capex, subsidy, annuity);
    const opex = calc((share, capital) => share * capital, a.opex_aandeel, capex);
    const capitalAnnual = calc((capital, fixed) => capital + fixed, financing, opex);
    const wearHours = Array.isArray(row.eq_uren_per_module) && row.eq_uren_per_module.length === n ? sum(row.eq_uren_per_module) : null;
    const stack = calc((share, capital, count, hours, life) => share * capital / count * hours / life, a.stack_aandeel, capex, n, wearHours, a.stack_levensduur_uur);
    const levies = calc((grid, tax, discount) => Math.max(0, grid + tax - discount), a.netkosten_eur_mwh, a.belasting_eur_mwh, a.korting_net_belasting_eur_mwh);
    const powerPrice = calc((price, charges) => price + charges, a.stroomprijs_eur_mwh, levies);
    const energy = calc((used, standby) => used + standby, row.verbruik_mwh, row.standby_mwh);
    const power = calc((mwh, price) => mwh * price, energy, powerPrice);
    const annual = calc((capital, replacement, electricity) => capital + replacement + electricity, capitalAnnual, stack, power);
    const kg = calc(tonnes => tonnes * 1000, row.waterstof_t);
    const lcoh = kg > 0 ? calc((euro, hydrogen) => euro / hydrogen, annual, kg) : null;
    const revenue = calc((premium, oxygen) => premium + oxygen * 8 / 1000, a.waterstofpremie_eur_kg, a.zuurstofprijs_eur_t);
    const net = calc((gross, credit) => gross - credit, lcoh, revenue);
    const kwhPerKg = kg > 0 ? calc((mwh, hydrogen) => mwh * 1000 / hydrogen, energy, kg) : null;
    return {perKw, capex, subsidy, annuity, financing, opex, capitalAnnual, wearHours, stack, levies, powerPrice, energy, power, annual, kg, lcoh, revenue, net, kwhPerKg};
  }

  const START_NOTE = 'Start/stop-slijtage zit niet in de kosten: sinds de feedback van 28 oktober tellen starts en lastwisselingen niet als extra bedrijfsuren. Meer modules starten in totaal vaker, dus meer modules lijken daardoor iets gunstiger dan ze zijn.';
  const INVESTMENT_NOTE = 'De investering is de referentieofferte (eigen aanname), omgerekend naar het gekozen vermogen, plus de vaste kosten per module. Installatie, civiele werken, netaansluiting en andere bijkomende kosten tellen alleen mee als ze in de ingevoerde offerte zitten.';
  const REFERENCE_NOTE = '1 module is een theoretische referentie: niemand bouwt één unit van het totale vermogen die als geheel aan- en uitschakelt. Een besparing tegenover 1 module is een besparing tegenover die referentie.';

  // ---------------------------------------------------------------- conclusie binnen de modelonzekerheid
  // Regel: een aantal modules is pas duidelijk goedkoper dan een ander als het dat blijft in elk toetsgeval. De toetsgevallen
  // zijn de kostenaannames van de gevoeligheidsanalyse, elk apart 25 % lager en hoger (binnen de invoergrenzen), en de vaste
  // kosten per module aan beide randen van hun bandbreedte, 0,3 en 2 M€ (feedback van 28 oktober). De kostprijs is lineair in de
  // vaste kosten, dus de randen volstaan. Heeft de gebruiker de vaste kosten zelf ingevuld, dan geldt daarvoor ook ±25 %.
  // Alle toetsgevallen hergebruiken de gesimuleerde productie en het stroomverbruik; bedrijfsvoering (minimumlast, opstarttijd)
  // vraagt een nieuwe simulatie en toets je met de omslagkaart en de gevoeligheidsanalyse.
  const COST_KEYS = ['offerte_meur', 'vaste_kosten_module_meur', 'stroomprijs_eur_mwh', 'netkosten_eur_mwh', 'rente', 'looptijd_jaar', 'stack_aandeel', 'opex_aandeel'];
  const FIXED_COST_BAND = [0.3, 2];
  const STEP = 0.25;
  const COST_NAMES = {offerte_meur: 'de investering',vaste_kosten_module_meur: 'de vaste kosten per module', stroomprijs_eur_mwh: 'de stroomprijs',
    netkosten_eur_mwh: 'de netkosten', rente: 'de rente', looptijd_jaar: 'de looptijd', stack_aandeel: 'de stackvervanging', opex_aandeel: 'de vaste OPEX'};

  function materiality(input, metadata = {}) {
    const a = input?.aannames, rows = (input?.rijen || []).filter(row => finite(row.lcoh_eur_kg));
    if (!a || rows.length < 2) return null;
    const fields = (metadata.groepen || []).flatMap(group => group.velden || []);
    const field = key => fields.find(item => item.key === key) || {};
    const standard = metadata.technologieen?.[input.technologie]?.waarden?.vaste_kosten_module_meur;
    const fixed = a.vaste_kosten_module_meur;
    const ownFixedCost = finite(standard) && finite(fixed) && !near(fixed * (field('vaste_kosten_module_meur').schaal || 1), standard);
    const band = finite(fixed) && !ownFixedCost ? [Math.min(FIXED_COST_BAND[0], fixed), Math.max(FIXED_COST_BAND[1], fixed)] : null;
    const cases = [];
    const add = (key, value, kind) => {
      const variant = {...a, [key]: value};
      // Zoals variants() in opsplitsing.py: een combinatie zonder positieve prijs per kW valt weg.
      if (finite(value) && finite(costs(rows[0], variant).perKw) && costs(rows[0], variant).perKw > 0) cases.push({key, value, kind, a: variant});
    };
    for (const key of COST_KEYS) {
      if (!finite(a[key]) || !a[key]) continue;
      const {schaal = 1, min, max} = field(key);
      for (const [kind, factor] of [['laag', 1 - STEP], ['hoog', 1 + STEP]]) {
        let shown = a[key] * schaal * factor;
        if (finite(min)) shown = Math.max(min, shown);
        if (finite(max)) shown = Math.min(max, shown);
        add(key, shown / schaal, kind);
      }
    }
    if (band) for (const value of band) add('vaste_kosten_module_meur', value, 'band');
    const lowest = rows.reduce((best, row) => row.lcoh_eur_kg < best.lcoh_eur_kg ? row : best);
    const tested = cases.map(item => ({...item, lcoh: rows.map(row => costs(row, item.a).lcoh)})).filter(item => item.lcoh.every(finite));
    const at = (item, row) => item.lcoh[rows.indexOf(row)];
    const cheapest = item => rows[item.lcoh.indexOf(Math.min(...item.lcoh))];
    // Gelijkwaardig met het goedkoopste aantal: in minstens één toetsgeval niet duurder dan dat aantal.
    const equivalent = rows.filter(row => row === lowest || near(row.lcoh_eur_kg, lowest.lcoh_eur_kg)
      || tested.some(item => at(item, row) <= at(item, lowest) + 1e-12));
    const others = rows.filter(row => row !== lowest);
    const runnerUp = others.reduce((best, row) => row.lcoh_eur_kg < best.lcoh_eur_kg ? row : best);
    const worstMargin = tested.length ? Math.min(...tested.map(item => Math.min(...others.map(row => at(item, row))) - at(item, lowest))) : null;
    const group = equivalent.map(row => row.lcoh_eur_kg);
    const shifts = COST_KEYS.map(key => {
      const ends = tested.filter(item => item.key === key && item.kind !== 'band');
      return {key, name: COST_NAMES[key], shift: ends.length ? Math.max(...ends.map(item => Math.abs(at(item, lowest) - lowest.lcoh_eur_kg))) : null};
    }).filter(item => finite(item.shift)).sort((x, y) => y.shift - x.shift);
    const own = costs(lowest, a);
    const edges = band ? band.map(value => {
      const item = tested.find(entry => entry.kind === 'band' && entry.value === value);
      return item ? {value, cheapest: cheapest(item).modules} : null;
    }).filter(Boolean) : [];
    const flips = tested.filter(item => item.kind !== 'band' && cheapest(item) !== lowest).map(item => ({key: item.key, kind: item.kind, name: COST_NAMES[item.key], cheapest: cheapest(item).modules}));
    return {tested: tested.length > 0, cases: tested.length, band, ownFixedCost, step: STEP,
      lowest: lowest.modules, lowestLcoh: lowest.lcoh_eur_kg, runnerUp: runnerUp.modules, margin: runnerUp.lcoh_eur_kg - lowest.lcoh_eur_kg, worstMargin,
      clear: tested.length > 0 && equivalent.length === 1,
      equivalent: equivalent.map(row => row.modules), dearer: rows.filter(row => !equivalent.includes(row)).map(row => row.modules),
      range: [Math.min(...group), Math.max(...group)], spread: Math.max(...group) - Math.min(...group),
      drivers: shifts.slice(0, 2), edges, flips,
      electricityShare: finite(own.power) && own.annual > 0 ? own.power / own.annual : null,
      starts: rows.map(row => ({modules: row.modules, perModule: finite(row.starts_warm_per_module) && finite(row.starts_koud_per_module) ? row.starts_warm_per_module + row.starts_koud_per_module : null, total: startsPerYear(row)})),
      reference: rows.some(row => row.modules === 1)};
  }

  // De conclusie in gewone taal, voor de pagina en het rekenrapport. Elke regel is één zin of alinea.
  function describe(m) {
    if (!m) return null;
    const group = counts(m.equivalent), label = moduleLabel;
    // Binnen de groep doet de derde cijfer er niet toe: twee significante cijfers (7,9–8,0 €/kg).
    const rough = value => nl({minimumSignificantDigits: 2, maximumSignificantDigits: 2})(value);
    const level = rough(m.range[0]) === rough(m.range[1]) ? rough(m.range[0]) : `${rough(m.range[0])}–${rough(m.range[1])}`;
    const lines = [];
    let title;
    if (!m.tested) {
      title = `${label(m.lowest)}: laagste berekende kostprijs`;
      lines.push(`${price(m.lowestLcoh)} €/kg. Deze uitkomst mist jaargegevens om de kostprijs bij andere kostenaannames na te rekenen; daarom is niet getoetst of het verschil met andere aantallen groter is dan de onzekerheid.`);
    } else if (m.clear) {
      title = `${label(m.lowest)}: duidelijk het goedkoopst`;
      lines.push(`${price(m.lowestLcoh)} €/kg, ${diff(m.lowestLcoh + m.margin, m.lowestLcoh, 'price', false)} €/kg goedkoper dan ${label(m.runnerUp)}. In elk toetsgeval blijft het minstens ${diff(m.lowestLcoh + m.worstMargin, m.lowestLcoh, 'price', false)} €/kg goedkoper dan elk ander aantal.`);
    } else {
      title = `${group} modules: gelijkwaardig binnen de modelonzekerheid`;
      lines.push(`Kostprijs ${level} €/kg, onderling verschil ≤ ${diff(m.range[1], m.range[0], 'price', false)} €/kg.`);
      const [low, high] = m.edges;
      if (low && high && (low.cheapest !== high.cheapest || low.cheapest !== m.lowest)) lines.push(`Welk aantal het goedkoopst is, hangt af van de onzekere vaste kosten per module: bij ${num(low.value)} M€ is dat ${label(low.cheapest)}, bij ${num(high.value)} M€ ${label(high.cheapest)}.`);
      else if (m.flips.length) lines.push(`Welk aantal het goedkoopst is, hangt af van de kostenaannames: met ${m.flips[0].name} 25 % ${m.flips[0].kind === 'laag' ? 'lager' : 'hoger'} is dat ${label(m.flips[0].cheapest)}.`);
      if (m.equivalent.includes(1)) lines.push('De groep bevat de theoretische referentie van 1 module.');
      if (m.dearer.length) lines.push(`In elk toetsgeval duurder: ${dearerText(m.dearer)}.`);
    }
    const [first, second] = m.drivers;
    if (first) {
      const share = finite(m.electricityShare) ? ` Stroom is ${sig(m.electricityShare * 100, 2)} % van de jaarkosten.` : '';
      const named = second ? `${first.name} en ${second.name}` : first.name;
      const moves = second ? `±${price(first.shift)} en ±${price(second.shift)} €/kg` : `±${price(first.shift)} €/kg`;
      const choice = m.clear ? m.margin : m.spread;
      lines.push(`${first.shift > choice ? `Zwaarder dan het aantal modules wegen ${named}` : `De kostprijs hangt het sterkst af van ${named}`}: 25 % lager of hoger verschuift de kostprijs ${moves}.${share}`);
    }
    if (m.tested) lines.push(`Regel: een aantal heet pas duidelijk goedkoper als het dat blijft bij ${m.band ? `vaste kosten per module van ${num(m.band[0])} en ${num(m.band[1])} M€ en bij elke andere kostenaanname` : 'elke kostenaanname'} 25 % lager en hoger. Minimumlast en andere bedrijfsvoering toets je met de omslagkaart en de gevoeligheidsanalyse.`);
    return {title, lines};
  }
  const dearerText = list => {
    const rest = list.filter(n => n !== 1);
    return [...(list.includes(1) ? [moduleLabel(1)] : []), ...(rest.length ? [`${counts(rest)} modules`] : [])].join(' · ');
  };

  function makeReport(input, metadata = {}, comparisonCount) {
    if (!input || !Array.isArray(input.rijen) || !input.rijen.length || !input.aannames) throw new Error('Bereken eerst een scenario om het rekenrapport te openen.');
    const result = clone(input), a = result.aannames;
    const base = result.rijen[0];
    const comparison = result.rijen.find(row => row.modules === Number(comparisonCount)) || result.rijen[1] || base;
    const b = costs(base, a), c = costs(comparison, a);
    const standards = metadata.technologieen?.[result.technologie]?.waarden;
    const fields = (metadata.groepen || []).flatMap(group => (group.velden || []).map(field => ({...field, group: group.naam})));
    const assumptions = Object.keys(a).map(key => {
      const field = fields.find(item => item.key === key) || {};
      const scale = finite(field.schaal) ? field.schaal : 1;
      const value = calc((raw, factor) => raw * factor, a[key], scale);
      const known = standards && finite(standards[key]);
      const changed = known && !near(value, standards[key]);
      const source = changed ? 'eigen aanname' : known ? (field.bron || 'herkomst niet vastgelegd') : 'herkomst niet vastgelegd';
      return {key, label: field.label || key, value, rawValue: number(a[key]), scale, unit: field.eenheid || '', source, originalSource: field.bron || 'onbekend',
        explanation: [field.uitleg, changed ? 'Afwijkend van de standaard voor de gekozen technologie; de herkomst van deze invoer is niet afzonderlijk vastgelegd.' : !known ? 'Geen technologie-standaard vastgelegd in deze berekening; de oorspronkelijke veldbron is geen bevestiging van de herkomst van deze waarde.' : 'Standaardwaarde van de gekozen technologie.'].filter(Boolean).join(' '), group: field.group || 'Gebruikte invoer'};
    });
    const calculations = [];
    function add(key, label, formula, unit, values, expressions) {
      calculations.push({key, label, formula, unit, base: values[0], comparison: values[1], baseExpression: expressions[0], comparisonExpression: expressions[1]});
    }
    const both = fn => [fn(base, b), fn(comparison, c)];
    // Invoer (num) staat zoals ingevoerd; berekende tussenwaarden (sig, eur, ton) hebben drie significante cijfers.
    add('module_mw', 'Stackvermogen per module', 'Totaal stackvermogen / aantal modules', 'MW', both(r => calc((total,n) => total/n,a.capaciteit_mw,r.modules)), both(r => expr([a.capaciteit_mw,r.modules], ' / ', num)));
    add('minimum_stack_mw', 'Minimaal stackvermogen per draaiende module', 'Totaal stackvermogen / aantal modules × minimumlast (exclusief BoP)', 'MW', both(r => calc((total,n,min) => total/n*min,a.capaciteit_mw,r.modules,a.minimumlast)), both(r => `${expr([a.capaciteit_mw,r.modules], ' / ', num)} × ${num(a.minimumlast)}`));
    add('kg', 'Waterstof per jaar', 'Gesimuleerde productie per jaar', 'kg/jaar', both((r,e) => e.kg), both(r => `${sig(r.waterstof_t)} ton`));
    add('energy', 'Stroom inclusief warmhouden', 'Productieverbruik + warmhoudverbruik', 'MWh/jaar', both((r,e) => e.energy), both(r => expr([r.verbruik_mwh,r.standby_mwh], ' + ')));
    add('perKw', 'Variabele investering uit referentieofferte', '(Offerte − offerte-units × vaste kosten per module) × 1.000.000 / (offerte-MW × 1.000)', '€/kW', [b.perKw,c.perKw], both(() => `(${num(a.offerte_meur)} − ${num(a.offerte_modules)} × ${num(a.vaste_kosten_module_meur)}) × 1.000.000 / (${num(a.offerte_mw)} × 1.000)`));
    add('capex', 'Bruto investering (CAPEX)', 'Prijs per kW × totaal MW × 1.000 + aantal modules × vaste modulekosten × 1.000.000', '€', [b.capex,c.capex], both((r,e) => `${sig(e.perKw)} × ${num(a.capaciteit_mw)} × 1.000 + ${num(r.modules)} × ${num(a.vaste_kosten_module_meur)} × 1.000.000`));
    add('subsidy', 'Eenmalige CAPEX-subsidie', 'Subsidie per kW × totaal MW × 1.000', '€', [b.subsidy,c.subsidy], both(() => `${num(a.capex_subsidie_eur_kw)} × ${num(a.capaciteit_mw)} × 1.000`));
    add('annuity', 'Annuïteitsfactor', 'r / (1 − (1 + r)^−looptijd); bij 0 % rente: 1 / looptijd', 'per jaar', [b.annuity,c.annuity], both(() => a.rente === 0 ? `1 / ${num(a.looptijd_jaar)}` : `${num(a.rente)} / (1 − (1 + ${num(a.rente)})^−${num(a.looptijd_jaar)})`));
    add('financing', 'Investering omgerekend naar jaarkosten', '(Bruto investering − eenmalige subsidie) × annuïteitsfactor', '€/jaar', [b.financing,c.financing], both((r,e) => `(${eur(e.capex)} − ${eur(e.subsidy)}) × ${sig(e.annuity)}`));
    add('opex', 'Vaste exploitatiekosten', 'OPEX-aandeel × bruto investering', '€/jaar', [b.opex,c.opex], both((r,e) => `${num(a.opex_aandeel)} × ${eur(e.capex)}`));
    add('wearHours', 'Som slijtage-uren', 'Som van de bedrijfsuren van alle modules; starts en lastwisselingen tellen niet mee', 'bedrijfsuren/jaar', [b.wearHours,c.wearHours], both(r => Array.isArray(r.eq_uren_per_module) ? r.eq_uren_per_module.map(hours => sig(hours)).join(' + ') : 'niet beschikbaar'));
    add('stack', 'Jaarlijkse stackvervanging', 'Stackaandeel × (bruto investering / aantal modules) × som slijtage-uren / stacklevensduur', '€/jaar', [b.stack,c.stack], both((r,e) => `${num(a.stack_aandeel)} × (${eur(e.capex)} / ${num(r.modules)}) × ${sig(e.wearHours)} / ${num(a.stack_levensduur_uur)}`));
    add('powerPrice', 'Totale stroomprijs', 'Stroomprijs + MAX(0; netkosten + belasting − korting)', '€/MWh', [b.powerPrice,c.powerPrice], both(() => `${num(a.stroomprijs_eur_mwh)} + MAX(0; ${num(a.netkosten_eur_mwh)} + ${num(a.belasting_eur_mwh)} − ${num(a.korting_net_belasting_eur_mwh)})`));
    add('power', 'Jaarlijkse elektriciteitskosten', '(Productieverbruik + warmhoudverbruik) × totale stroomprijs', '€/jaar', [b.power,c.power], both((r,e) => `${sig(e.energy)} × ${num(e.powerPrice)}`));
    add('annual', 'Totale jaarkosten', 'Investering per jaar + vaste exploitatiekosten + stackvervanging + elektriciteit', '€/jaar', [b.annual,c.annual], both((r,e) => [e.financing,e.opex,e.stack,e.power].map(eur).join(' + ')));
    add('lcoh', 'Bruto kostprijs (LCOH)', 'Totale jaarkosten / waterstof per jaar', '€/kg', [b.lcoh,c.lcoh], both((r,e) => e.kg > 0 ? `${eur(e.annual)} / ${ton(e.kg)}` : 'Geen productie: kostprijs niet gedefinieerd'));
    add('revenue', 'Premie en zuurstofopbrengst', 'Waterstofpremie + zuurstofprijs per ton × 8 kg zuurstof per kg waterstof / 1.000', '€/kg', [b.revenue,c.revenue], both(() => `${num(a.waterstofpremie_eur_kg)} + ${num(a.zuurstofprijs_eur_t)} × 8 / 1.000`));
    add('net', 'Netto kostprijs na opbrengsten', 'Bruto kostprijs − premie en zuurstofopbrengst', '€/kg', [b.net,c.net], both((r,e) => `${price(e.lcoh)} − ${price(e.revenue)}`));
    const checks = [];
    function check(label, actual, expected, unit, allowAbsent = false) {
      const absent = allowAbsent && actual == null && expected == null;
      const ok = absent || near(actual, expected);
      const shown = value => unit === '€/kg' ? price(value) : sig(value);
      // Afgerond zien twee waarden er vaak gelijk uit; bij een afwijking staat het ongeronde verschil erbij.
      const gap = !ok && finite(actual) && finite(expected) ? ` Verschil: ${num(actual - expected)} ${unit}.` : '';
      checks.push({label,ok,detail: absent ? 'Geen productie: beide waarden zijn niet gedefinieerd.' : `Opgeslagen: ${shown(actual)} ${unit}; nagerekend: ${shown(expected)} ${unit}.${gap}`,actual:number(actual),expected:number(expected)});
    }
    for (const [r,e] of [[base,b],[comparison,c]]) {
      const title = `${r.modules} module${r.modules===1?'':'s'}`;
      check(`${title}: investering`, calc(x=>x*1e6,r.capex_meur),e.capex,'€');
      check(`${title}: kapitaal en vaste OPEX`, calc(x=>x*1e6,r.kapitaal_meur_jaar),e.capitalAnnual,'€/jaar');
      check(`${title}: stackvervanging`, calc(x=>x*1e6,r.stack_meur_jaar),e.stack,'€/jaar');
      check(`${title}: elektriciteit`, calc(x=>x*1e6,r.stroom_meur_jaar),e.power,'€/jaar');
      check(`${title}: totale jaarkosten`, calc(x=>x*1e6,r.kosten_meur_jaar),e.annual,'€/jaar');
      check(`${title}: bruto kostprijs`, r.lcoh_eur_kg,e.lcoh,'€/kg',e.kg===0);
      check(`${title}: netto kostprijs`, r.netto_eur_kg,e.net,'€/kg',e.kg===0);
    }
    const parts = [];
    const delta = calc((after,before)=>after-before,c.lcoh,b.lcoh);
    if (b.kg > 0 && c.kg > 0) {
      const part = (key,label,formula,value,expression) => parts.push({key,label,formula,value,expression,unit:'€/kg'});
      part('meer_waterstof','Meer waterstof', '(Kapitaal en OPEX basis + stackvervanging basis) × (1 / kg vergelijking − 1 / kg basis)',calc((k,s,hn,h1)=>(k+s)*(1/hn-1/h1),b.capitalAnnual,b.stack,c.kg,b.kg),`(${eur(b.capitalAnnual)} + ${eur(b.stack)}) × (1 / ${ton(c.kg)} − 1 / ${ton(b.kg)})`);
      part('duurdere_installatie','Andere installatiekosten','(Kapitaal en OPEX vergelijking − kapitaal en OPEX basis) / kg vergelijking',calc((kn,k1,hn)=>(kn-k1)/hn,c.capitalAnnual,b.capitalAnnual,c.kg),`(${eur(c.capitalAnnual)} − ${eur(b.capitalAnnual)}) / ${ton(c.kg)}`);
      part('stroom_per_kilo','Ander stroomverbruik per kilo','Stroomkosten vergelijking / kg vergelijking − stroomkosten basis / kg basis',calc((en,hn,e1,h1)=>en/hn-e1/h1,c.power,c.kg,b.power,b.kg),`${eur(c.power)} / ${ton(c.kg)} − ${eur(b.power)} / ${ton(b.kg)}`);
      part('stackvervanging','Andere stackvervanging','(Stackkosten vergelijking − stackkosten basis) / kg vergelijking',calc((sn,s1,hn)=>(sn-s1)/hn,c.stack,b.stack,c.kg),`(${eur(c.stack)} − ${eur(b.stack)}) / ${ton(c.kg)}`);
      check('Uitsplitsing telt op tot het kostprijsverschil',sum(parts.map(p=>p.value)),delta,'€/kg');
    }
    const coverage = (result.jaren || []).map(year => {
      const supply=result.aanbod?.[year] || {};
      const hours=number(supply.dekking_uur);
      return {year,hours,scale:hours>0?8760/hours:null,supplyMwh:number(supply.mwh),parks:clone(supply.parken || {})};
    });
    const limitations = [
      'De controles rekenen de kosten na met de opgeslagen simulatie-uitkomsten; ze zijn geen onafhankelijke validatie van het wind- of elektrolysermodel.',
      'Het windaanbod is gemodelleerde mogelijke productie, geen gemeten levering aan de elektrolyser.',
      'Storingen volgen één vaste, herhaalbare trekking per module en windjaar; spreiding tussen windjaren is geen betrouwbaarheidsinterval.',
      'Stackvervanging is een continue jaarlijkse kostenbenadering op basis van bedrijfsuren. Het model rekent de stilstand voor stackwissels in een tweede simulatie mee.',
      START_NOTE,
      INVESTMENT_NOTE
    ];
    if (result.rijen.some(row => row.modules === 1)) limitations.push(REFERENCE_NOTE);
    if (assumptions.some(item=>item.source==='plaatshouder')) limitations.push('Er zijn voorlopige plaatshouders gebruikt. Vervang deze door onderbouwde installatiegegevens voordat je een investeringsconclusie trekt.');
    if (assumptions.some(item=>item.source==='onzekere aanname')) limitations.push('De vaste kosten per extra module zijn een onzekere aanname, geen gevalideerde prijs. Toets de conclusie aan het omslagpunt en de gevoeligheidsanalyse.');
    if (assumptions.some(item=>item.source==='herkomst niet vastgelegd')) limitations.push('Voor een deel van de invoer is de herkomst niet vastgelegd; zie de invoertabel.');
    const robust = materiality(result, metadata);
    return {result,base,comparison,assumptions,calculations,checks,parts,economics:{base:b,comparison:c},delta,materiality:robust,verdict:describe(robust),
      context:{years:result.jaren || [],strategy:result.strategie || '',technology:metadata.technologieen?.[result.technologie]?.naam || result.technologie || 'Niet vastgelegd',modelVersion:result.model_versie ?? 'Niet vastgelegd',windMethod:result.windmethode || 'Niet vastgelegd',windExplanation:result.windmethode_uitleg || '',key:result.sleutel || 'Niet vastgelegd',
        annualisation:'Elke geldige tijdstap duurt 10 minuten (1/6 uur). Per windjaar worden kilo’s, energie en equivalente uren vermenigvuldigd met 8.760 / geldige uren. Meetgaten tellen niet als nul. Ook een schrikkeljaar wordt naar 8.760 uur omgerekend. Bij meerdere jaren worden de jaarlijkse fysieke uitkomsten eerst gemiddeld; de kostprijs wordt daarna uit deze gemiddelden berekend, niet door de kostprijzen per jaar te middelen.',coverage,limitations}};
  }
  const api={makeReport,costs,materiality,describe,moduleLabel,notes:{starts:START_NOTE,investment:INVESTMENT_NOTE,reference:REFERENCE_NOTE},format:{sig,price,num,diff}};
  root.OpsReportModel=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

/* A frozen explanation of an existing result. This does not run or change the simulation. */
(function (root) {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const number = value => finite(value) ? value : null;
  const calc = (fn, ...values) => values.every(finite) ? number(fn(...values)) : null;
  const fmt = value => finite(value) ? String(value).replace('.', ',') : 'niet beschikbaar';
  const expr = (values, join) => values.map(fmt).join(join);
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
    add('module_mw', 'Stackvermogen per module', 'Totaal stackvermogen / aantal modules', 'MW', both(r => calc((total,n) => total/n,a.capaciteit_mw,r.modules)), both(r => expr([a.capaciteit_mw,r.modules], ' / ')));
    add('minimum_stack_mw', 'Minimaal stackvermogen per draaiende module', 'Totaal stackvermogen / aantal modules × minimumlast (exclusief BoP)', 'MW', both(r => calc((total,n,min) => total/n*min,a.capaciteit_mw,r.modules,a.minimumlast)), both(r => `${expr([a.capaciteit_mw,r.modules], ' / ')} × ${fmt(a.minimumlast)}`));
    add('kg', 'Waterstof per jaar', 'Gesimuleerde ton per jaar × 1.000', 'kg/jaar', both((r,e) => e.kg), both(r => `${fmt(r.waterstof_t)} × 1.000`));
    add('energy', 'Stroom inclusief warmhouden', 'Productieverbruik + warmhoudverbruik', 'MWh/jaar', both((r,e) => e.energy), both(r => expr([r.verbruik_mwh,r.standby_mwh], ' + ')));
    add('perKw', 'Variabele investering uit referentieofferte', '(Offerte − offerte-units × vaste kosten per module) × 1.000.000 / (offerte-MW × 1.000)', '€/kW', [b.perKw,c.perKw], both(() => `(${fmt(a.offerte_meur)} − ${fmt(a.offerte_modules)} × ${fmt(a.vaste_kosten_module_meur)}) × 1.000.000 / (${fmt(a.offerte_mw)} × 1.000)`));
    add('capex', 'Bruto investering (CAPEX)', 'Prijs per kW × totaal MW × 1.000 + aantal modules × vaste modulekosten × 1.000.000', '€', [b.capex,c.capex], both((r,e) => `${fmt(e.perKw)} × ${fmt(a.capaciteit_mw)} × 1.000 + ${fmt(r.modules)} × ${fmt(a.vaste_kosten_module_meur)} × 1.000.000`));
    add('subsidy', 'Eenmalige CAPEX-subsidie', 'Subsidie per kW × totaal MW × 1.000', '€', [b.subsidy,c.subsidy], both(() => `${fmt(a.capex_subsidie_eur_kw)} × ${fmt(a.capaciteit_mw)} × 1.000`));
    add('annuity', 'Annuïteitsfactor', 'r / (1 − (1 + r)^−looptijd); bij 0 % rente: 1 / looptijd', 'per jaar', [b.annuity,c.annuity], both(() => a.rente === 0 ? `1 / ${fmt(a.looptijd_jaar)}` : `${fmt(a.rente)} / (1 − (1 + ${fmt(a.rente)})^−${fmt(a.looptijd_jaar)})`));
    add('financing', 'Investering omgerekend naar jaarkosten', '(Bruto investering − eenmalige subsidie) × annuïteitsfactor', '€/jaar', [b.financing,c.financing], both((r,e) => `(${fmt(e.capex)} − ${fmt(e.subsidy)}) × ${fmt(e.annuity)}`));
    add('opex', 'Vaste exploitatiekosten', 'OPEX-aandeel × bruto investering', '€/jaar', [b.opex,c.opex], both((r,e) => expr([a.opex_aandeel,e.capex], ' × ')));
    add('wearHours', 'Som equivalente slijtage-uren', 'Som van de equivalente uren van alle modules, inclusief starts en lastwisselingen', 'equivalente uren/jaar', [b.wearHours,c.wearHours], both(r => Array.isArray(r.eq_uren_per_module) ? r.eq_uren_per_module.map(fmt).join(' + ') : 'niet beschikbaar'));
    add('stack', 'Jaarlijkse stackvervanging', 'Stackaandeel × (bruto investering / aantal modules) × som slijtage-uren / stacklevensduur', '€/jaar', [b.stack,c.stack], both((r,e) => `${fmt(a.stack_aandeel)} × (${fmt(e.capex)} / ${fmt(r.modules)}) × ${fmt(e.wearHours)} / ${fmt(a.stack_levensduur_uur)}`));
    add('powerPrice', 'Totale stroomprijs', 'Stroomprijs + MAX(0; netkosten + belasting − korting)', '€/MWh', [b.powerPrice,c.powerPrice], both(() => `${fmt(a.stroomprijs_eur_mwh)} + MAX(0; ${fmt(a.netkosten_eur_mwh)} + ${fmt(a.belasting_eur_mwh)} − ${fmt(a.korting_net_belasting_eur_mwh)})`));
    add('power', 'Jaarlijkse elektriciteitskosten', '(Productieverbruik + warmhoudverbruik) × totale stroomprijs', '€/jaar', [b.power,c.power], both((r,e) => expr([e.energy,e.powerPrice], ' × ')));
    add('annual', 'Totale jaarkosten', 'Investering per jaar + vaste exploitatiekosten + stackvervanging + elektriciteit', '€/jaar', [b.annual,c.annual], both((r,e) => expr([e.financing,e.opex,e.stack,e.power], ' + ')));
    add('lcoh', 'Bruto kostprijs (LCOH)', 'Totale jaarkosten / waterstof per jaar', '€/kg', [b.lcoh,c.lcoh], both((r,e) => e.kg > 0 ? expr([e.annual,e.kg], ' / ') : 'Geen productie: kostprijs niet gedefinieerd'));
    add('revenue', 'Premie en zuurstofopbrengst', 'Waterstofpremie + zuurstofprijs per ton × 8 kg zuurstof per kg waterstof / 1.000', '€/kg', [b.revenue,c.revenue], both(() => `${fmt(a.waterstofpremie_eur_kg)} + ${fmt(a.zuurstofprijs_eur_t)} × 8 / 1.000`));
    add('net', 'Netto kostprijs na opbrengsten', 'Bruto kostprijs − premie en zuurstofopbrengst', '€/kg', [b.net,c.net], both((r,e) => expr([e.lcoh,e.revenue], ' − ')));
    const checks = [];
    function check(label, actual, expected, unit, allowAbsent = false) {
      const absent = allowAbsent && actual == null && expected == null;
      const ok = absent || near(actual, expected);
      checks.push({label,ok,detail: absent ? 'Geen productie: beide waarden zijn niet gedefinieerd.' : `Opgeslagen: ${fmt(actual)} ${unit}; nagerekend: ${fmt(expected)} ${unit}.`,actual:number(actual),expected:number(expected)});
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
      part('meer_waterstof','Meer waterstof', '(Kapitaal en OPEX basis + stackvervanging basis) × (1 / kg vergelijking − 1 / kg basis)',calc((k,s,hn,h1)=>(k+s)*(1/hn-1/h1),b.capitalAnnual,b.stack,c.kg,b.kg),`(${fmt(b.capitalAnnual)} + ${fmt(b.stack)}) × (1 / ${fmt(c.kg)} − 1 / ${fmt(b.kg)})`);
      part('duurdere_installatie','Andere installatiekosten','(Kapitaal en OPEX vergelijking − kapitaal en OPEX basis) / kg vergelijking',calc((kn,k1,hn)=>(kn-k1)/hn,c.capitalAnnual,b.capitalAnnual,c.kg),`(${fmt(c.capitalAnnual)} − ${fmt(b.capitalAnnual)}) / ${fmt(c.kg)}`);
      part('stroom_per_kilo','Ander stroomverbruik per kilo','Stroomkosten vergelijking / kg vergelijking − stroomkosten basis / kg basis',calc((en,hn,e1,h1)=>en/hn-e1/h1,c.power,c.kg,b.power,b.kg),`${fmt(c.power)} / ${fmt(c.kg)} − ${fmt(b.power)} / ${fmt(b.kg)}`);
      part('stackvervanging','Andere stackvervanging','(Stackkosten vergelijking − stackkosten basis) / kg vergelijking',calc((sn,s1,hn)=>(sn-s1)/hn,c.stack,b.stack,c.kg),`(${fmt(c.stack)} − ${fmt(b.stack)}) / ${fmt(c.kg)}`);
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
      'Stackvervanging is een continue jaarlijkse kostenbenadering op basis van equivalente uren. Het model rekent de stilstand voor stackwissels in een tweede simulatie mee.'
    ];
    if (assumptions.some(item=>item.source==='plaatshouder')) limitations.push('Er zijn voorlopige plaatshouders gebruikt. Vervang deze door onderbouwde installatiegegevens voordat je een investeringsconclusie trekt.');
    if (assumptions.some(item=>item.source==='herkomst niet vastgelegd')) limitations.push('Voor een deel van de invoer is de herkomst niet vastgelegd; zie de invoertabel.');
    return {result,base,comparison,assumptions,calculations,checks,parts,economics:{base:b,comparison:c},delta,
      context:{years:result.jaren || [],strategy:result.strategie || '',technology:metadata.technologieen?.[result.technologie]?.naam || result.technologie || 'Niet vastgelegd',modelVersion:result.model_versie ?? 'Niet vastgelegd',windMethod:result.windmethode || 'Niet vastgelegd',windExplanation:result.windmethode_uitleg || '',key:result.sleutel || 'Niet vastgelegd',
        annualisation:'Elke geldige tijdstap duurt 10 minuten (1/6 uur). Per windjaar worden kilo’s, energie en equivalente uren vermenigvuldigd met 8.760 / geldige uren. Meetgaten tellen niet als nul. Ook een schrikkeljaar wordt naar 8.760 uur omgerekend. Bij meerdere jaren worden de jaarlijkse fysieke uitkomsten eerst gemiddeld; de kostprijs wordt daarna uit deze gemiddelden berekend, niet door de kostprijzen per jaar te middelen.',coverage,limitations}};
  }
  const api={makeReport,costs};
  root.OpsReportModel=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

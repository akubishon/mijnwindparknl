/* A dependency-free, uncompressed OOXML workbook. Simulation outputs stay fixed;
   the financial model is editable and recalculates using real Excel formulas. */
(function (root) {
  'use strict';
  const enc = new TextEncoder();
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const column = n => { let out = ''; for (; n; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out; return out; };
  const cell = (value, style = 0) => ({value, style});
  const formula = (expression, value, style = 3) => ({expression, value, style});
  function sheet(rows, widths = [42, 24, 25, 25, 25, 70]) {
    const body = rows.map((row, i) => '<row r="' + (i + 1) + '">' + row.map((v, j) => {
      const c = v && typeof v === 'object' && ('value' in v || 'expression' in v) ? v : cell(v);
      const attrs = ' r="' + column(j + 1) + (i + 1) + '" s="' + c.style + '"';
      if (c.expression) return '<c' + attrs + (finite(c.value) ? '' : ' t="str"') + '><f>' + xml(c.expression) + '</f><v>' + (finite(c.value) ? c.value : '') + '</v></c>';
      return finite(c.value) ? '<c' + attrs + '><v>' + c.value + '</v></c>' : '<c' + attrs + ' t="inlineStr"><is><t xml:space="preserve">' + xml(c.value) + '</t></is></c>';
    }).join('') + '</row>').join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + widths.map((width,i) => '<col min="' + (i+1) + '" max="' + (i+1) + '" width="' + width + '" customWidth="1"/>').join('') + '</cols><sheetData>' + body + '</sheetData><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>';
  }
  const header = row => row.map(v => cell(v, 1));
  function build(report) {
    if (!report?.result?.aannames || !report.base || !report.comparison) throw new Error('Geen volledig rekenrapport beschikbaar.');
    const a = report.result.aannames, base = report.base, comparison = report.comparison, ctx = report.context || {};
    for (const row of [base, comparison]) {
      if (!Number.isInteger(row.modules) || row.modules < 1 || ![row.waterstof_t,row.verbruik_mwh,row.standby_mwh].every(finite) || !Array.isArray(row.eq_uren_per_module) || row.eq_uren_per_module.length !== row.modules || !row.eq_uren_per_module.every(finite)) throw new Error('Deze uitkomst bevat niet alle jaargegevens voor een controleerbaar Excel-rapport. Bereken het scenario opnieuw.');
    }
    const byKey = new Map((report.assumptions || []).map(v => [v.key, v]));
    const assumptionRows = [header(['Rekensleutel', 'Omschrijving', 'Waarde in rekeneenheid', 'Eenheid', 'Herkomst', 'Toelichting'])];
    const assumptionRefs = {};
    for (const [key, value] of Object.entries(a)) {
      const m = byKey.get(key) || {}, scale = m.scale || 1;
      assumptionRefs[key] = "'Aannames'!$C$" + (assumptionRows.length + 1);
      assumptionRows.push([key, m.label || key, cell(value, 2), scale === 100 ? 'fractie (1 = 100 %)' : m.unit || '', m.source || 'herkomst niet vastgelegd', m.explanation || '']);
    }
    const ref = key => { if (!assumptionRefs[key]) throw new Error('Aanname ontbreekt: ' + key); return assumptionRefs[key]; };
    const infoRows = [header(['Rekenrapport · Elektrolyser opsplitsen', 'Waarde']),
      ['Gebruik', 'Open Narekenen voor de kostprijs, Aannames voor de invoer en Controle voor aansluiting op de pagina.'],
      ['Geel', 'Bewerkbare numerieke invoer. Aannames staan in oorspronkelijke rekeneenheden; percentages zijn fracties.'],
      ['Groen', 'Excel-formules. De opgeslagen uitkomsten zijn direct zichtbaar; Excel rekent opnieuw bij openen of wijzigen.'],
      ['Reikwijdte', 'Excel rekent de kosten na op vaste jaaruitkomsten. Een wijziging van techniek, moduleaantal of wind vraagt een nieuwe simulatie op de website.'],
      ['Belangrijk', 'Wijziging van minimumlast, rendement, storingen of levensduur kan productie/slijtage veranderen. Deze technische doorwerking wordt niet opnieuw gesimuleerd in Excel.'],
      ['Vergelijking', base.modules + ' module(s) tegenover ' + comparison.modules + ' module(s), met gelijk totaalvermogen.'],
      ['Windjaren', (ctx.years || report.result.jaren || []).join(', ')],
      ['Besturing', ctx.strategy || report.result.strategie || ''],
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
    const sumEq = row => Array.isArray(row.eq_uren_per_module) ? row.eq_uren_per_module.reduce((sum, v) => sum + v, 0) : 0;
    const inputs = [
      ['modules', 'Aantal modules', 'aantal', row => row.modules],
      ['kg', 'Waterstof per jaar', 'kg/jaar', row => row.waterstof_t * 1000],
      ['power', 'Productieverbruik', 'MWh/jaar', row => row.verbruik_mwh],
      ['standby', 'Standbyverbruik', 'MWh/jaar', row => row.standby_mwh],
      ['eq', 'Equivalenturen, som van modules', 'uur/jaar', sumEq],
      ['coverage', 'Dekking vóór jaaromrekening', 'uur', row => row.dekking_uur],
      ['supply', 'Windaanbod na jaaromrekening', 'MWh/jaar', row => row.aanbod_mwh]
    ];
    const inputRefs = {};
    const yearRows = [header(['Rekensleutel', 'Vaste simulatie-uitkomst', 'Eenheid', 'Basis: ' + base.modules + ' module(s)', 'Vergelijking: ' + comparison.modules + ' module(s)'])];
    for (const [key, label, unit, get] of inputs) {
      inputRefs[key] = yearRows.length + 1;
      yearRows.push([key,label,unit,cell(get(base),2),cell(get(comparison),2)]);
    }
    yearRows.push(['Toelichting','Dit zijn jaargemiddelden uit de simulatie. Jaarinvoer aanpassen simuleert geen nieuwe technische inzet.']);
    yearRows.push([]); yearRows.push(header(['Windjaar','Dekking (uur)','Omrekenfactor naar 8.760 uur','Windaanbod (MWh/jaar)']));
    for (const item of ctx.coverage || []) yearRows.push([item.year,item.hours,item.scale,item.supplyMwh]);
    const calcRows = [header(['Rekenstap','Eenheid','Formule in woorden','Basis: ' + base.modules + ' module(s)','Vergelijking: ' + comparison.modules + ' module(s)','Toelichting'])];
    const calcRefs = {}, values = {D:{},E:{}};
    const j = (key,col) => "'Jaarinvoer'!" + col + inputRefs[key];
    function add(key,label,unit,description,expression,calculate,note='') {
      calcRefs[key] = calcRows.length + 1;
      const out = [label,unit,description];
      for (const [col,row] of [['D',base],['E',comparison]]) {
        const value = calculate(row,values[col]); values[col][key] = value;
        out.push(formula(expression(col),value));
      }
      calcRows.push([...out,note]);
    }
    const c = (key,col) => col + calcRefs[key];
    add('perKw','Variabele investering per kW','€/kW','(referentieprijs − units × vaste kosten) × 1.000.000 ÷ (referentie-MW × 1.000)', ()=>'('+ref('offerte_meur')+'-'+ref('offerte_modules')+'*'+ref('vaste_kosten_module_meur')+')*1000000/('+ref('offerte_mw')+'*1000)', ()=>(a.offerte_meur-a.offerte_modules*a.vaste_kosten_module_meur)*1e6/(a.offerte_mw*1000));
    add('capex','Totale bruto investering','€','Variabele €/kW × MW × 1.000 + modules × vaste kosten × 1.000.000',col=>c('perKw',col)+'*'+ref('capaciteit_mw')+'*1000+'+j('modules',col)+'*'+ref('vaste_kosten_module_meur')+'*1000000',(r,v)=>v.perKw*a.capaciteit_mw*1000+r.modules*a.vaste_kosten_module_meur*1e6);
    add('subsidy','Eenmalige investeringssubsidie','€','Subsidie per kW × vermogen in MW × 1.000',()=>ref('capex_subsidie_eur_kw')+'*'+ref('capaciteit_mw')+'*1000',()=>a.capex_subsidie_eur_kw*a.capaciteit_mw*1000);
    add('crf','Annuïteitsfactor','1/jaar','r ÷ (1 − (1+r)^−looptijd); bij 0% rente: 1 ÷ looptijd',()=> 'IF('+ref('rente')+'=0,1/'+ref('looptijd_jaar')+','+ref('rente')+'/(1-(1+'+ref('rente')+')^(-'+ref('looptijd_jaar')+')))',()=>a.rente ? a.rente/(1-(1+a.rente)**(-a.looptijd_jaar)) : 1/a.looptijd_jaar);
    add('annualCapital','Investering per jaar','€/jaar','(bruto investering − subsidie) × annuïteitsfactor',col=>'('+c('capex',col)+'-'+c('subsidy',col)+')*'+c('crf',col),(r,v)=>(v.capex-v.subsidy)*v.crf);
    add('opex','Vaste exploitatiekosten','€/jaar','OPEX-aandeel × bruto investering',col=>ref('opex_aandeel')+'*'+c('capex',col),(r,v)=>a.opex_aandeel*v.capex);
    add('stack','Stackvervanging per jaar','€/jaar','Stackaandeel × (investering ÷ modules) × som equivalenturen ÷ stacklevensduur',col=>ref('stack_aandeel')+'*('+c('capex',col)+'/'+j('modules',col)+')*'+j('eq',col)+'/'+ref('stack_levensduur_uur'),(r,v)=>a.stack_aandeel*v.capex/r.modules*sumEq(r)/a.stack_levensduur_uur,'Continue slijtagebenadering; geen kasstroom op één vervangingsdatum.');
    add('powerPrice','Totale elektriciteitsprijs','€/MWh','Stroomprijs + MAX(0; netkosten + belasting − korting)',()=>ref('stroomprijs_eur_mwh')+'+MAX(0,'+ref('netkosten_eur_mwh')+'+'+ref('belasting_eur_mwh')+'-'+ref('korting_net_belasting_eur_mwh')+')',()=>a.stroomprijs_eur_mwh+Math.max(0,a.netkosten_eur_mwh+a.belasting_eur_mwh-a.korting_net_belasting_eur_mwh));
    add('electricity','Elektriciteitskosten','€/jaar','(productieverbruik + standbyverbruik) × totale elektriciteitsprijs',col=>'('+j('power',col)+'+'+j('standby',col)+')*'+c('powerPrice',col),(r,v)=>(r.verbruik_mwh+r.standby_mwh)*v.powerPrice);
    add('annual','Totale jaarkosten','€/jaar','Investering per jaar + vaste OPEX + stackvervanging + elektriciteit',col=>[c('annualCapital',col),c('opex',col),c('stack',col),c('electricity',col)].join('+'),(r,v)=>v.annualCapital+v.opex+v.stack+v.electricity);
    add('lcoh','Kostprijs waterstof (LCOH)','€/kg','Totale jaarkosten ÷ kilo waterstof per jaar',col=>'IF('+j('kg',col)+'>0,'+c('annual',col)+'/'+j('kg',col)+',"")',(r,v)=>r.waterstof_t>0?v.annual/(r.waterstof_t*1000):null,'Bij nul waterstof is de kostprijs niet gedefinieerd.');
    add('revenue','Premie en zuurstofopbrengst','€/kg','Waterstofpremie + zuurstofprijs per ton × 8 ÷ 1.000',()=>ref('waterstofpremie_eur_kg')+'+'+ref('zuurstofprijs_eur_t')+'*8/1000',()=>a.waterstofpremie_eur_kg+a.zuurstofprijs_eur_t*8/1000,'Aangenomen: alle 8 kg zuurstof per kg waterstof worden verkocht.');
    add('net','Netto kostprijs na opbrengsten','€/kg','LCOH − premie en zuurstofopbrengst',col=>'IF('+j('kg',col)+'>0,'+c('lcoh',col)+'-'+c('revenue',col)+',"")',(r,v)=>finite(v.lcoh)?v.lcoh-v.revenue:null);
    calcRows.push([]);
    calcRows.push(['Verschil LCOH (vergelijking − basis)','€/kg','Negatief betekent goedkoper','',formula('IF(AND('+j('kg','D')+'>0,'+j('kg','E')+'>0),E'+calcRefs.lcoh+'-D'+calcRefs.lcoh+',"")',finite(values.D.lcoh)&&finite(values.E.lcoh)?values.E.lcoh-values.D.lcoh:null)]);
    calcRows.push(['Extra waterstof','kg/jaar','Vergelijking − basis','',formula(j('kg','E')+'-'+j('kg','D'),comparison.waterstof_t*1000-base.waterstof_t*1000)]);
    calcRows.push(['Extra jaarkosten','€/jaar','Vergelijking − basis','',formula('E'+calcRefs.annual+'-D'+calcRefs.annual,values.E.annual-values.D.annual)]);
    const extraKgRow = calcRows.length - 1, extraCostRow = calcRows.length;
    const extraKg=(comparison.waterstof_t-base.waterstof_t)*1000;
    calcRows.push(['Kosten extra kilo’s','€/extra kg','Extra jaarkosten ÷ extra kilo’s; alleen bij meer productie','',formula('IF(E'+extraKgRow+'>0,E'+extraCostRow+'/E'+extraKgRow+',"")',extraKg>0?(values.E.annual-values.D.annual)/extraKg:null),'Marginale kosten verschillen van de gemiddelde kostprijs (LCOH).']);
    const checkRows = [header(['Controle','Eenheid','Uitkomst pagina: basis','Uitkomst pagina: vergelijking','Verschil Excel − pagina: basis','Verschil Excel − pagina: vergelijking'])];
    for (const [key,field,scale,unit] of [['capex','capex_meur',1e6,'€'],['stack','stack_meur_jaar',1e6,'€/jaar'],['electricity','stroom_meur_jaar',1e6,'€/jaar'],['annual','kosten_meur_jaar',1e6,'€/jaar'],['lcoh','lcoh_eur_kg',1,'€/kg'],['net','netto_eur_kg',1,'€/kg']]) {
      const n=checkRows.length+1, bv=finite(base[field])?base[field]*scale:null, ev=finite(comparison[field])?comparison[field]*scale:null;
      checkRows.push([field,unit,bv,ev,formula(bv!==null?"'Narekenen'!D"+calcRefs[key]+'-C'+n:'""',bv!==null?values.D[key]-bv:null),formula(ev!==null?"'Narekenen'!E"+calcRefs[key]+'-D'+n:'""',ev!==null?values.E[key]-ev:null)]);
    }
    checkRows.push(['Interpretatie','Een verschil van nul (afgezien van afrondingsruis) betekent dat de kostenformules aansluiten op de opgeslagen pagina-uitkomst.']);
    for (const check of report.checks || []) checkRows.push([check.label,check.ok?'Sluit aan':'Controleer',check.detail]);
    const sheets=[['Leeswijzer',sheet(infoRows,[40,115])],['Aannames',sheet(assumptionRows,[36,45,24,28,30,90])],['Jaarinvoer',sheet(yearRows,[20,48,24,28,28])],['Narekenen',sheet(calcRows,[42,20,80,27,27,85])],['Controle',sheet(checkRows,[40,26,28,28,30,30])]];
    if (report.moments) {
      const m = report.moments, rows = [header(['Tien minuten van dichtbij', 'Configuratie', 'Rekenstap', 'Formule', 'Ingevulde berekening', 'Uitkomst', 'Eenheid'])];
      rows.push(['Datum',m.date || 'Niet beschikbaar']);
      rows.push(['Gebruik','De momentformules zijn tekst voor controle. De actieve Excel-formules staan op Narekenen.']);
      for (const note of m.notes || []) rows.push(['Toelichting', note]);
      for (const moment of m.moments || []) {
        rows.push([]);rows.push(header([moment.title, '', 'Selectie', moment.criterion]));
        if (moment.available === false) { rows.push(['Geen moment beschikbaar']);continue; }
        const stamp = finite(moment.timestamp) ? new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(new Date(moment.timestamp * 1000)) : '';
        rows.push(['Tijd (Nederland)',stamp]);
        const append = (list,config) => { for (const step of list || []) rows.push([moment.title,config,step.label,step.formula,step.expression,cell(step.value,3),step.unit]); };
        append(moment.wind,'Windaanbod');
        for (const config of moment.configurations || []) {
          const label=config.modules+' module(s)';
          append(config.rows,label);
          for (const reason of config.reasons || []) rows.push([moment.title,label,'Besturing',reason]);
          for (const module of config.moduleRows || []) append(module.rows,label+' · module '+module.module);
          if(config.check)rows.push([moment.title,label,'Controle waterstof',config.check.ok?'Sluit aan binnen afronding':'Controleer',config.check.detail,config.check.deltaKg,'kg']);
        }
      }
      sheets.push(['Tienminuten',sheet(rows,[28,30,48,90,95,26,20])]);
    }
    const files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'+sheets.map(([name],i)=>'<sheet name="'+xml(name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>',
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000000;[Red]-0.000000"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C2340"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1CC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4F2E8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    };
    sheets.forEach(([,content],i)=>files['xl/worksheets/sheet'+(i+1)+'.xml']=content);
    return zip(files);
  }
  function zip(files) {
    const chunks=[],central=[];let offset=0;
    const u16=(view,i,n)=>view.setUint16(i,n,true),u32=(view,i,n)=>view.setUint32(i,n>>>0,true);
    const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
    for(const [path,content] of Object.entries(files)) {
      const name=enc.encode(path),data=enc.encode(content);let crc=0xffffffff;for(const byte of data)crc=table[(crc^byte)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
      const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);u32(l,0,0x04034b50);u16(l,4,20);u16(l,6,0x800);u16(l,12,33);u32(l,14,crc);u32(l,18,data.length);u32(l,22,data.length);u16(l,26,name.length);local.set(name,30);
      const dir=new Uint8Array(46+name.length),d=new DataView(dir.buffer);u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u16(d,8,0x800);u16(d,14,33);u32(d,16,crc);u32(d,20,data.length);u32(d,24,data.length);u16(d,28,name.length);u32(d,42,offset);dir.set(name,46);
      chunks.push(local,data);central.push(dir);offset+=local.length+data.length;
    }
    const size=central.reduce((sum,c)=>sum+c.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);u32(e,0,0x06054b50);u16(e,8,central.length);u16(e,10,central.length);u32(e,12,size);u32(e,16,offset);
    const out=new Uint8Array(offset+size+end.length);let at=0;for(const c of [...chunks,...central,end]){out.set(c,at);at+=c.length;}return out;
  }
  root.OpsReportExcel=Object.freeze({build});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.OpsReportExcel;
})(globalThis);

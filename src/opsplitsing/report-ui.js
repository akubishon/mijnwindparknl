/* Reproducible report UI: always reads the last calculated snapshot, never live form inputs. */
(function(root){
  'use strict';
  const SUPPORTED_MODEL_VERSION=17; // MODEL_VERSION of the bundled Python runtime.
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  // Invoer (fmt) staat zoals ingevoerd. Uitkomsten: drie significante cijfers, €/kg hooguit twee decimalen, kilo's als ton,
  // grote eurobedragen in miljoenen; een verschil krijgt de resolutie van de waarden die het vergelijkt. Excel en JSON houden de volle precisie.
  const F=root.OpsReportModel.format;
  const fmt=(n,d=2)=>finite(n)?new Intl.NumberFormat('nl-NL',{maximumFractionDigits:d}).format(n):'Niet beschikbaar';
  const sig=n=>finite(n)?F.sig(n):'Niet beschikbaar';
  const price=n=>finite(n)?F.price(n):'Niet beschikbaar';
  const change=(after,before,kind)=>finite(after)&&finite(before)?F.diff(after,before,kind):'niet te bepalen';
  // De stroomprijs (€/MWh) blijft zoals hij was: twee decimalen.
  const quantity=(n,unit)=>!finite(n)?'Niet beschikbaar':unit==='€/kg'?`${price(n)} ${unit}`:unit==='€/MWh'?`${fmt(n,2)} ${unit}`:unit.startsWith('kg')&&Math.abs(n)>=1000?`${sig(n/1000)} ton${unit.slice(2)}`:(unit==='€'||unit==='€/jaar')&&Math.abs(n)>=1e6?`${sig(n/1e6)} miljoen ${unit}`:`${sig(n)} ${unit}`;
  const scaled=(n,divisor)=>finite(n)?n/divisor:null;
  const difference=(after,before)=>finite(after)&&finite(before)?after-before:null;
  const cfg=r=>`${r.modules} × ${fmt(r.module_mw,3)} MW${r.modules===1?' (theoretische referentie)':''}`;
  const label=n=>root.OpsReportModel.moduleLabel(n);
  const starts=row=>finite(row.starts_warm_per_module)&&finite(row.starts_koud_per_module)?{perModule:row.starts_warm_per_module+row.starts_koud_per_module,total:(row.starts_warm_per_module+row.starts_koud_per_module)*row.modules}:null;
  const dateText=s=>new Date(s).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'long',timeStyle:'short'});
  let snapshot=null, metadata=null, report=null, revision=0, loading=false, previousButton=null, selectedMoment='low';
  const table=(heads,rows,label)=>`<div class="report-scroll" tabindex="0" role="region" aria-label="${esc(label)}"><table><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const section=(n,title,body)=>`<section class="report-section"><h3><span>${n}</span>${esc(title)}</h3>${body}</section>`;
  const download=(content,name,type)=>{const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function defaultComparison(rows){
    const best=rows.reduce((a,b)=>(b.lcoh_eur_kg??Infinity)<(a.lcoh_eur_kg??Infinity)?b:a);
    return best.modules!==rows[0].modules?best.modules:rows[1]?.modules??rows[0].modules;
  }
  function criticalAssumptions(r){
    const keys=['minimumlast','systeemverbruik_vol','opstart_warm_min','opstart_koud_min','offerte_meur','vaste_kosten_module_meur','stroomprijs_eur_mwh','stack_levensduur_uur'];
    const important=r.assumptions.filter(a=>keys.includes(a.key));
    const failed=r.checks.filter(check=>!check.ok);
    return `<aside class="report-critical" aria-label="Belangrijke aannames bij de conclusie"><h4>Aannames die deze uitkomst kunnen veranderen</h4><p>Minimumlast, rendement en opstarttijd bepalen hoeveel waterstof modules produceren. De referentieofferte, vaste modulekosten, stroomprijs en stacklevensduur bepalen wat dat kost.</p><ul>${important.map(a=>`<li><strong>${esc(a.label)}: ${fmt(a.value,3)} ${esc(a.unit)}</strong><span>${esc(a.source)}</span></li>`).join('')}</ul><p>Het windaanbod is gemodelleerd. Storingen gebruiken één vaste trekking per module en windjaar; de spreiding tussen windjaren is geen onzekerheidsband. Controleer voorlopige waarden aan de hand van leveranciersgegevens.</p>${failed.length?`<p class="report-control-warning"><strong>${failed.length} rekencontrole${failed.length===1?'':'s'} sluiten niet aan.</strong> Bekijk Onderbouwing voordat je deze uitkomst gebruikt.</p>`:''}</aside>`;
  }
  // Kop: de conclusie binnen de modelonzekerheid over alle gekozen aantallen (regel in report-model.js, materiality()).
  function robustness(r){
    const v=r.verdict;
    return v?`<div class="report-robust"><h4>${esc(v.title)}</h4>${v.lines.map(line=>`<p>${esc(line)}</p>`).join('')}</div>`:'';
  }
  function notes(r){
    const N=root.OpsReportModel.notes;
    return `<ul class="report-notes">${[N.investment,N.starts,...(r.result.rijen.some(row=>row.modules===1)?[N.reference]:[])].map(note=>`<li>${esc(note)}</li>`).join('')}</ul>`;
  }
  function conclusion(r){
    const b=r.economics.base,c=r.economics.comparison;
    const kgDelta=difference(c.kg,b.kg),costDelta=difference(c.annual,b.annual);
    const tonnes=!finite(kgDelta)?'Het verschil in waterstofproductie is niet te bepalen.':kgDelta===0?`Met ${label(r.comparison.modules)}: evenveel waterstof als met ${label(r.base.modules)}.`
      :`Met ${label(r.comparison.modules)}: ${F.diff(c.kg/1000,b.kg/1000,'sig',false)} ton waterstof per jaar ${kgDelta>0?'meer':'minder'} dan met ${label(r.base.modules)}.`;
    const costText=finite(costDelta)?costDelta===0?'De jaarkosten veranderen niet.':`De jaarkosten ${costDelta>0?'stijgen':'dalen'} met ${F.diff(c.annual/1e6,b.annual/1e6,'sig',false)} miljoen euro per jaar.`:'De verandering in jaarkosten is niet te bepalen door ontbrekende kostengegevens.';
    const text=r.base.modules===r.comparison.modules
      ? r.result.rijen.length===1?'Er is één opstelling gekozen. Kies meerdere aantallen modules om het effect van opsplitsen te vergelijken.':'Je vergelijkt de basis met zichzelf. Kies een andere opstelling om het effect van opsplitsen te zien.'
      : [tonnes,costText,r.delta==null?'Een kostprijsvergelijking is niet mogelijk door ontbrekende productie of kostengegevens.':r.delta===0?`De bruto kostprijs blijft ${price(b.lcoh)} €/kg.`:`Daardoor ${r.delta<0?'daalt':'stijgt'} de bruto kostprijs van ${price(b.lcoh)} naar ${price(c.lcoh)} €/kg.`,
        ...(r.delta!=null&&r.delta!==0&&price(b.lcoh)===price(c.lcoh)?['Het verschil is kleiner dan 0,01 €/kg; de precieze waarden staan in de Excel- en JSON-export.']:[])];
    const startText=row=>{const s=starts(row);return s?`<br>${sig(s.total)} starts per jaar (${sig(s.perModule)} per module)`:'';};
    return `${robustness(r)}<p class="report-verdict">${[].concat(text).map(sentence=>`<span>${esc(sentence)}</span>`).join(' ')}</p><div class="report-summary">${[[r.base,b,'Basis','base'],[r.comparison,c,'Opsplitsing','comparison']].map(([row,e,title,key])=>`<div class="report-${key}"><span>${title} · ${esc(cfg(row))}</span><strong>${price(e.lcoh)} <small>€/kg bruto</small></strong><p>${sig(scaled(e.kg,1000))} ton waterstof per jaar<br>${sig(scaled(e.annual,1e6))} miljoen euro per jaar${startText(row)}</p></div>`).join('')}</div><p class="note">Beide opstellingen gebruiken hetzelfde windaanbod en ${fmt(r.result.aannames.capaciteit_mw,2)} MW totaal stackvermogen. De basis is de eerste gekozen opstelling. Deze conclusie geldt voor de gekozen windjaren en aannames.</p>${notes(r)}${criticalAssumptions(r)}`;
  }
  function calculationBlocks(r){
    const b=r.economics.base,c=r.economics.comparison;
    const calculations=keys=>table(['Rekenstap',`Basis · ${cfg(r.base)}`,`Opsplitsing · ${cfg(r.comparison)}`],r.calculations.filter(row=>keys.includes(row.key)).map(row=>`<tr><th scope="row">${esc(row.label)}<small>${esc(row.formula)}</small></th>${['base','comparison'].map(k=>`<td><span class="report-expression">${esc(row[k+'Expression'])}</span><strong>${esc(quantity(row[k],row.unit))}</strong></td>`).join('')}</tr>`),'Ingevulde berekening');
    const pair=(fn)=>`<div class="report-block-pair"><p class="report-base"><span>Basis · ${esc(cfg(r.base))}</span><strong>${fn(b)}</strong></p><p class="report-comparison"><span>Opsplitsing · ${esc(cfg(r.comparison))}</span><strong>${fn(c)}</strong></p></div>`;
    const block=(title,explanation,body,details)=>`<article class="report-block"><h4>${title}</h4><p>${explanation}</p>${body}<details class="report-calculation"><summary>Bekijk de berekening<span class="sr-only">: ${title}</span></summary>${details}</details></article>`;
    const costs=table(['Kosten per jaar',`Basis · ${cfg(r.base)}`,`Opsplitsing · ${cfg(r.comparison)}`],[['Investering per jaar','financing'],['Onderhoud en vaste exploitatie','opex'],['Stackvervanging','stack'],['Stroom en warmhouden','power'],['Totaal','annual']].map(([label,key])=>`<tr><th scope="row">${label}</th><td>${sig(scaled(b[key],1e6))} miljoen euro</td><td>${sig(scaled(c[key],1e6))} miljoen euro</td></tr>`),'Opbouw jaarkosten');
    const delta=change(c.lcoh,b.lcoh,'price');
    return `<div class="report-blocks">${block('Waterstof per jaar','We tellen de productie van alle beschikbare tienminutenstappen op en rekenen ieder windjaar om naar 8.760 uur.',pair(e=>`${sig(scaled(e.kg,1000))} ton/jaar`)+`<p class="report-block-delta">Verschil: ${change(scaled(c.kg,1000),scaled(b.kg,1000))} ton/jaar</p>`,`<p>${esc(r.context.annualisation)}</p>${calculations(['kg'])}`)}${block('Kosten per jaar','De jaarkosten bestaan uit investering per jaar, onderhoud en vaste exploitatie, stackvervanging en stroom. De investering is de referentieofferte plus de vaste kosten per module; installatie, civiele werken en netaansluiting tellen alleen mee als ze in die offerte zitten.',costs+`<p class="report-block-delta">Verschil: ${change(scaled(c.annual,1e6),scaled(b.annual,1e6))} miljoen euro/jaar</p>`,calculations(['perKw','capex','subsidy','annuity','financing','opex','wearHours','stack','energy','powerPrice','power','annual']))}${block('Kosten per kilo','Jaarkosten ÷ kilo’s per jaar = €/kg bruto.',pair(e=>`${price(e.lcoh)} €/kg`)+`<p class="report-block-delta">Verschil: ${delta==='niet te bepalen'?delta:delta+' €/kg'}</p>`,calculations(['lcoh','revenue','net']))}</div>`;
  }
  function enableExports(){ $('report-print').disabled=loading; $('report-excel').disabled=loading; $('report-json').disabled=loading; }
  function showSensitivity(data,n){
    const target=$('result-sensitivity'),top=data?.aannames?.[0];
    if(!target||!snapshot||!top)return;
    const shown=root.OpsReportModel.makeReport(snapshot,metadata,n),assumption=shown.assumptions.find(a=>a.key===top.key);
    const effect=value=>!finite(value)?'niet te bepalen':`${price(Math.abs(value))} €/kg ${value>=0?'goedkoper':'duurder'}`;
    target.innerHTML=`<h4>Welke aanname telt het zwaarst?</h4><p>Bij de controle van ${n} modules tegenover 1 module (theoretische referentie) verschuift de uitkomst het sterkst door <strong>${esc(top.label)}</strong> (nu ${fmt(top.nu,3)} ${esc(top.eenheid)} · ${esc(assumption?.source||'herkomst niet vastgelegd')}). Met ${fmt(top.laag.waarde,3)} ${esc(top.eenheid)} zijn ${n} modules ${effect(top.laag.voordeel)}; met ${fmt(top.hoog.waarde,3)} ${esc(top.eenheid)} ${effect(top.hoog.voordeel)}.</p><p class="note">Deze controle varieert telkens één aanname met 25 %, binnen de invoergrenzen. De volledige gevoeligheidsanalyse staat onder Onderbouwing.</p>`;
    target.hidden=false;
  }
  function setResult(result,meta){
    snapshot=JSON.parse(JSON.stringify(result));metadata=JSON.parse(JSON.stringify(meta));revision++;report=null;loading=false;
    const panel=$('calculation-report');if(panel)panel.hidden=true;
    $('explain-calculation')?.setAttribute('aria-expanded','false');
    if($('result-sensitivity'))$('result-sensitivity').hidden=true;
    const overview=$('result-conclusion');
    if(overview){const shown=root.OpsReportModel.makeReport(snapshot,metadata,defaultComparison(snapshot.rijen));overview.innerHTML='<h3>Wat levert opsplitsen op?</h3>'+conclusion(shown)+calculationBlocks(shown);}
  }
  function make(count){
    report=root.OpsReportModel.makeReport(snapshot,metadata,count);
    report.generatedAt=new Date().toISOString();
    return report;
  }
  function render(){
    const r=report,b=r.economics.base,c=r.economics.comparison,ctx=r.context;
    $('report-title').textContent=`Rekenrapport · ${cfg(r.base)} tegenover ${cfg(r.comparison)}`;
    $('report-meta').textContent=`${ctx.technology} · ${ctx.strategy} · windjaren ${ctx.years.join(', ')} · model ${ctx.modelVersion}${ctx.windProfile==='onafhankelijk'?'':' · '+ctx.windProfileName}${ctx.parks.length===2?'':' · '+ctx.parksText}`;
    $('report-stamp').textContent=`Vastgelegd op ${dateText(r.generatedAt)} (Nederlandse tijd). Berekening: ${ctx.key}.`;
    const choose=$('report-count');choose.replaceChildren(...snapshot.rijen.map(row=>new Option(cfg(row),row.modules,false,row.modules===r.comparison.modules)));
    const signs=v=>finite(v)?(v>0?'+':v<0?'−':'')+price(Math.abs(v)):'Niet beschikbaar';
    const summary=conclusion(r);
    const assumptions=table(['Gebruikte invoer','Waarde','Eenheid','Herkomst','Toelichting'],r.assumptions.map(a=>`<tr><th scope="row">${esc(a.label)}</th><td class="report-number">${fmt(a.value,6)}</td><td>${esc(a.unit)}</td><td><span class="report-source">${esc(a.source)}</span></td><td>${esc(a.explanation)}</td></tr>`),'Invoer en bronnen');
    const annual=`<p>${esc(ctx.annualisation)}</p>${table(['Windjaar','Geldige uren','Factor naar 8.760 uur','Aanbod na omrekening (MWh/jaar)'],ctx.coverage.map(v=>`<tr><th scope="row">${v.year}</th><td>${fmt(v.hours)}</td><td>8.760 / ${fmt(v.hours)} = ${fmt(v.scale,4)}</td><td>${sig(v.supplyMwh)}</td></tr>`),'Datadekking per windjaar')}<p class="note">Windmethode: ${esc(ctx.windExplanation||ctx.windMethod)}. Jaarproductie en slijtage-uren komen uit de volledige simulatie; drie voorbeeldmomenten illustreren de werking.</p>`;
    const arithmetic=table(['Rekenstap en formule',`${cfg(r.base)} · basis`,`${cfg(r.comparison)} · vergelijking`],r.calculations.map(row=>`<tr><th scope="row">${esc(row.label)}<small>${esc(row.formula)}</small></th>${['base','comparison'].map(k=>`<td><span class="report-expression">${esc(row[k+'Expression'])}</span><strong>${esc(quantity(row[k],row.unit))}</strong></td>`).join('')}</tr>`),'Rekenstappen jaarkosten en kostprijs');
    const differences=r.parts.length?`${table(['Onderdeel','Ingevulde berekening','Verschil (€/kg)'],r.parts.map(p=>`<tr><th scope="row">${esc(p.label)}<small>${esc(p.formula)}</small></th><td class="report-expression">${esc(p.expression)}</td><td class="report-number">${signs(p.value)}</td></tr>`),'Verklaring kostprijsverschil')}<p>Som van de vier onderdelen: <strong>${signs(r.parts.every(p=>finite(p.value))?r.parts.reduce((s,p)=>s+p.value,0):null)} €/kg</strong>. Negatief verlaagt de kostprijs; positief verhoogt de kostprijs.</p>`:'<p>Een verschil per kilo is alleen gedefinieerd als beide opstellingen waterstof produceren.</p>';
    const checks=`<p class="report-check-intro">${r.checks.filter(v=>v.ok).length} van ${r.checks.length} rekencontroles sluiten aan. De controles vergelijken opgeslagen uitkomsten met opnieuw berekende kosten op basis van dezelfde invoer.</p><ul class="report-checks">${r.checks.map(v=>`<li class="${v.ok?'report-pass':'report-fail'}"><strong>${v.ok?'✓ Sluit aan':'! Controleer'} · ${esc(v.label)}</strong><span>${esc(v.detail)}</span></li>`).join('')}</ul><p class="note">De controles gebruiken ongeronde waarden met een relatieve tolerantie van 0,000001 %. Getoonde uitkomsten hebben drie significante cijfers, €/kg hooguit twee decimalen; invoer staat zoals ingevoerd. Het Excel-bestand en de rapportdata (JSON) behouden de volledige precisie.</p>`;
    const sources=`<p>${ctx.windProfile==='onafhankelijk'&&ctx.parks.length===2?'De windbron bestaat uit KNMI-tienminutenmetingen van Houtribdijk en Stavoren, een hoogtevertaling met WINS50 en de vermogenscurves van beide parken. Het aanbod is 10 % van Fryslân plus heel Beabuorren.':`Windprofiel: ${esc(ctx.windExplanation||ctx.windProfileName)}. Aanbod: ${esc(ctx.parksText)}.`}</p><p>Een deel van de technische en economische standaardwaarden komt uit de EU LCOH-tool van Clean Hydrogen Partnership. De referentieofferte is een eigen aanname. De vaste kosten per extra module (standaard 1 M€) zijn een onzekere aanname, geen gevalideerde prijs: losse PCU-prijzen ontbreken en de kosten hangen af van de modulegrootte. Lees de uitkomst daarom samen met het omslagpunt en de gevoeligheidsanalyse. Minimumlast, opstarttijden en andere niet vastgelegde installatiegegevens kunnen plaatshouders zijn. De tabel benoemt de herkomst per invoerwaarde; eigen invoer is geen bevestigde bronwaarde.</p>`;
    const support=`<details class="report-inputs"><summary>Bronnen en alle ${r.assumptions.length} gebruikte aannames</summary>${sources}${assumptions}</details><details class="report-inputs"><summary>Van tien minuten naar een jaar: datadekking en omrekening</summary>${annual}</details><details class="report-inputs"><summary>Narekenen: alle ingevulde formules</summary>${arithmetic}<h4>Waar komt het kostprijsverschil vandaan?</h4>${differences}</details><details class="report-inputs"><summary>Rekencontroles · ${r.checks.filter(v=>v.ok).length} van ${r.checks.length} sluiten aan</summary>${checks}</details><details class="report-inputs"><summary>Grenzen van deze uitkomst</summary><p>De kostenberekening is controleerbaar binnen de gebruikte invoer. De praktijkuitkomst hangt af van de brongegevens en aannames.</p><ul>${ctx.limitations.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p>Het Excel-bestand rekent de kosten met formules na. Verander je technische aannames of windjaren, voer dan een nieuwe simulatie uit.</p></details>`;
    const example=`<p>Kies één voorbeeldmoment: weinig wind, veel wind of opstarten. <strong>De jaaruitkomst gebruikt alle beschikbare tienminutenstappen.</strong> Dit voorbeeld legt alleen de werking uit.</p><div class="report-day-controls"><label>Voorbeelddag <input type="date" id="report-day" value="${esc(snapshot.voorbeelddag||ctx.years[0]+'-01-01')}"></label><button type="button" class="secondary-button" id="report-load-day">Toon rekenmomenten</button></div><label class="report-moment-picker">Voorbeeldmoment <select id="report-moment-choice"><option value="low">Weinig wind</option><option value="high">Veel wind</option><option value="start">Opstarten</option></select></label><p id="report-day-status" role="status"></p><div id="report-moments" aria-live="polite"></div>`;
    $('report-body').innerHTML=section(1,'Wat levert opsplitsen op?',summary)+section(2,'De berekening in drie stappen',calculationBlocks(r))+section(3,'Eén voorbeeldmoment van dichtbij',example)+section(4,'Onderbouwing',support);
    $('report-load-day').onclick=loadMoments;
    $('report-moment-choice').value=selectedMoment;
    $('report-moment-choice').onchange=()=>{selectedMoment=$('report-moment-choice').value;renderMoments();};
    enableExports();
  }
  function momentsHtml(data){
    const rowTable=rows=>table(['Rekenstap','Formule en ingevulde waarden','Uitkomst'],rows.map(row=>`<tr><th scope="row">${esc(row.label)}</th><td><small>${esc(row.formula)}</small><span class="report-expression">${esc(row.expression)}</span></td><td class="report-number">${sig(row.value)} ${esc(row.unit)}</td></tr>`),'Rekenstappen voorbeeldmoment');
    const m=data.moments.find(item=>item.kind===selectedMoment);
    if(!m)return '<p>Geen voorbeeldmomenten beschikbaar voor deze dag.</p>';
    const time=m.timestamp?new Date(m.timestamp*1000).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}):'';
    const title=selectedMoment==='start'?'Opstarten':m.title;
    if(!m.available)return `<article class="report-moment"><h4>${esc(title)}</h4><p>${esc(m.criterion)}</p><p>Kies een andere voorbeelddag om dit moment te bekijken.</p></article>`;
    const wind=m.wind.filter(row=>row.key.endsWith('-v10'));
    const supply=m.wind.find(row=>row.key==='supply');
    const pair=fn=>m.configurations.map((c,i)=>`<span class="report-${i?'comparison':'base'}"><span>${i?'Opsplitsing':'Basis'} · ${c.modules} module${c.modules===1?'':'s'}</span><strong>${fn(c)}</strong></span>`).join('');
    const chain=`<ol class="report-chain" aria-label="Van wind naar waterstof"><li><h5>Wind</h5>${wind.map(row=>`<span>${esc(row.label)}<strong>${fmt(row.value,1)} m/s</strong></span>`).join('')}</li><li><h5>Beschikbaar vermogen</h5><strong>${sig(supply?.value)} MW</strong><span>Voor beide opstellingen</span></li><li><h5>Draaiende modules</h5>${pair(c=>`${c.active} van ${c.modules}`)}</li><li><h5>Kilo’s waterstof</h5>${pair(c=>`${sig(c.traceKg)} kg`)}<span>In deze tien minuten</span></li></ol>`;
    const arithmetic=`${rowTable(m.wind)}${m.configurations.map((c,i)=>`<div class="report-moment-config report-${i?'comparison':'base'}"><h5>${i?'Opsplitsing':'Basis'} · ${c.modules} × ${fmt(c.size,2)} MW · ${c.active} modules actief</h5>${rowTable(c.rows)}<p class="note">${esc((c.reasons||[]).join('; '))} ${esc(c.check?.detail||'')}</p><details><summary>Per module narekenen</summary>${c.moduleRows.map(module=>`<h5>Module ${module.module}</h5>${rowTable(module.rows)}`).join('')}</details></div>`).join('')}`;
    return `<article class="report-moment"><h4>${esc(title)}${time?' · '+time:''}</h4><p>${esc(m.criterion)}</p>${chain}<details class="report-calculation"><summary>Bekijk de berekening van dit moment</summary>${arithmetic}<p class="note">${(data.notes||[]).map(esc).join(' ')}</p></details></article>`;
  }
  function renderMoments(){if(report?.moments)$('report-moments').innerHTML=momentsHtml(report.moments);}
  async function loadMoments(){
    const token=++revision, current=report, date=$('report-day').value;
    if(current.context.windMethod!==current.context.windProfile||current.context.modelVersion!==SUPPORTED_MODEL_VERSION){ $('report-day-status').textContent='Deze opgeslagen uitkomst gebruikt een oudere of andere modelbasis. Bereken het scenario opnieuw voor bijpassende voorbeeldmomenten.'; return; }
    if(!date||!current.context.years.includes(Number(date.slice(0,4)))){ $('report-day-status').textContent='Kies een geldige dag uit de gebruikte windjaren.';return; }
    loading=true;enableExports();$('report-load-day').disabled=true;$('report-day').disabled=true;$('report-day-status').textContent='De voorbeeldmomenten worden berekend…';$('report-moments').replaceChildren();delete current.moments;delete current.momentError;
    try{
      const response=await fetch('/api/opsplitsing/dag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({aannames:Object.fromEntries(current.assumptions.map(a=>[a.key,a.value])),strategie:current.context.strategy,windprofiel:current.context.windProfile,parken:current.context.parks,datum:date,modules:[...new Set([current.base.modules,current.comparison.modules])]})});
      const data=await response.json();if(!response.ok||data.error)throw Error(data.error||'Voorbeeldmomenten konden niet worden berekend.');
      if(token!==revision||report!==current)return;
      current.moments=root.OpsReportMoments.build(data,current.result.aannames,current.base.modules,current.comparison.modules);
      renderMoments();$('report-day-status').textContent=`Voorbeeldmomenten van ${date}.`;
    }catch(error){if(token===revision&&report===current){current.momentError=String(error.message);$('report-day-status').textContent=`${error.message} Het jaarrapport blijft beschikbaar; voorbeeldmomenten ontbreken.`;}}
    finally{if(token===revision&&report===current){loading=false;enableExports();$('report-load-day').disabled=false;$('report-day').disabled=false;}}
  }
  function open(){
    if(!snapshot)return;
    previousButton=document.activeElement;
    make(defaultComparison(snapshot.rijen));
    render();$('calculation-report').hidden=false;$('explain-calculation').setAttribute('aria-expanded','true');$('report-title').focus();$('calculation-report').scrollIntoView({block:'start',behavior:'instant'});loadMoments();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('explain-calculation').onclick=open;
    $('report-close').onclick=()=>{revision++;loading=false;$('calculation-report').hidden=true;$('explain-calculation').setAttribute('aria-expanded','false');previousButton?.focus();};
    $('report-count').onchange=()=>{revision++;loading=false;make(Number($('report-count').value));render();loadMoments();};
    $('report-print').onclick=()=>{document.body.classList.add('printing-report');window.print();};
    root.addEventListener('afterprint',()=>document.body.classList.remove('printing-report'));
    $('report-excel').onclick=()=>{try{download(root.OpsReportExcel.build(report),`rekenrapport-${report.context.years.join('-')}-${report.base.modules}-tegen-${report.comparison.modules}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}catch(error){$('report-day-status').textContent=error.message;}};
    $('report-json').onclick=()=>download(JSON.stringify(report,null,2),`rekenrapport-${report.context.years.join('-')}.json`,'application/json');
    // Include expanded source tables in the print document without changing the on-screen view afterwards.
    let opened=[];root.addEventListener('beforeprint',()=>{if(!$('calculation-report').hidden){document.body.classList.add('printing-report');opened=[...$('calculation-report').querySelectorAll('details:not([open])')];opened.forEach(d=>d.open=true);}});
    root.addEventListener('afterprint',()=>{opened.forEach(d=>d.open=false);opened=[];});
  });
  root.OpsReportUI={setResult,open,showSensitivity,getReport:()=>report};
})(globalThis);

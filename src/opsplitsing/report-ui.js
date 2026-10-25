/* Reproducible report UI: always reads the last calculated snapshot, never live form inputs. */
(function(root){
  'use strict';
  const SUPPORTED_MODEL_VERSION=13; // MODEL_VERSION of the bundled Python runtime.
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d=6)=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('nl-NL',{maximumFractionDigits:d}).format(n):'Niet beschikbaar';
  const cfg=r=>`${r.modules} × ${fmt(r.module_mw,3)} MW`;
  const dateText=s=>new Date(s).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'long',timeStyle:'short'});
  let snapshot=null, metadata=null, report=null, revision=0, loading=false, previousButton=null, selectedMoment='low';
  const table=(heads,rows,label)=>`<div class="report-scroll" tabindex="0" role="region" aria-label="${esc(label)}"><table><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const section=(n,title,body)=>`<section class="report-section"><h3><span>${n}</span>${esc(title)}</h3>${body}</section>`;
  const download=(content,name,type)=>{const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function defaultComparison(rows){
    const best=rows.reduce((a,b)=>(b.lcoh_eur_kg??Infinity)<(a.lcoh_eur_kg??Infinity)?b:a);
    return best.modules!==rows[0].modules?best.modules:rows[1]?.modules??rows[0].modules;
  }
  function conclusion(r){
    const b=r.economics.base,c=r.economics.comparison;
    const change=(delta,unit)=>typeof delta!=='number'||!Number.isFinite(delta)?'niet te bepalen':`${fmt(Math.abs(delta),2)} ${unit} ${delta>0?'meer':delta<0?'minder':'verschil'}`;
    const text=r.base.modules===r.comparison.modules
      ? 'Er is één opstelling gekozen. Kies meerdere aantallen modules om het effect van opsplitsen te vergelijken.'
      : `Met deze opsplitsing produceren we ${change((c.kg-b.kg)/1000,'ton waterstof per jaar')}. De jaarkosten veranderen met ${change(c.annual-b.annual,'euro per jaar')}. ${r.delta==null?'Een kostprijsvergelijking is niet mogelijk, omdat een opstelling geen waterstof produceert.':`Daardoor ${r.delta<0?'daalt':r.delta>0?'stijgt':'verandert'} de bruto kostprijs van ${fmt(b.lcoh,2)} naar ${fmt(c.lcoh,2)} €/kg${r.delta===0?' niet':''}.`}`;
    return `<h3>Wat levert opsplitsen op?</h3><p class="report-verdict">${esc(text)}</p><div class="report-summary">${[[r.base,b,'Basis','base'],[r.comparison,c,'Opsplitsing','comparison']].map(([row,e,title,key])=>`<div class="report-${key}"><span>${title} · ${esc(cfg(row))}</span><strong>${fmt(e.lcoh,2)} <small>€/kg bruto</small></strong><p>${fmt(e.kg/1000,1)} ton waterstof per jaar<br>${fmt(e.annual/1e6,2)} miljoen euro per jaar</p></div>`).join('')}</div><p class="note">Beide opstellingen gebruiken hetzelfde windaanbod en ${fmt(r.result.aannames.capaciteit_mw,2)} MW totaal systeemvermogen. De basis is de eerste gekozen opstelling. Deze conclusie geldt voor de gekozen windjaren en aannames.</p>`;
  }
  function calculationBlocks(r){
    const b=r.economics.base,c=r.economics.comparison;
    const calculations=keys=>table(['Rekenstap',`Basis · ${cfg(r.base)}`,`Opsplitsing · ${cfg(r.comparison)}`],r.calculations.filter(row=>keys.includes(row.key)).map(row=>`<tr><th scope="row">${esc(row.label)}<small>${esc(row.formula)}</small></th>${['base','comparison'].map(k=>`<td><span class="report-expression">${esc(row[k+'Expression'])}</span><strong>${fmt(row[k],10)} ${esc(row.unit)}</strong></td>`).join('')}</tr>`),'Ingevulde berekening');
    const pair=(fn)=>`<div class="report-block-pair"><p class="report-base"><span>Basis · ${esc(cfg(r.base))}</span><strong>${fn(b)}</strong></p><p class="report-comparison"><span>Opsplitsing · ${esc(cfg(r.comparison))}</span><strong>${fn(c)}</strong></p></div>`;
    const signed=(value,d=2)=>(value>0?'+':'')+fmt(value,d);
    const block=(title,explanation,body,details)=>`<article class="report-block"><h4>${title}</h4><p>${explanation}</p>${body}<details class="report-calculation"><summary>Bekijk de berekening<span class="sr-only">: ${title}</span></summary>${details}</details></article>`;
    const costs=table(['Kosten per jaar',`Basis · ${cfg(r.base)}`,`Opsplitsing · ${cfg(r.comparison)}`],[['Investering per jaar','financing'],['Onderhoud en vaste exploitatie','opex'],['Stackvervanging','stack'],['Stroom en warmhouden','power'],['Totaal','annual']].map(([label,key])=>`<tr><th scope="row">${label}</th><td>${fmt(b[key]/1e6,2)} miljoen euro</td><td>${fmt(c[key]/1e6,2)} miljoen euro</td></tr>`),'Opbouw jaarkosten');
    return `<div class="report-blocks">${block('Waterstof per jaar','We tellen de productie van alle beschikbare tienminutenstappen op en rekenen ieder windjaar om naar 8.760 uur.',pair(e=>`${fmt(e.kg/1000,1)} ton/jaar`)+`<p class="report-block-delta">Verschil: ${signed((c.kg-b.kg)/1000,1)} ton/jaar</p>`,`<p>${esc(r.context.annualisation)}</p>${calculations(['kg'])}`)}${block('Kosten per jaar','De jaarkosten bestaan uit investering per jaar, onderhoud en vaste exploitatie, stackvervanging en stroom.',costs+`<p class="report-block-delta">Verschil: ${signed((c.annual-b.annual)/1e6)} miljoen euro/jaar</p>`,calculations(['perKw','capex','subsidy','annuity','financing','opex','wearHours','stack','energy','powerPrice','power','annual']))}${block('Kosten per kilo','Jaarkosten ÷ kilo’s per jaar = €/kg bruto.',pair(e=>`${fmt(e.lcoh,2)} €/kg`)+`<p class="report-block-delta">Verschil: ${r.delta==null?'niet te bepalen':signed(r.delta)+' €/kg'}</p>`,calculations(['lcoh','revenue','net']))}</div>`;
  }
  function enableExports(){ $('report-print').disabled=loading; $('report-excel').disabled=loading; $('report-json').disabled=loading; }
  function setResult(result,meta){
    snapshot=JSON.parse(JSON.stringify(result));metadata=JSON.parse(JSON.stringify(meta));revision++;report=null;loading=false;
    const panel=$('calculation-report');if(panel)panel.hidden=true;
    $('explain-calculation')?.setAttribute('aria-expanded','false');
    const overview=$('result-conclusion');
    if(overview){const shown=root.OpsReportModel.makeReport(snapshot,metadata,defaultComparison(snapshot.rijen));overview.innerHTML=conclusion(shown)+calculationBlocks(shown);}
  }
  function make(count){
    report=root.OpsReportModel.makeReport(snapshot,metadata,count);
    report.generatedAt=new Date().toISOString();
    return report;
  }
  function render(){
    const r=report,b=r.economics.base,c=r.economics.comparison,ctx=r.context;
    $('report-title').textContent=`Rekenrapport · ${cfg(r.base)} tegenover ${cfg(r.comparison)}`;
    $('report-meta').textContent=`${ctx.technology} · ${ctx.strategy} · windjaren ${ctx.years.join(', ')} · model ${ctx.modelVersion}`;
    $('report-stamp').textContent=`Vastgelegd op ${dateText(r.generatedAt)} (Nederlandse tijd). Berekening: ${ctx.key}.`;
    const choose=$('report-count');choose.replaceChildren(...snapshot.rijen.map(row=>new Option(cfg(row),row.modules,false,row.modules===r.comparison.modules)));
    const signs=v=>(v>0?'+':'')+fmt(v);
    const summary=conclusion(r);
    const assumptions=table(['Gebruikte invoer','Waarde','Eenheid','Herkomst','Toelichting'],r.assumptions.map(a=>`<tr><th scope="row">${esc(a.label)}</th><td class="report-number">${fmt(a.value)}</td><td>${esc(a.unit)}</td><td><span class="report-source">${esc(a.source)}</span></td><td>${esc(a.explanation)}</td></tr>`),'Invoer en bronnen');
    const annual=`<p>${esc(ctx.annualisation)}</p>${table(['Windjaar','Geldige uren','Factor naar 8.760 uur','Aanbod na omrekening (MWh/jaar)'],ctx.coverage.map(v=>`<tr><th scope="row">${v.year}</th><td>${fmt(v.hours)}</td><td>8.760 / ${fmt(v.hours)} = ${fmt(v.scale,10)}</td><td>${fmt(v.supplyMwh)}</td></tr>`),'Datadekking per windjaar')}<p class="note">Windmethode: ${esc(ctx.windExplanation||ctx.windMethod)}. Jaarproductie en slijtage-uren komen uit de volledige simulatie; drie voorbeeldmomenten illustreren de werking.</p>`;
    const arithmetic=table(['Rekenstap en formule',`${cfg(r.base)} · basis`,`${cfg(r.comparison)} · vergelijking`],r.calculations.map(row=>`<tr><th scope="row">${esc(row.label)}<small>${esc(row.formula)}</small></th>${['base','comparison'].map(k=>`<td><span class="report-expression">${esc(row[k+'Expression'])}</span><strong>${fmt(row[k],row.key==='annuity'?10:6)} ${esc(row.unit)}</strong></td>`).join('')}</tr>`),'Rekenstappen jaarkosten en kostprijs');
    const differences=r.parts.length?`${table(['Onderdeel','Ingevulde berekening','Verschil (€/kg)'],r.parts.map(p=>`<tr><th scope="row">${esc(p.label)}<small>${esc(p.formula)}</small></th><td class="report-expression">${esc(p.expression)}</td><td class="report-number">${signs(p.value)}</td></tr>`),'Verklaring kostprijsverschil')}<p>Som van de vier onderdelen: <strong>${signs(r.parts.reduce((s,p)=>s+p.value,0))} €/kg</strong>. Negatief verlaagt de kostprijs; positief verhoogt de kostprijs.</p>`:'<p>Een verschil per kilo is alleen gedefinieerd als beide opstellingen waterstof produceren.</p>';
    const checks=`<p class="report-check-intro">${r.checks.filter(v=>v.ok).length} van ${r.checks.length} rekencontroles sluiten aan. De controles vergelijken opgeslagen uitkomsten met opnieuw berekende kosten op basis van dezelfde invoer.</p><ul class="report-checks">${r.checks.map(v=>`<li class="${v.ok?'report-pass':'report-fail'}"><strong>${v.ok?'✓ Sluit aan':'! Controleer'} · ${esc(v.label)}</strong><span>${esc(v.detail)}</span></li>`).join('')}</ul><p class="note">De controles gebruiken ongeronde waarden met een relatieve tolerantie van 0,000001 %. Getoonde getallen zijn afgerond; het Excel-bestand bevat de volledige precisie.</p>`;
    $('report-body').innerHTML=section(1,'Wat levert opsplitsen op?',summary)+section(2,'De berekening in drie stappen',calculationBlocks(r))+section('→','Invoer en bronnen',`<p>Deze waarden horen bij de berekende uitkomst. Een eigen waarde heeft nog geen bevestigde externe bron.</p><details class="report-inputs"><summary>Alle ${r.assumptions.length} gebruikte waarden tonen</summary>${assumptions}</details>`)+section(3,'Eén voorbeeldmoment van dichtbij',`<p>Kies één voorbeeldmoment: weinig wind, veel wind of opstarten. De jaaruitkomst gebruikt alle beschikbare tienminutenstappen; deze momenten leggen alleen de werking uit.</p><div class="report-day-controls"><label>Voorbeelddag <input type="date" id="report-day" value="${esc(snapshot.voorbeelddag||ctx.years[0]+'-01-01')}"></label><button type="button" class="secondary-button" id="report-load-day">Toon rekenmomenten</button></div><label class="report-moment-picker">Voorbeeldmoment <select id="report-moment-choice"><option value="low">Weinig wind</option><option value="high">Veel wind</option><option value="start">Opstarten</option></select></label><p id="report-day-status" role="status"></p><div id="report-moments" aria-live="polite"></div>`)+section(4,'Van tien minuten naar een jaar',annual)+section('→','Alle formules narekenen',`<details class="report-calculation"><summary>Narekenen</summary>${arithmetic}</details>`)+section(6,'Waar komt het verschil vandaan?',differences)+section(7,'Rekencontroles',checks)+section(8,'Wat deze uitkomst onderbouwt',`<p><strong>De kostenberekening is controleerbaar binnen de gebruikte invoer.</strong> Of de installatie dit in de praktijk haalt, hangt af van de juistheid van de brongegevens en aannames.</p><ul>${ctx.limitations.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p>Het Excel-bestand rekent de kosten met formules na. Verander je technische aannames of windjaren, voer dan op de pagina een nieuwe simulatie uit.</p>`);
    $('report-load-day').onclick=loadMoments;
    $('report-moment-choice').value=selectedMoment;
    $('report-moment-choice').onchange=()=>{selectedMoment=$('report-moment-choice').value;renderMoments();};
    enableExports();
  }
  function momentsHtml(data){
    const rowTable=rows=>table(['Rekenstap','Formule en ingevulde waarden','Uitkomst'],rows.map(row=>`<tr><th scope="row">${esc(row.label)}</th><td><small>${esc(row.formula)}</small><span class="report-expression">${esc(row.expression)}</span></td><td class="report-number">${fmt(row.value)} ${esc(row.unit)}</td></tr>`),'Rekenstappen voorbeeldmoment');
    const m=data.moments.find(item=>item.kind===selectedMoment);
    if(!m)return '<p>Geen voorbeeldmomenten beschikbaar voor deze dag.</p>';
    const time=m.timestamp?new Date(m.timestamp*1000).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}):'';
    const title=selectedMoment==='start'?'Opstarten':m.title;
    if(!m.available)return `<article class="report-moment"><h4>${esc(title)}</h4><p>${esc(m.criterion)}</p><p>Kies een andere voorbeelddag om dit moment te bekijken.</p></article>`;
    const wind=m.wind.filter(row=>row.key.endsWith('-v10'));
    const supply=m.wind.find(row=>row.key==='supply');
    const pair=fn=>m.configurations.map((c,i)=>`<span class="report-${i?'comparison':'base'}"><span>${i?'Opsplitsing':'Basis'} · ${c.modules} module${c.modules===1?'':'s'}</span><strong>${fn(c)}</strong></span>`).join('');
    const chain=`<ol class="report-chain" aria-label="Van wind naar waterstof"><li><h5>Wind</h5>${wind.map(row=>`<span>${esc(row.label)}<strong>${fmt(row.value,1)} m/s</strong></span>`).join('')}</li><li><h5>Beschikbaar vermogen</h5><strong>${fmt(supply?.value,2)} MW</strong><span>Voor beide opstellingen</span></li><li><h5>Draaiende modules</h5>${pair(c=>`${c.active} van ${c.modules}`)}</li><li><h5>Kilo’s waterstof</h5>${pair(c=>`${fmt(c.traceKg,2)} kg`)}<span>In deze tien minuten</span></li></ol>`;
    const arithmetic=`${rowTable(m.wind)}${m.configurations.map((c,i)=>`<div class="report-moment-config report-${i?'comparison':'base'}"><h5>${i?'Opsplitsing':'Basis'} · ${c.modules} × ${fmt(c.size,2)} MW · ${c.active} modules actief</h5>${rowTable(c.rows)}<p class="note">${esc((c.reasons||[]).join('; '))} ${esc(c.check?.detail||'')}</p><details><summary>Per module narekenen</summary>${c.moduleRows.map(module=>`<h5>Module ${module.module}</h5>${rowTable(module.rows)}`).join('')}</details></div>`).join('')}`;
    return `<article class="report-moment"><h4>${esc(title)}${time?' · '+time:''}</h4><p>${esc(m.criterion)}</p>${chain}<details class="report-calculation"><summary>Bekijk de berekening van dit moment</summary>${arithmetic}<p class="note">${(data.notes||[]).map(esc).join(' ')}</p></details></article>`;
  }
  function renderMoments(){if(report?.moments)$('report-moments').innerHTML=momentsHtml(report.moments);}
  async function loadMoments(){
    const token=++revision, current=report, date=$('report-day').value;
    if(current.context.windMethod!=='onafhankelijk'||current.context.modelVersion!==SUPPORTED_MODEL_VERSION){ $('report-day-status').textContent='Deze opgeslagen uitkomst gebruikt een oudere of andere modelbasis. Bereken het scenario opnieuw voor bijpassende voorbeeldmomenten.'; return; }
    if(!date||!current.context.years.includes(Number(date.slice(0,4)))){ $('report-day-status').textContent='Kies een geldige dag uit de gebruikte windjaren.';return; }
    loading=true;enableExports();$('report-load-day').disabled=true;$('report-day').disabled=true;$('report-day-status').textContent='De voorbeeldmomenten worden berekend…';$('report-moments').replaceChildren();delete current.moments;delete current.momentError;
    try{
      const response=await fetch('/api/opsplitsing/dag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({aannames:Object.fromEntries(current.assumptions.map(a=>[a.key,a.value])),strategie:current.context.strategy,datum:date,modules:[...new Set([current.base.modules,current.comparison.modules])]})});
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
  root.OpsReportUI={setResult,open,getReport:()=>report};
})(globalThis);

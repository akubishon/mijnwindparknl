/* Reproducible report UI: always reads the last calculated snapshot, never live form inputs. */
(function(root){
  'use strict';
  const SUPPORTED_MODEL_VERSION=12; // MODEL_VERSION of the bundled Python runtime.
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d=6)=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('nl-NL',{maximumFractionDigits:d}).format(n):'Niet beschikbaar';
  const cfg=r=>`${r.modules} × ${fmt(r.module_mw,3)} MW`;
  const dateText=s=>new Date(s).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'long',timeStyle:'short'});
  let snapshot=null, metadata=null, report=null, revision=0, loading=false, previousButton=null;
  const table=(heads,rows,label)=>`<div class="report-scroll" tabindex="0" role="region" aria-label="${esc(label)}"><table><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const section=(n,title,body)=>`<section class="report-section"><h3><span>${n}</span>${esc(title)}</h3>${body}</section>`;
  const download=(content,name,type)=>{const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function enableExports(){ $('report-print').disabled=loading; $('report-excel').disabled=loading; $('report-json').disabled=loading; }
  function setResult(result,meta){
    snapshot=JSON.parse(JSON.stringify(result));metadata=JSON.parse(JSON.stringify(meta));revision++;report=null;loading=false;
    const panel=$('calculation-report');if(panel)panel.hidden=true;
    $('explain-calculation')?.setAttribute('aria-expanded','false');
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
    const summary=`<p>Beide opstellingen gebruiken <strong>${fmt(snapshot.aannames.capaciteit_mw,3)} MW totaal stackvermogen</strong> en hetzelfde gemodelleerde windaanbod. De eerste gekozen configuratie is de basis.</p><div class="report-summary">${[[r.base,b,'Basis'],[r.comparison,c,'Vergelijking']].map(([row,e,title])=>`<div><span>${title} · ${esc(cfg(row))}</span><strong>${fmt(e.lcoh,4)} <small>€/kg bruto</small></strong><p>${fmt(e.kg,1)} kg/jaar<br>${fmt(e.annual,2)} €/jaar</p></div>`).join('')}</div><p class="report-verdict">Verschil: <strong>${signs(r.delta)} €/kg</strong> (${r.delta==null?'geen kostprijs bij ontbrekende productie':r.delta<0?'lagere':r.delta>0?'hogere':'gelijke'} bruto kostprijs voor de vergelijking).</p>`;
    const assumptions=table(['Gebruikte invoer','Waarde','Eenheid','Herkomst','Toelichting'],r.assumptions.map(a=>`<tr><th scope="row">${esc(a.label)}</th><td class="report-number">${fmt(a.value)}</td><td>${esc(a.unit)}</td><td><span class="report-source">${esc(a.source)}</span></td><td>${esc(a.explanation)}</td></tr>`),'Invoer en bronnen');
    const annual=`<p>${esc(ctx.annualisation)}</p>${table(['Windjaar','Geldige uren','Factor naar 8.760 uur','Aanbod na omrekening (MWh/jaar)'],ctx.coverage.map(v=>`<tr><th scope="row">${v.year}</th><td>${fmt(v.hours)}</td><td>8.760 / ${fmt(v.hours)} = ${fmt(v.scale,10)}</td><td>${fmt(v.supplyMwh)}</td></tr>`),'Datadekking per windjaar')}<p class="note">Windmethode: ${esc(ctx.windExplanation||ctx.windMethod)}. Jaarproductie en slijtage-uren komen uit de volledige simulatie; drie voorbeeldmomenten illustreren de werking.</p>`;
    const arithmetic=table(['Rekenstap en formule',`${cfg(r.base)} · basis`,`${cfg(r.comparison)} · vergelijking`],r.calculations.map(row=>`<tr><th scope="row">${esc(row.label)}<small>${esc(row.formula)}</small></th>${['base','comparison'].map(k=>`<td><span class="report-expression">${esc(row[k+'Expression'])}</span><strong>${fmt(row[k],row.key==='annuity'?10:6)} ${esc(row.unit)}</strong></td>`).join('')}</tr>`),'Rekenstappen jaarkosten en kostprijs');
    const differences=r.parts.length?`${table(['Onderdeel','Ingevulde berekening','Verschil (€/kg)'],r.parts.map(p=>`<tr><th scope="row">${esc(p.label)}<small>${esc(p.formula)}</small></th><td class="report-expression">${esc(p.expression)}</td><td class="report-number">${signs(p.value)}</td></tr>`),'Verklaring kostprijsverschil')}<p>Som van de vier onderdelen: <strong>${signs(r.parts.reduce((s,p)=>s+p.value,0))} €/kg</strong>. Negatief verlaagt de kostprijs; positief verhoogt de kostprijs.</p>`:'<p>Een verschil per kilo is alleen gedefinieerd als beide opstellingen waterstof produceren.</p>';
    const checks=`<p class="report-check-intro">${r.checks.filter(v=>v.ok).length} van ${r.checks.length} rekencontroles sluiten aan. De controles vergelijken opgeslagen uitkomsten met opnieuw berekende kosten op basis van dezelfde invoer.</p><ul class="report-checks">${r.checks.map(v=>`<li class="${v.ok?'report-pass':'report-fail'}"><strong>${v.ok?'✓ Sluit aan':'! Controleer'} · ${esc(v.label)}</strong><span>${esc(v.detail)}</span></li>`).join('')}</ul><p class="note">De controles gebruiken ongeronde waarden met een relatieve tolerantie van 0,000001 %. Getoonde getallen zijn afgerond; het Excel-bestand bevat de volledige precisie.</p>`;
    $('report-body').innerHTML=section(1,'Wat vergelijken we?',summary)+section(2,'Invoer en bronnen',`<p>Deze waarden horen bij de berekende uitkomst. Een eigen waarde heeft nog geen bevestigde externe bron.</p><details class="report-inputs"><summary>Alle ${r.assumptions.length} gebruikte waarden tonen</summary>${assumptions}</details>`)+section(3,'Drie momenten van dichtbij',`<p>Bekijk weinig wind, veel wind en een start of schakelmoment binnen één gekozen dag. De formules tonen ook hulpverbruik (BoP) en tijdverlies bij opstarten.</p><div class="report-day-controls"><label>Voorbeelddag <input type="date" id="report-day" value="${esc(snapshot.voorbeelddag||ctx.years[0]+'-01-01')}"></label><button type="button" class="secondary-button" id="report-load-day">Toon rekenmomenten</button></div><p id="report-day-status" role="status"></p><div id="report-moments"></div>`)+section(4,'Van tien minuten naar een jaar',annual)+section(5,'Jaarkosten en kosten per kilo',arithmetic)+section(6,'Waar komt het verschil vandaan?',differences)+section(7,'Rekencontroles',checks)+section(8,'Wat deze uitkomst onderbouwt',`<p><strong>De kostenberekening is controleerbaar binnen de gebruikte invoer.</strong> Of de installatie dit in de praktijk haalt, hangt af van de juistheid van de brongegevens en aannames.</p><ul>${ctx.limitations.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p>Het Excel-bestand rekent de kosten met formules na. Verander je technische aannames of windjaren, voer dan op de pagina een nieuwe simulatie uit.</p>`);
    $('report-load-day').onclick=loadMoments;
    enableExports();
  }
  function momentsHtml(data){
    const rowTable=rows=>table(['Rekenstap','Formule en ingevulde waarden','Uitkomst'],rows.map(row=>`<tr><th scope="row">${esc(row.label)}</th><td><small>${esc(row.formula)}</small><span class="report-expression">${esc(row.expression)}</span></td><td class="report-number">${fmt(row.value)} ${esc(row.unit)}</td></tr>`),'Rekenstappen voorbeeldmoment');
    return `<p class="note">${(data.notes||[]).map(esc).join(' ')}</p>`+data.moments.map(m=>`<article class="report-moment"><h4>${esc(m.title)}${m.timestamp?` · ${new Date(m.timestamp*1000).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'})}`:''}</h4><p>${esc(m.criterion)}</p>${m.available?`${rowTable(m.wind)}${m.configurations.map(c=>`<h5>${c.modules} × ${fmt(c.size)} MW · ${c.active} modules actief</h5>${rowTable(c.rows)}<p class="note">${esc((c.reasons||[]).join('; '))} ${esc(c.check?.detail||'')}</p><details><summary>Per module narekenen</summary>${c.moduleRows.map(module=>`<h5>Module ${module.module}</h5>${rowTable(module.rows)}`).join('')}</details>`).join('')}`:''}</article>`).join('');
  }
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
      $('report-moments').innerHTML=momentsHtml(current.moments);$('report-day-status').textContent=`Voorbeeldmomenten van ${date}.`;
    }catch(error){if(token===revision&&report===current){current.momentError=String(error.message);$('report-day-status').textContent=`${error.message} Het jaarrapport blijft beschikbaar; voorbeeldmomenten ontbreken.`;}}
    finally{if(token===revision&&report===current){loading=false;enableExports();$('report-load-day').disabled=false;$('report-day').disabled=false;}}
  }
  function open(){
    if(!snapshot)return;
    previousButton=document.activeElement;
    const rows=snapshot.rijen, best=rows.reduce((a,b)=>(b.lcoh_eur_kg??Infinity)<(a.lcoh_eur_kg??Infinity)?b:a);
    make(best.modules!==rows[0].modules?best.modules:rows[1]?.modules??rows[0].modules);
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

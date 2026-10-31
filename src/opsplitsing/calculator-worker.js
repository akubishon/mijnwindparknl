// The upstream Python model runs unchanged in a dedicated worker.
importScripts('https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js');
let python;
// Voortgang van het lopende verzoek: {id, voortgang: {fase, ...}}. Alleen een bericht met result of error rondt het verzoek af.
let current=null;
const progress=(fase,details)=>self.postMessage({id:current,voortgang:{fase,...details}});
async function initialize(){
 progress('rekenomgeving');
 const p=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/'});
 progress('model');
 const response=await fetch('/opsplitsing-assets/bundle.json');
 if(!response.ok)throw Error('Het rekenmodel kon niet worden geladen.');
 const files=await response.json();
 progress('starten');
 for(const [name,base64] of Object.entries(files)){
  const path='/app/'+name;p.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));
  p.FS.writeFile(path,Uint8Array.from(atob(base64),c=>c.charCodeAt(0)));
 }
 p.runPython("import sys, zoneinfo\nsys.path.insert(0, '/app')\nzoneinfo.reset_tzpath(['/app/zoneinfo'])\nexec(open('/app/browser-runtime.py').read())");
 // Python meldt de simulaties via progress_sink (browser-runtime.py); postMessage verstuurt ze terwijl runPython nog rekent.
 p.globals.set('progress_sink',text=>self.postMessage({id:current,voortgang:JSON.parse(text)}));
 return p;
}
self.onmessage=async({data:{id,path,body}})=>{
 current=id;
 try{
  const p=await(python||=(initialize().catch(e=>{python=null;throw e;})));
  const years=body?.jaren|| (body?.datum?[Number(body.datum.slice(0,4))]:[]);
  for(const year of years){
   if(p.FS.analyzePath('/app/data/'+year+'.json').exists)continue;
   progress('windjaar',{jaar:year});
   const r=await fetch('/opsplitsing-assets/data/'+year+'.json');
   if(!r.ok)throw Error('Windjaar '+year+' kon niet worden geladen.');
   p.FS.mkdirTree('/app/data');p.FS.writeFile('/app/data/'+year+'.json',await r.text());
  }
  progress('rekenen');
  p.globals.set('request_path',path);p.globals.set('request_body',JSON.stringify(body||{}));
  const result=p.runPython("json.dumps(dispatch(request_path, json.loads(request_body)), allow_nan=False)");
  self.postMessage({id,result:JSON.parse(result)});
 }catch(e){self.postMessage({id,error:'De berekening is mislukt: '+e.message});}
};

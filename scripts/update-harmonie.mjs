// Read service access through stdin only; never store credentials in the checkout.
import {createHash} from 'node:crypto';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {url,serviceToken}=JSON.parse(input);
const origin=new URL(url);if(origin.protocol!=='https:'||origin.hostname!=='mijnwindpark.nl')throw Error('Unexpected Site origin');
const writer=createHash('sha256').update('harmonie-writer-v1:'+serviceToken).digest('hex');
let failed=false;
for(const model of ['p1','p2b']){
 try{
  const response=await fetch(new URL('/api/internal/harmonie/update?model='+model,origin),{method:'POST',headers:{'OAI-Sites-Authorization':'Bearer '+serviceToken,Authorization:'Bearer '+writer},signal:AbortSignal.timeout(120000),redirect:'error'});
  const data=await response.json();console.log(JSON.stringify({model,status:response.status,...data}));if(!response.ok)failed=true;
 }catch(error){console.log(JSON.stringify({model,error:error.name}));failed=true;}
}
if(failed)process.exitCode=1;

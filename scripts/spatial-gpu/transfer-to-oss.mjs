// Run with node --env-file=server/.env scripts/spatial-gpu/transfer-to-oss.mjs.
// Default copies/verifies only. --switch requires the deployed public endpoint.
// --remove-source verifies every destination again before removing duplicates.
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSpatialOssClient, spatialDepthKey, uploadSpatialDepth } from '../../server/spatialDepthStorage.js';

const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const oss=createSpatialOssClient();
const bucket=db.storage.from('spatial-depth');
const switching=process.argv.includes('--switch');
const removing=process.argv.includes('--remove-source');
const directory=new URL('../../.artifacts/spatial-oss-transfer/',import.meta.url);
await mkdir(directory,{recursive:true});
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const {data:rows,error}=await db.from('photo_spatial').select('*').eq('status','ready');
if(error) throw new Error(error.message);
const manifest=[];
let total=0, changed=0, removed=0;
if(switching || removing) {
  const probe=await fetch('https://pic4pick-backend.onrender.com/api/photos/invalid/spatial-depth',{signal:AbortSignal.timeout(60000)});
  if(probe.status!==400) throw new Error('Deploy the private depth signing endpoint before switching storage');
}
for(const row of rows) {
  const key=spatialDepthKey(row.photo_id,row.generation,row.depth_path);
  const {data:source,error:sourceError}=await bucket.download(row.depth_path);
  if(sourceError && row.storage_backend!=='oss') throw new Error('Source depth read failed');
  let bytes;
  if(source) {
    bytes=Buffer.from(await source.arrayBuffer());
    await writeFile(new URL(`${row.photo_id}-${row.generation}.png`,directory),bytes);
    if(row.storage_backend!=='oss' && !switching) await uploadSpatialDepth(oss,row.photo_id,row.generation,bytes);
  } else bytes=(await oss.get(key)).content;
  const destination=(await oss.get(key)).content;
  if(hash(bytes)!==hash(destination) || bytes.readUInt32BE(16)!==row.width || bytes.readUInt32BE(20)!==row.height) throw new Error('Depth integrity verification failed');
  if((await oss.getACL(key)).acl!=='private') throw new Error('Depth ACL is not private');
  // An unsigned GET must fail even though this bucket also holds public photos.
  const publicUrl=oss.generateObjectUrl(key).replace(/^http:/,'https:');
  const anonymous=await fetch(publicUrl,{method:'HEAD',signal:AbortSignal.timeout(15000)});
  if(anonymous.status!==403) throw new Error(`Unexpected anonymous access (${anonymous.status})`);
  if(switching && row.storage_backend!=='oss') {
    const result=await db.from('photo_spatial').update({storage_backend:'oss'}).eq('photo_id',row.photo_id)
      .eq('generation',row.generation).eq('status','ready').eq('storage_backend','supabase').select('photo_id');
    if(result.error || result.data.length!==1) throw new Error('Generation changed during migration');
    changed++;
  }
  if(switching || removing) {
    const response=await fetch(`https://pic4pick-backend.onrender.com/api/photos/${row.photo_id}/spatial-depth`,{signal:AbortSignal.timeout(60000)});
    if(!response.ok) throw new Error(`Deployed signing endpoint failed (${response.status}); source retained`);
    const signed=await response.json();
    if(signed.generation!==row.generation || signed.expiresIn!==300) throw new Error('Invalid signing response');
    const result=await fetch(signed.signedUrl,{headers:{Origin:'https://pic.rlzhao.com'},signal:AbortSignal.timeout(20000)});
    if(!result.ok || result.headers.get('access-control-allow-origin')!=='https://pic.rlzhao.com'
      || hash(Buffer.from(await result.arrayBuffer()))!==hash(bytes)) throw new Error('Live signed depth verification failed; source retained');
  }
  manifest.push({photoId:row.photo_id,generation:row.generation,key,bytes:bytes.length,sha256:hash(bytes),acl:'private'});
  total+=bytes.length;
  await writeFile(new URL('manifest.json',directory),JSON.stringify({verifiedAt:new Date().toISOString(),files:manifest},null,2));
  console.log(JSON.stringify({verified:manifest.length,total:rows.length,changed,bytes:total}));
}
// No source deletions until the whole batch has passed live verification.
if(removing) {
  const {data:current,error:currentError}=await db.from('photo_spatial').select('photo_id,generation,depth_path,storage_backend').eq('status','ready');
  if(currentError) throw new Error(currentError.message);
  for(const item of manifest) {
    const row=current.find(r=>r.photo_id===item.photoId && r.generation===item.generation && r.storage_backend==='oss');
    if(!row) continue;
    const result=await bucket.remove([row.depth_path]);
    if(result.error) throw new Error('Source duplicate removal failed');
    removed++;
  }
}
console.log(JSON.stringify({complete:true,files:manifest.length,bytes:total,changed,removed}));

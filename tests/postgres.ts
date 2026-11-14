// 僅供測試的真實 PostgreSQL。Windows 原生工具無法可靠處理中文 binary 路徑，
// 因此複製 native 發行檔至系統暫存目錄；不影響正式 Netlify Database。
import { mkdtemp,cp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,basename,resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
function run(binary:string,args:string[],cwd:string) {
 return new Promise<void>((res,rej)=>{const p=spawn(binary,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,LC_ALL:'C',LANG:'C'}});let output='';p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);p.on('error',rej);p.on('exit',code=>code===0?res():rej(new Error('測試 PostgreSQL 程序失敗：'+output)));});
}
export async function startPostgres() {
 const packageName=`@embedded-postgres/${process.platform==='win32'?'windows':process.platform}-${process.arch}`;
 const binaries=await import(packageName) as {initdb:string;postgres:string;pg_ctl:string};
 const base=await mkdtemp(join(tmpdir(),'peipei-pg-test-'));
 const native=join(base,'native');await cp(dirname(dirname(binaries.postgres)),native,{recursive:true});
 const executable=(path:string)=>join(native,'bin',basename(path));
 const data=join(base,'data'),pwfile=join(base,'password');const password=randomUUID();await writeFile(pwfile,password,{mode:0o600});
 const port=await new Promise<number>((res,rej)=>{const s=createServer();s.on('error',rej);s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>res(p));});});
 const cleanup=async()=>{
  const target=resolve(base),parent=resolve(tmpdir());
  if(dirname(target)!==parent||!basename(target).startsWith('peipei-pg-test-'))throw new Error('測試目錄不安全');
  await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 };
 try {
  await run(executable(binaries.initdb),['-D',data,'-U','postgres','--pwfile='+pwfile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C'],base);
  await rm(pwfile);
  await run(executable(binaries.pg_ctl),['-D',data,'-l',join(base,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],base);
  return {config:{host:'127.0.0.1',port,user:'postgres',password,database:'postgres',max:6},stop:async()=>{await run(executable(binaries.pg_ctl),['-D',data,'-m','fast','-w','stop'],base);await cleanup();}};
 }catch(e){await cleanup();throw e;}
}

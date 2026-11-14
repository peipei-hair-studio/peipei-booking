import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import argon2 from 'argon2';
import { z } from 'zod';
import { database, transaction } from '../server/db';
import {passwordSchema} from '../src/site';

// 由登入的 Netlify CLI 取得目前連線，只保留在記憶體，不印出秘密。
if(!process.env.NETLIFY_DB_URL) {
 const r=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['netlify','database','connect','--json'],{encoding:'utf8',shell:process.platform==='win32'});
 if(r.status!==0) {console.error('無法取得資料庫連線。請先啟動 netlify dev，或登入並連結正確 Netlify 站點。');process.exit(1);}
 try {const data=JSON.parse(r.stdout);process.env.NETLIFY_DB_URL=data.connection_string||data.connectionString||data.url;if(!process.env.NETLIFY_DB_URL) throw new Error();} catch {console.error('CLI 回傳格式不同，請依 README 使用伺服器端 NETLIFY_DB_URL。');process.exit(1);}
}
async function hidden(prompt:string):Promise<string> {
 if(!process.stdin.isTTY) throw new Error('必須在互動終端執行；不接受管線或命令列密碼');
 process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
 return new Promise((resolve,reject)=>{let value='';const onData=(chunk:string)=>{for(const ch of chunk){if(ch==='\u0003'){cleanup();reject(new Error('已取消'));return;}if(ch==='\r'||ch==='\n'){cleanup();resolve(value);return;}if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);else if(ch>=' ')value+=ch;}};
 const cleanup=()=>{process.stdin.removeListener('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};process.stdin.on('data',onData);});
}
try {
 const rl=createInterface({input:process.stdin,output:process.stdout});
 const username=z.string().trim().min(3).max(80).parse(await rl.question('管理員帳號（3–80 字元）：'));rl.close();
 const password=await hidden('管理員密碼（至少 12 字元，不顯示）：');
 passwordSchema.parse(password);
 if(password!==await hidden('再次輸入密碼：')) throw new Error('兩次密碼不一致');
 const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 await transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(12844321)");
  if(Number((await c.query('SELECT count(*) count FROM admins')).rows[0].count)>0) throw new Error('已存在管理員，此一次性工具不允許再建立');
  const admin=(await c.query('INSERT INTO admins(username,password_hash) VALUES($1,$2) RETURNING id',[username,hash])).rows[0];
  await c.query("INSERT INTO audit_logs(admin_id,action,entity_id) VALUES($1::uuid,'admin.initialize',$1::text)",[admin.id]);
 });console.log('管理員已建立。');
}catch(e){ console.error(e instanceof z.ZodError?e.issues.map(i=>i.message).join('；'):e instanceof Error?e.message:'初始化失敗');process.exitCode=1; }
finally {await database().pool.end();}

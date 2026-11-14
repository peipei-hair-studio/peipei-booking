import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { transaction } from './db';
import { AppError } from './domain';
import { audit } from './repository';
export const hashToken=(v:string)=>createHash('sha256').update(v).digest('hex');
export const cookieName='peipei_session';
export function sameOrigin(req:Request) {
 const configured=process.env.APP_ORIGIN;
 const local=new URL(req.url).hostname;
 const expected=configured || (['localhost','127.0.0.1'].includes(local)?new URL(req.url).origin:undefined);
 if(!expected || req.headers.get('origin')!==expected) throw new AppError(403,'請由本站操作');
 if(req.headers.get('sec-fetch-site')==='cross-site') throw new AppError(403,'不允許跨站操作');
}
function token(req:Request) {return req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
export async function requireAdmin(req:Request,mutation=false) {
 const t=token(req); if(!t || !/^[a-f0-9]{64}$/.test(t)) throw new AppError(401,'請先登入');
 const session=await transaction(async c=>(await c.query('SELECT admin_id,csrf_token FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()',[hashToken(t)])).rows[0]);
 if(!session) throw new AppError(401,'工作階段已過期，請重新登入');
 if(mutation) {
  sameOrigin(req); const csrf=req.headers.get('x-csrf-token')||'';
  if(Buffer.byteLength(csrf)!==Buffer.byteLength(session.csrf_token) || !timingSafeEqual(Buffer.from(csrf),Buffer.from(session.csrf_token))) throw new AppError(403,'驗證碼已失效，請重新載入');
 }
 return session as {admin_id:string;csrf_token:string};
}
export function sessionCookie(value:string,expires=false,req?:Request) {
 const local=req && ['localhost','127.0.0.1'].includes(new URL(req.url).hostname);
 return `${cookieName}=${value}; HttpOnly; ${local?'':'Secure; '}SameSite=Strict; Path=/; Max-Age=${expires?0:28800}`;
}
export async function rateLimit(key:string,limit:number,seconds:number) {
 const secret=process.env.RATE_LIMIT_SECRET;
 if(!secret || secret.length<32) throw new AppError(503,'伺服器安全設定尚未完成');
 const hash=createHmac('sha256',secret).update(key).digest('hex');
 await transaction(async c=>{
  const r=(await c.query(`INSERT INTO login_attempts(key_hash) VALUES($1) ON CONFLICT(key_hash) DO UPDATE SET
   attempts=CASE WHEN login_attempts.window_start<now()-$2*interval '1 second' THEN 1 ELSE login_attempts.attempts+1 END,
   window_start=CASE WHEN login_attempts.window_start<now()-$2*interval '1 second' THEN now() ELSE login_attempts.window_start END RETURNING attempts`,[hash,seconds])).rows[0];
  // 超限也必須 commit；在 transaction 外拋出錯誤。
  return r.attempts;
 }).then(n=>{if(n>limit) throw new AppError(429,'操作太頻繁，請稍後再試');});
}
let dummyHash:Promise<string>|undefined;
export async function login(req:Request,body:unknown,ip:string) {
 sameOrigin(req);
 const data=z.object({username:z.string().trim().min(3).max(80),password:z.string().min(1).max(256)}).strict().parse(body);
 await rateLimit('ip:'+ip,20,900); await rateLimit('user:'+data.username.toLowerCase(),8,900);
 const admin=await transaction(async c=>(await c.query('SELECT id,password_hash FROM admins WHERE username=$1',[data.username])).rows[0]);
 dummyHash??=argon2.hash(randomBytes(32),{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 const valid=await argon2.verify(admin?.password_hash || await dummyHash,data.password);
 if(!admin || !valid) throw new AppError(401,'帳號或密碼錯誤');
 const t=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
 await transaction(async c=>{
  await c.query('DELETE FROM admin_sessions WHERE expires_at<now()');
  await c.query("DELETE FROM login_attempts WHERE window_start<now()-interval '1 day'");
  await c.query("INSERT INTO admin_sessions(admin_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[admin.id,hashToken(t),csrf]);
  await audit(c,admin.id,'admin.login',admin.id);
 });
 return {token:t,csrfToken:csrf};
}
export async function logout(req:Request,admin:string) {
 await transaction(async c=>{await c.query('DELETE FROM admin_sessions WHERE token_hash=$1',[hashToken(token(req)||'')]);await audit(c,admin,'admin.logout',admin);});
}

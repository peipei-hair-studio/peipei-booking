import { beforeAll,afterAll,beforeEach,it,expect,vi } from 'vitest';
import { startPostgres } from './postgres';
import { readFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
const state=vi.hoisted(()=>({pool:null as unknown as Pool}));
vi.mock('@netlify/database',()=>({getDatabase:()=>({pool:state.pool})}));
import { createBooking,updateBooking } from '../server/repository';
import { hashToken } from '../server/auth';
import handler from '../netlify/functions/api';
import type { Context } from '@netlify/functions';
import {defaultSite} from '../src/site';
let db:Awaited<ReturnType<typeof startPostgres>>,service1:string,service2:string,admin:string,session:string,csrf:string;
const future=()=>{let d=new Date(Date.now()+86400000*3+28800000);while(d.getUTCDay()===3)d=new Date(+d+86400000);return d.toISOString().slice(0,10);};
const input=(time='11:00',ids=[service1])=>({serviceIds:ids,date:future(),time,customerName:'測試顧客',phone:'0912345678',notes:'',requestKey:randomUUID()});
const context={ip:'127.0.0.1'} as Context;
async function call(path:string,method='GET',body?:unknown,auth=false,token=csrf) {
 return handler(new Request('https://test.example/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://test.example',...(auth?{cookie:'peipei_session='+session,'x-csrf-token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)}),context);
}
beforeAll(async()=>{
 db=await startPostgres();state.pool=new Pool(db.config);
 for(const file of (await readdir('./netlify/database/migrations')).filter(f=>f.endsWith('.sql')).sort()) await state.pool.query(await readFile(join('./netlify/database/migrations',file),'utf8'));
 process.env.APP_ORIGIN='https://test.example';process.env.RATE_LIMIT_SECRET='test-only-random-secret-32-characters-long';
 const hash=await argon2.hash('only-for-tests-a-long-password',{type:argon2.argon2id});
 admin=(await state.pool.query('INSERT INTO admins(username,password_hash) VALUES($1,$2) RETURNING id',['test-admin',hash])).rows[0].id;
 const category=(await state.pool.query('SELECT id FROM service_categories LIMIT 1')).rows[0].id;
 service1=(await state.pool.query("INSERT INTO services(category_id,name,price,minutes,active) VALUES($1,'測試剪髮',500,45,true) RETURNING id",[category])).rows[0].id;
 service2=(await state.pool.query("INSERT INTO services(category_id,name,price,minutes,active) VALUES($1,'測試護髮',800,90,true) RETURNING id",[category])).rows[0].id;
 session='a'.repeat(64);csrf='b'.repeat(64);
 await state.pool.query("INSERT INTO admin_sessions(admin_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[admin,hashToken(session),csrf]);
});
beforeEach(async()=>{await state.pool.query('DELETE FROM booking_items');await state.pool.query('DELETE FROM bookings');await state.pool.query('DELETE FROM promotion_services');await state.pool.query('DELETE FROM promotions');await state.pool.query('UPDATE business_settings SET capacity=1');await state.pool.query('UPDATE services SET price=500 WHERE id=$1',[service1]);});
afterAll(async()=>{await state.pool?.end();await db?.stop();});
it('同時提交相同時段，只有一筆能寫入',async()=>{
 const result=await Promise.allSettled([createBooking(input()),createBooking(input())]);
 expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(Number((await state.pool.query('SELECT count(*) n FROM bookings')).rows[0].n)).toBe(1);
});
it('多服務合計 135 分鐘阻擋非等長重疊',async()=>{await createBooking(input('11:00',[service1,service2]));await expect(createBooking(input('13:00'))).rejects.toThrow('已被預約');await expect(createBooking(input('13:30'))).resolves.toHaveProperty('reference');});
it('重複 request key 回傳同一結果且只有一筆快照',async()=>{
 const body=input();const results=await Promise.all([createBooking(body),createBooking(body)]);
 expect(results[0].reference).toBe(results[1].reference);
 expect(Number((await state.pool.query('SELECT count(*) n FROM booking_items')).rows[0].n)).toBe(1);
 await expect(createBooking({...body,customerName:'其他人'})).rejects.toThrow('不同內容');
});
it('取消釋放時段並保存操作紀錄',async()=>{await createBooking(input());const id=(await state.pool.query('SELECT id FROM bookings')).rows[0].id;await updateBooking(id,{status:'cancelled'},admin);await expect(createBooking(input())).resolves.toHaveProperty('reference');expect((await state.pool.query("SELECT id FROM audit_logs WHERE action='booking.update'")).rowCount).toBeGreaterThan(0);});
it('修改服務價格不影響歷史快照',async()=>{await createBooking(input());await state.pool.query('UPDATE services SET price=999 WHERE id=$1',[service1]);const item=(await state.pool.query('SELECT price FROM booking_items')).rows[0];expect(item.price).toBe(500);expect((await state.pool.query('SELECT total_price FROM bookings')).rows[0].total_price).toBe(500);});
it('改期必須再次檢查撞期',async()=>{await createBooking(input());await createBooking(input('13:00'));const b=(await state.pool.query('SELECT id FROM bookings ORDER BY starts_at')).rows[1];await expect(updateBooking(b.id,{date:future(),time:'11:30'},admin)).rejects.toThrow('已被預約');});
it('資料庫 trigger 阻止直接 SQL 寫入撞期',async()=>{await createBooking(input());await expect(state.pool.query(`INSERT INTO bookings(reference,request_key,request_hash,customer_name,phone,starts_at,ends_at,total_price,total_minutes)
 SELECT $1,$2,'hash','測試','0912345678',starts_at,ends_at,total_price,total_minutes FROM bookings LIMIT 1`,['direct',randomUUID()])).rejects.toMatchObject({code:'23P01'});});
it('資料庫 trigger 阻止兩個不同連線同時直接寫入重疊區間',async()=>{
 const start=new Date(future()+'T11:00:00+08:00'),end=new Date(+start+45*60000);
 const insert=()=>state.pool.query('INSERT INTO bookings(reference,request_key,request_hash,customer_name,phone,starts_at,ends_at,total_price,total_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),randomUUID(),'test','測試','0912345678',start,end,500,45]);
 const r=await Promise.allSettled([insert(),insert()]);expect(r.filter(x=>x.status==='fulfilled')).toHaveLength(1);
});
it('容量可調整且不能降至小於既有占用',async()=>{await state.pool.query('UPDATE business_settings SET capacity=2');await createBooking(input());await createBooking(input());await expect(createBooking(input())).rejects.toThrow();await expect(state.pool.query('UPDATE business_settings SET capacity=1')).rejects.toMatchObject({code:'23P01'});});
it('非管理員無法讀取或修改所有管理端點',async()=>{for(const p of ['/admin/bookings','/admin/services','/admin/settings','/admin/session'])expect((await call(p)).status).toBe(401);for(const p of ['/admin/bookings','/admin/services','/admin/settings'])expect((await call(p,p.endsWith('settings')?'PUT':'POST',{})).status).toBe(401);});
it('缺少 CSRF 或跨站修改遭拒絕',async()=>{expect((await call('/admin/settings','PUT',{},true,'wrong')).status).toBe(403);const req=new Request('https://test.example/api/bookings',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify(input())});expect((await handler(req,context)).status).toBe(403);});
it('非法資料不會寫入資料庫',async()=>{const r=await call('/bookings','POST',{...input(),phone:'bad',totalPrice:1});expect(r.status).toBe(400);expect(Number((await state.pool.query('SELECT count(*) n FROM bookings')).rows[0].n)).toBe(0);});
it('公開查詢不洩漏個資',async()=>{await createBooking(input());const catalog=await (await call('/catalog')).text();const slots=await (await call('/availability?date='+future()+'&services='+service1)).text();expect(catalog+slots).not.toContain('0912345678');expect(catalog+slots).not.toContain('測試顧客');});
it('工作階段過期不能操作',async()=>{await state.pool.query("UPDATE admin_sessions SET expires_at=now()-interval '1 second'");expect((await call('/admin/session','GET',undefined,true)).status).toBe(401);await state.pool.query("UPDATE admin_sessions SET expires_at=now()+interval '1 hour'");});
it('登入儲存雜湊 token、登出與登入速率限制',async()=>{
 const body={username:'test-admin',password:'only-for-tests-a-long-password'};
 const r=await call('/login','POST',body);expect(r.status).toBe(200);const cookie=r.headers.get('set-cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=Strict');
 const raw=cookie.split(';')[0].split('=')[1];expect((await state.pool.query('SELECT id FROM admin_sessions WHERE token_hash=$1',[raw])).rows).toHaveLength(0);
 const data=await r.json();const req=new Request('https://test.example/api/admin/logout',{method:'POST',headers:{Origin:'https://test.example',cookie:cookie.split(';')[0],'x-csrf-token':data.csrfToken}});expect((await handler(req,context)).status).toBe(200);expect((await state.pool.query('SELECT id FROM admin_sessions WHERE token_hash=$1',[hashToken(raw)])).rows).toHaveLength(0);
 let last:Response|undefined;for(let i=0;i<9;i++)last=await call('/login','POST',{username:'unknown-admin',password:'wrong'});expect(last?.status).toBe(429);
});
it('多連線競爭仍不超過設定容量',async()=>{
 await state.pool.query('UPDATE business_settings SET capacity=2');
 const results=await Promise.allSettled(Array.from({length:12},()=>createBooking(input())));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
 expect(Number((await state.pool.query('SELECT count(*) n FROM bookings')).rows[0].n)).toBe(2);
});
it('管理員服務新增、更新、停用會即時反映在公開目錄',async()=>{
 const category=(await state.pool.query('SELECT id FROM service_categories LIMIT 1')).rows[0].id;
 const body={category_id:category,name:'新增測試項目',description:'測試專用',price:null,minutes:30,sort_order:5,active:false};
 const r=await call('/admin/services','POST',body,true);expect(r.status).toBe(200);const created=await r.json();
 expect((await call('/admin/services/'+created.id,'PUT',{...body,active:true},true)).status).toBe(400);
 expect((await call('/admin/services/'+created.id,'PUT',{...body,price:777,active:true},true)).status).toBe(200);
 expect((await (await call('/catalog')).json()).services.some((s:{id:string})=>s.id===created.id)).toBe(true);
 await call('/admin/services/'+created.id,'PUT',{...body,price:777,active:false},true);
 expect((await (await call('/catalog')).json()).services.some((s:{id:string})=>s.id===created.id)).toBe(false);
});
it('管理員設定寫入與店休日驗證',async()=>{
 const previous=await (await call('/admin/settings','GET',undefined,true)).json();
 const changed={...previous,slot_interval:15,closedDates:[{date:future(),reason:'測試店休'}]};
 expect((await call('/admin/settings','PUT',changed,true)).status).toBe(200);
 await expect(createBooking(input())).rejects.toThrow('公休日');
 expect((await call('/admin/settings','PUT',previous,true)).status).toBe(200);
});
it('管理員手動新增、日期姓名電話狀態篩選與快照讀取',async()=>{
 const r=await call('/admin/bookings','POST',input(),true);expect(r.status).toBe(201);
 const reference=(await r.json()).reference;
 for(const q of ['測試顧客','0912345678']){
 const list=await call('/admin/bookings?'+new URLSearchParams({date:future(),q,status:'pending'}),'GET',undefined,true);
 expect(list.status).toBe(200);const body=await list.json();expect(body.total).toBe(1);expect(body.bookings[0].reference).toBe(reference);expect(body.bookings[0].items[0].price).toBe(500);
 }
});
it('已有歷史預約的服務禁止硬刪除',async()=>{
 await createBooking(input());await expect(state.pool.query('DELETE FROM services WHERE id=$1',[service1])).rejects.toMatchObject({code:'23001'});
 expect((await state.pool.query('SELECT id FROM services WHERE id=$1',[service1])).rowCount).toBe(1);
});
it('品牌設定受權限與 CSRF 保護，儲存後公開目錄即更新',async()=>{
 expect((await call('/admin/site')).status).toBe(401);
 expect((await call('/admin/site','PUT',defaultSite,true,'invalid')).status).toBe(403);
 const content={...defaultSite,brandName:'測試品牌',instagramUrl:'https://www.instagram.com/test/',lineUrl:'https://lin.ee/test',copy:{...defaultSite.copy,heroTitle:'測試新標題'}};
 expect((await call('/admin/site','PUT',content,true)).status).toBe(200);
 const catalog=await (await call('/catalog')).json();expect(catalog.site.brandName).toBe('測試品牌');expect(catalog.site.copy.heroTitle).toBe('測試新標題');
 expect((await state.pool.query("SELECT id FROM audit_logs WHERE action='site.update'")).rowCount).toBeGreaterThan(0);
 expect((await call('/admin/site','PUT',{...content,lineUrl:'javascript:alert(1)'},true)).status).toBe(400);
});
it('優惠後端計算、快照、重複提交、改期與停用後拒絕新使用',async()=>{
 const data={name:'測試活動',description:'整合測試專用',starts_on:future(),ends_on:future(),kind:'percent',value:10,minimum:0,service_ids:[service1],active:true,sort_order:0};
 expect((await call('/admin/promotions','POST',data)).status).toBe(401);
 const response=await call('/admin/promotions','POST',data,true);expect(response.status).toBe(200);const {id}=await response.json();
 const body={...input(),promotionId:id};const first=await createBooking(body);expect(await createBooking(body)).toEqual(first);
 let b=(await state.pool.query('SELECT * FROM bookings')).rows[0];expect(b).toMatchObject({subtotal:500,discount:50,total_price:450});expect(b.promotion_snapshot.name).toBe('測試活動');
 const availability=await (await call('/availability?'+new URLSearchParams({date:future(),services:service1,promotion:id}))).json();expect(availability).toMatchObject({subtotal:500,discount:50,totalPrice:450});
 expect((await call('/admin/promotions/'+id,'PUT',{...data,name:'已修改活動',value:99,active:false},true)).status).toBe(200);
 await updateBooking(b.id,{date:future(),time:'13:00'},admin);
 b=(await state.pool.query('SELECT * FROM bookings')).rows[0];expect(b.total_price).toBe(450);expect(b.promotion_snapshot.name).toBe('測試活動');
 await expect(createBooking({...input('15:00'),promotionId:id})).rejects.toThrow('優惠');
 const list=await (await call('/admin/bookings','GET',undefined,true)).json();expect(list.bookings[0].discount).toBe(50);
});
it('服務限制及非法折扣不能寫入，公開活動不含個資',async()=>{
 const data={name:'指定護髮',description:'',starts_on:future(),ends_on:future(),kind:'fixed',value:200,minimum:0,service_ids:[service2],active:true,sort_order:0};
 const {id}=await (await call('/admin/promotions','POST',data,true)).json();
 await expect(createBooking({...input(),promotionId:id})).rejects.toThrow('未符合');
 expect((await call('/bookings','POST',{...input(),discount:500})).status).toBe(400);
 const catalog=await (await call('/catalog')).json();expect(catalog.promotions[0].id).toBe(id);expect(JSON.stringify(catalog.promotions)).not.toContain('0912345678');
});
it('確認後價格或活動變更時拒絕舊報價，不產生未確認的新金額',async()=>{
 await expect(createBooking({...input(),expectedTotal:1})).rejects.toThrow('價格或優惠已變更');
 expect(Number((await state.pool.query('SELECT count(*) n FROM bookings')).rows[0].n)).toBe(0);
 await expect(createBooking({...input(),expectedTotal:500})).resolves.toHaveProperty('reference');
});

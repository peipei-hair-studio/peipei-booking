import type { Context } from '@netlify/functions';
import { z } from 'zod';
import { transaction } from '../../server/db';
import { AppError } from '../../server/domain';
import { availability, createBooking, updateBooking, settings, audit } from '../../server/repository';
import { login, logout, requireAdmin, sessionCookie, sameOrigin, rateLimit } from '../../server/auth';
import { dateSchema, timeSchema, selectionSchema, serviceSchema, settingsSchema } from '../../src/shared';
import {site,promotions} from '../../server/marketing';
import {siteSchema} from '../../src/site';
import {promotionSchema} from '../../src/promotions';
const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
async function read(req:Request) {
 if(!req.headers.get('content-type')?.includes('application/json')) throw new AppError(415,'請使用 JSON 格式');
 const text=await req.text(); if(Buffer.byteLength(text)>300000) throw new AppError(413,'資料量過大');
 try{return JSON.parse(text);}catch{throw new AppError(400,'JSON 格式無效');}
}
export default async function handler(req:Request,context:Context) {
 try {
  const url=new URL(req.url), path=url.pathname.replace(/^\/(?:api|\.netlify\/functions\/api)/,'').replace(/\/$/,'')||'/';
  const method=req.method, mutation=!['GET','HEAD'].includes(method);
  if(path==='/login' && method==='POST') {
   const r=await login(req,await read(req),context.ip||'unknown');
   return json({csrfToken:r.csrfToken},200,{'Set-Cookie':sessionCookie(r.token,false,req)});
  }
  if(path==='/catalog' && method==='GET') return json(await transaction(async c=>({
   services:(await c.query('SELECT s.id,s.category_id,c.name category_name,s.name,s.description,s.price,s.minutes,s.sort_order,s.active FROM services s JOIN service_categories c ON c.id=s.category_id WHERE s.active AND s.price IS NOT NULL ORDER BY c.sort_order,s.sort_order,s.name')).rows,
   settings:await settings(c),site:await site(c),promotions:await promotions(c,true)
  })));
  if(path==='/availability' && method==='GET') {
   const date=dateSchema.parse(url.searchParams.get('date')),ids=selectionSchema.parse((url.searchParams.get('services')||'').split(','));
   const promotionId=z.uuid().nullable().parse(url.searchParams.get('promotion')||null);
   return json(await availability(date,ids,promotionId));
  }
  if(path==='/bookings' && method==='POST') {
   sameOrigin(req);await rateLimit('booking:'+context.ip,15,600);
   return json(await createBooking(await read(req)),201);
  }
  if(!path.startsWith('/admin/')) throw new AppError(404,'找不到 API');
  const session=await requireAdmin(req,mutation),admin=session.admin_id;
  if(path==='/admin/site'&&method==='GET')return json(await transaction(site));
  if(path==='/admin/site'&&method==='PUT'){
   const data=siteSchema.parse(await read(req));
   await transaction(async c=>{await c.query('SELECT id FROM site_settings WHERE id=1 FOR UPDATE');const before=await site(c);
    await c.query('UPDATE site_settings SET content=$1,updated_at=now() WHERE id=1',[JSON.stringify(data)]);
    // 圖片本體不重複存入操作紀錄。
    await audit(c,admin,'site.update','1',{before:{...before,logoUrl:before.logoUrl?'已設定':''},after:{...data,logoUrl:data.logoUrl?'已設定':''}});
   });return json({ok:true});
  }
  if(path==='/admin/promotions'&&method==='GET')return json(await transaction(async c=>({promotions:await promotions(c),services:(await c.query('SELECT id,name,active FROM services ORDER BY sort_order,name')).rows})));
  if(/^\/admin\/promotions(?:\/[a-f0-9-]+)?$/.test(path)&&['POST','PUT'].includes(method)){
   const data=promotionSchema.parse(await read(req)),id=method==='PUT'?z.uuid().parse(path.split('/')[3]):null;
   return json(await transaction(async c=>{
    await c.query('SELECT id FROM business_settings WHERE id=1 FOR UPDATE');
    const before=id?(await promotions(c)).find(p=>p.id===id):null;if(id&&!before)throw new AppError(404,'找不到優惠活動');
    const params=[data.name,data.description,data.starts_on,data.ends_on,data.kind,data.value,data.minimum,data.active,data.sort_order];
    const row=(await c.query(id?'UPDATE promotions SET name=$1,description=$2,starts_on=$3,ends_on=$4,kind=$5,value=$6,minimum=$7,active=$8,sort_order=$9,updated_at=now() WHERE id=$10 RETURNING id':'INSERT INTO promotions(name,description,starts_on,ends_on,kind,value,minimum,active,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',id?[...params,id]:params)).rows[0];
    await c.query('DELETE FROM promotion_services WHERE promotion_id=$1',[row.id]);
    for(const service of data.service_ids)await c.query('INSERT INTO promotion_services(promotion_id,service_id) VALUES($1,$2)',[row.id,service]);
    await audit(c,admin,id?'promotion.update':'promotion.create',row.id,{before,after:data});return {id:row.id};
   }));
  }
  if(path==='/admin/session' && method==='GET') return json({csrfToken:session.csrf_token});
  if(path==='/admin/logout' && method==='POST') {await logout(req,admin);return json({ok:true},200,{'Set-Cookie':sessionCookie('',true,req)});}
  if(path==='/admin/services' && method==='GET') return json(await transaction(async c=>({services:(await c.query('SELECT * FROM services ORDER BY sort_order,name')).rows,categories:(await c.query('SELECT * FROM service_categories ORDER BY sort_order')).rows})));
  if(/^\/admin\/services(?:\/[a-f0-9-]+)?$/.test(path) && ['POST','PUT'].includes(method)) {
   const data=serviceSchema.parse(await read(req)),id=method==='PUT'?z.uuid().parse(path.split('/')[3]):null;
   const result=await transaction(async c=>{
    const before=id?(await c.query('SELECT * FROM services WHERE id=$1 FOR UPDATE',[id])).rows[0]:null;
    if(id && !before) throw new AppError(404,'找不到服務');
    const params=[data.category_id,data.name,data.description,data.price,data.minutes,data.sort_order,data.active];
    const row=(await c.query(id?'UPDATE services SET category_id=$1,name=$2,description=$3,price=$4,minutes=$5,sort_order=$6,active=$7,updated_at=now() WHERE id=$8 RETURNING *':'INSERT INTO services(category_id,name,description,price,minutes,sort_order,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',id?[...params,id]:params)).rows[0];
    await audit(c,admin,id?'service.update':'service.create',row.id,{before,after:row});return row;
   });return json(result);
  }
  if(path==='/admin/settings' && method==='GET') return json(await transaction(settings));
  if(path==='/admin/settings' && method==='PUT') {
   const data=settingsSchema.parse(await read(req));
   await transaction(async c=>{
    await c.query('SELECT id FROM business_settings WHERE id=1 FOR UPDATE');const before=await settings(c);
    await c.query('UPDATE business_settings SET capacity=$1,slot_interval=$2,advance_days=$3 WHERE id=1',[data.capacity,data.slot_interval,data.advance_days]);
    for(const h of data.hours) await c.query('UPDATE business_hours SET closed=$1,opens=$2,closes=$3 WHERE weekday=$4',[h.closed,h.opens,h.closes,h.weekday]);
    await c.query('DELETE FROM closed_dates'); for(const d of data.closedDates) await c.query('INSERT INTO closed_dates(date,reason) VALUES($1,$2)',[d.date,d.reason]);
    await audit(c,admin,'settings.update','1',{before,after:data});
   });return json({ok:true});
  }
  if(path==='/admin/bookings' && method==='GET') {
   const date=url.searchParams.get('date')||null;if(date) dateSchema.parse(date);
   const q=z.string().max(80).parse(url.searchParams.get('q')||'');
   const status=z.enum(['pending','confirmed','completed','cancelled']).nullable().parse(url.searchParams.get('status')||null);
   const page=z.coerce.number().int().min(1).max(100000).parse(url.searchParams.get('page')||1);
   return json(await transaction(async c=>{
    const where="WHERE ($1::date IS NULL OR (b.starts_at AT TIME ZONE 'Asia/Taipei')::date=$1) AND ($2='' OR position(lower($2) in lower(b.customer_name))>0 OR position($2 in b.phone)>0) AND ($3::text IS NULL OR b.status=$3)";
    const total=Number((await c.query('SELECT count(*) count FROM bookings b '+where,[date,q,status])).rows[0].count);
    const rows=(await c.query(`SELECT b.*,COALESCE((SELECT json_agg(json_build_object('service_name',i.service_name,'price',i.price,'minutes',i.minutes) ORDER BY i.id) FROM booking_items i WHERE i.booking_id=b.id),'[]') items FROM bookings b ${where} ORDER BY b.starts_at DESC,b.id LIMIT 50 OFFSET $4`,[date,q,status,(page-1)*50])).rows;
    return {bookings:rows,total,page};
   }));
  }
  if(path==='/admin/bookings' && method==='POST') return json(await createBooking(await read(req),admin),201);
  if(/^\/admin\/bookings\/[a-f0-9-]+$/.test(path) && method==='PATCH') {
   const id=z.uuid().parse(path.split('/')[3]);
   const patch=z.object({status:z.enum(['confirmed','completed','cancelled']).optional(),date:dateSchema.optional(),time:timeSchema.optional()}).strict()
    .refine(p=>Boolean(p.status||p.date),'請提供修改內容').refine(p=>Boolean(p.date)===Boolean(p.time),'日期與時間必須一起設定').parse(await read(req));
   return json(await updateBooking(id,patch,admin));
  }
  throw new AppError(404,'找不到 API');
 }catch(error) {
  if(error instanceof z.ZodError) return json({error:'請檢查輸入欄位',fields:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))},400);
  if(error instanceof AppError) return json({error:error.message},error.status);
  const code=(error as {code?:string}).code;
  if(code==='23P01' || code==='40001' || code==='40P01') return json({error:'時段或容量已變更，請重新選擇並重試'},409);
  if(code==='23503' || code==='23001' || code==='23514' || code==='23505') return json({error:'資料不符合限制，請重新載入後再試'},400);
  // 不記錄 SQL、連線字串、request body 或個人資料。
  console.error('api_unavailable');
  return json({error:'服務暫時無法使用，請稍後重試或致電 07-3655699；預約尚未確認'},503);
 }
}

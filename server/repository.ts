import type { PoolClient } from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { transaction } from './db';
import { AppError, calculate, hasCapacity, minutes, validateTime } from './domain';
import { bookingSchema, type BookingInput, type Settings, type Service } from '../src/shared';
import {promotions} from './marketing';
import {promotionQuote} from '../src/promotions';
export async function quote(c:PoolClient,services:Service[],date:string,promotionId?:string|null){
 const promotion=promotionId?(await promotions(c)).find(p=>p.id===promotionId):null;
 if(promotionId&&!promotion)throw new AppError(400,'找不到所選優惠活動');
 try{return promotionQuote(services,promotion||null,date);}catch(e){throw new AppError(400,(e as Error).message);}
}
export async function settings(c:PoolClient):Promise<Settings> {
 const s=(await c.query('SELECT capacity,slot_interval,advance_days FROM business_settings WHERE id=1')).rows[0];
 if(!s) throw new AppError(503,'資料庫尚未初始化');
 const hours=(await c.query("SELECT weekday,closed,to_char(opens,'HH24:MI') opens,to_char(closes,'HH24:MI') closes FROM business_hours ORDER BY weekday")).rows;
 const closedDates=(await c.query("SELECT to_char(date,'YYYY-MM-DD') date,reason FROM closed_dates ORDER BY date")).rows;
 return {...s,hours,closedDates};
}
export async function audit(c:PoolClient,admin:string|null,action:string,id:string,details:object={}) {
 await c.query('INSERT INTO audit_logs(admin_id,action,entity_id,details) VALUES($1,$2,$3,$4)',[admin,action,id,JSON.stringify(details)]);
}
export async function selected(c:PoolClient,ids:string[]):Promise<Service[]> {
 const rows=(await c.query('SELECT * FROM services WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',[ids])).rows;
 if(rows.length!==ids.length) throw new AppError(400,'選擇的服務不存在'); return rows;
}
export async function busy(c:PoolClient,date:string,exclude:string|null=null) {
 return (await c.query("SELECT starts_at,ends_at FROM bookings WHERE status<>'cancelled' AND starts_at < ($1::date+1)::timestamp AT TIME ZONE 'Asia/Taipei' AND ends_at > $1::date::timestamp AT TIME ZONE 'Asia/Taipei' AND ($2::uuid IS NULL OR id<>$2::uuid)",[date,exclude])).rows;
}
export async function availability(date:string,ids:string[],promotionId?:string|null) {
 return transaction(async c=>{
  const s=await settings(c), services=await selected(c,ids), totals=calculate(services), occupied=await busy(c,date);
  const h=s.hours.find(h=>h.weekday===new Date(`${date}T00:00:00Z`).getUTCDay()); const slots:string[]=[];
  if(h && !h.closed) for(let m=minutes(h.opens); m+totals.totalMinutes<=minutes(h.closes);m+=s.slot_interval) {
   const t=`${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
   try {const {start,end}=validateTime(date,t,totals.totalMinutes,s); if(hasCapacity(start,end,occupied,s.capacity)) slots.push(t);} catch(e) {if(!(e instanceof AppError)) throw e;}
  }
  return {...totals,...await quote(c,services,date,promotionId),slots};
 });
}
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function createBooking(raw:unknown,admin:string|null=null) {
 const input=bookingSchema.parse(raw);
 const canonical={...input,serviceIds:[...input.serviceIds].sort()};
 const fingerprint=digest(JSON.stringify(canonical));
 return transaction(async c=>{
  // 與資料庫 trigger / 設定更新採相同鎖順序；重試會先讀回已完成結果。
  await c.query('SELECT id FROM business_settings WHERE id=1 FOR UPDATE');
  const previous=(await c.query('SELECT reference,request_hash FROM bookings WHERE request_key=$1',[input.requestKey])).rows[0];
  if(previous) {if(previous.request_hash!==fingerprint) throw new AppError(409,'此提交識別碼已用於不同內容');return {reference:previous.reference};}
  const s=await settings(c), services=await selected(c,canonical.serviceIds), totals=calculate(services);
  const pricing=await quote(c,services,input.date,input.promotionId);
  if(input.expectedTotal!==undefined&&input.expectedTotal!==pricing.totalPrice)throw new AppError(409,'服務價格或優惠已變更，請重新確認總額');
  const {start,end}=validateTime(input.date,input.time,totals.totalMinutes,s);
  if(!hasCapacity(start,end,await busy(c,input.date),s.capacity)) throw new AppError(409,'此時段已被預約，請重新選擇');
  const reference=`PP-${randomBytes(12).toString('hex').toUpperCase()}`;
  const b=(await c.query(`INSERT INTO bookings(reference,request_key,request_hash,customer_name,phone,notes,starts_at,ends_at,total_price,total_minutes,subtotal,discount,promotion_snapshot)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[reference,input.requestKey,fingerprint,input.customerName,input.phone,input.notes,start,end,pricing.totalPrice,totals.totalMinutes,pricing.subtotal,pricing.discount,pricing.promotionSnapshot?JSON.stringify(pricing.promotionSnapshot):null])).rows[0];
  for(const service of services) await c.query('INSERT INTO booking_items(booking_id,service_id,service_name,price,minutes) VALUES($1,$2,$3,$4,$5)',[b.id,service.id,service.name,service.price,service.minutes]);
  await audit(c,admin,admin?'booking.manual_create':'booking.create',b.id);
  return {reference};
 });
}
export async function updateBooking(id:string,patch:{status?:string;date?:string;time?:string},admin:string) {
 return transaction(async c=>{
  await c.query('SELECT id FROM business_settings WHERE id=1 FOR UPDATE');
  const b=(await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!b) throw new AppError(404,'找不到預約');
  if(b.status==='cancelled' || b.status==='completed') throw new AppError(400,'已結案預約不能再修改');
  let start=b.starts_at,end=b.ends_at;
  if(patch.date && patch.time) {
   ({start,end}=validateTime(patch.date,patch.time,b.total_minutes,await settings(c)));
   if(!hasCapacity(start,end,await busy(c,patch.date,id),(await settings(c)).capacity)) throw new AppError(409,'此時段已被預約');
  }
  if(patch.status==='completed' && new Date(end)>new Date()) throw new AppError(400,'服務結束後才能標記完成');
  await c.query('UPDATE bookings SET starts_at=$1,ends_at=$2,status=$3,updated_at=now() WHERE id=$4',[start,end,patch.status||b.status,id]);
  await audit(c,admin,'booking.update',id,{before:{status:b.status,start:b.starts_at,end:b.ends_at},after:{status:patch.status||b.status,start,end}});
  return {ok:true};
 });
}

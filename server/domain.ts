import type { Service, Settings } from '../src/shared';
export class AppError extends Error { constructor(public status:number, message:string) {super(message);} }
export function calculate(services: Pick<Service,'price'|'minutes'|'active'>[]) {
 if(!services.length || services.some(s=>!s.active || s.price===null)) throw new AppError(400,'服務尚未開放預約');
 const totalPrice=services.reduce((n,s)=>n+s.price!,0), totalMinutes=services.reduce((n,s)=>n+s.minutes,0);
 if(totalMinutes>540) throw new AppError(400,'服務總時長超過單日可預約範圍');
 return {totalPrice,totalMinutes};
}
export function taipeiDate(now=new Date()) { return new Date(now.getTime()+8*3600000).toISOString().slice(0,10); }
export function minutes(s:string) { const [h,m]=s.split(':').map(Number); return h*60+m; }
export function validateTime(date:string,time:string,duration:number,settings:Settings,now=new Date()) {
 const start=new Date(`${date}T${time}:00+08:00`), today=taipeiDate(now);
 const delta=(Date.parse(date)-Date.parse(today))/86400000;
 if(delta<0 || delta>settings.advance_days || start<=now) throw new AppError(400,'日期必須在可預約範圍內，且晚於現在');
 const day=new Date(`${date}T00:00:00Z`).getUTCDay();
 const hours=settings.hours.find(h=>h.weekday===day);
 if(!hours || hours.closed || settings.closedDates.some(d=>d.date===date)) throw new AppError(400,'此日為公休日或店休日');
 const offset=minutes(time)-minutes(hours.opens);
 if(offset<0 || offset%settings.slot_interval!==0 || minutes(time)+duration>minutes(hours.closes)) throw new AppError(400,'時段不符合營業時間或服務無法於打烊前完成');
 return {start,end:new Date(start.getTime()+duration*60000)};
}
export function hasCapacity(start:Date,end:Date,busy:{starts_at:string|Date;ends_at:string|Date}[],capacity:number) {
 const events:[number,number][]=[[+start,1],[+end,-1]];
 for(const b of busy) {const s=+new Date(b.starts_at),e=+new Date(b.ends_at); if(s<+end && e>+start) events.push([Math.max(s,+start),1],[Math.min(e,+end),-1]);}
 events.sort((a,b)=>a[0]-b[0] || a[1]-b[1]); let count=0;
 return events.every(e=>(count+=e[1])<=capacity);
}

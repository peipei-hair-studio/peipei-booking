import { describe,it,expect } from 'vitest';
import { calculate,validateTime,hasCapacity } from '../server/domain';
import { bookingSchema, serviceSchema } from '../src/shared';
const rules={capacity:1,slot_interval:30,advance_days:60,hours:Array.from({length:7},(_,weekday)=>({weekday,closed:weekday===3,opens:'11:00',closes:'20:00'})),closedDates:[]};
const now=new Date('2026-11-14T00:00:00Z');
describe('預約規則',()=>{
 it('加總多服務金額與分鐘',()=>expect(calculate([{price:500,minutes:45,active:true},{price:800,minutes:90,active:true}])).toEqual({totalPrice:1300,totalMinutes:135}));
 it('未設定價格不能預約',()=>expect(()=>calculate([{price:null,minutes:30,active:true}])).toThrow());
 it('週三公休',()=>expect(()=>validateTime('2026-11-18','11:00',30,rules,now)).toThrow('公休日'));
 it('額外店休日',()=>expect(()=>validateTime('2026-11-16','11:00',30,{...rules,closedDates:[{date:'2026-11-16',reason:''}]},now)).toThrow('公休日'));
 it('不能超過打烊時間',()=>expect(()=>validateTime('2026-11-16','19:30',90,rules,now)).toThrow());
 it('過去與超出範圍不能預約',()=>{expect(()=>validateTime('2026-11-13','11:00',30,rules,now)).toThrow();expect(()=>validateTime('2027-02-16','11:00',30,rules,now)).toThrow();});
 it('服務可在打烊時剛好完成',()=>expect(validateTime('2026-11-16','19:30',30,rules,now).end.toISOString()).toBe('2026-11-16T12:00:00.000Z'));
 it('多服務 135 分鐘的重疊正確',()=>expect(hasCapacity(new Date('2026-11-16T03:00Z'),new Date('2026-11-16T05:15Z'),[{starts_at:'2026-11-16T05:00Z',ends_at:'2026-11-16T06:00Z'}],1)).toBe(false));
 it('半開區間允許緊接預約',()=>expect(hasCapacity(new Date('2026-11-16T03:00Z'),new Date('2026-11-16T04:00Z'),[{starts_at:'2026-11-16T04:00Z',ends_at:'2026-11-16T05:00Z'}],1)).toBe(true));
 it('容量 2 使用同時占用最大值而非重疊總筆數',()=>expect(hasCapacity(new Date('2026-11-16T03:00Z'),new Date('2026-11-16T06:00Z'),[{starts_at:'2026-11-16T03:00Z',ends_at:'2026-11-16T04:00Z'},{starts_at:'2026-11-16T04:00Z',ends_at:'2026-11-16T05:00Z'}],2)).toBe(true));
 it('非法資料拒絕且不能開放未定價服務',()=>{
 expect(bookingSchema.safeParse({}).success).toBe(false);
 expect(serviceSchema.safeParse({category_id:crypto.randomUUID(),name:'測試',description:'',price:null,minutes:30,sort_order:0,active:true}).success).toBe(false);
 });
});

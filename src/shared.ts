import { z } from 'zod';
z.config(z.locales.zhTW());
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s, '日期無效');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const selectionSchema = z.array(z.uuid()).min(1,'請選擇服務').max(20).refine(v=>new Set(v).size===v.length,'不可重複選擇服務');
export const bookingSchema = z.object({ serviceIds: selectionSchema, date: dateSchema, time: timeSchema,
 customerName: z.string().trim().min(1,'請填寫姓名').max(60), phone: z.string().trim().regex(/^[0-9+() -]{7,24}$/,'請填寫有效電話'),
 notes: z.string().trim().max(1000).default(''), requestKey: z.uuid(),promotionId:z.uuid().nullable().optional(),expectedTotal:z.number().int().min(0).max(20000000).optional() }).strict();
export const serviceSchema = z.object({ category_id: z.uuid(), name: z.string().trim().min(1).max(80), description:z.string().max(1000),
 price:z.number().int().min(0).max(1000000).nullable(), minutes:z.number().int().min(5).max(540), sort_order:z.number().int().min(-10000).max(10000), active:z.boolean()
}).strict().refine(s=>!s.active || s.price!==null,'啟用前必須設定正式價格');
export const settingsSchema = z.object({ capacity:z.number().int().min(1).max(20), slot_interval:z.number().int().min(5).max(120), advance_days:z.number().int().min(1).max(365),
 hours:z.array(z.object({weekday:z.number().int().min(0).max(6),closed:z.boolean(),opens:timeSchema,closes:timeSchema}).refine(h=>h.opens<h.closes,'結束時間必須晚於開始時間')).length(7).refine(h=>new Set(h.map(x=>x.weekday)).size===7),
 closedDates:z.array(z.object({date:dateSchema,reason:z.string().max(200)})).max(730).refine(d=>new Set(d.map(x=>x.date)).size===d.length)
}).strict();
export type Service = z.infer<typeof serviceSchema> & {id:string;category_name?:string;created_at?:string;updated_at?:string};
export type Settings = z.infer<typeof settingsSchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
export type Booking = {id:string; reference:string;customer_name:string;phone:string;notes:string;starts_at:string;ends_at:string;total_price:number;total_minutes:number;subtotal:number;discount:number;promotion_snapshot:{name:string}|null;status:'pending'|'confirmed'|'completed'|'cancelled';items:{service_name:string;price:number;minutes:number}[]};
export const statusNames = {pending:'待確認',confirmed:'已確認',completed:'已完成',cancelled:'已取消'};

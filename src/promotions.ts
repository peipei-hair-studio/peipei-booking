import {z} from 'zod';
import {dateSchema,type Service} from './shared';
export const promotionSchema=z.object({name:z.string().trim().min(1).max(100),description:z.string().max(1000),
 starts_on:dateSchema,ends_on:dateSchema,kind:z.enum(['fixed','percent']),value:z.number().int().min(1).max(1000000),
 minimum:z.number().int().min(0).max(20000000),service_ids:z.array(z.uuid()).max(100).refine(v=>new Set(v).size===v.length),active:z.boolean(),sort_order:z.number().int().min(-10000).max(10000)
}).strict().refine(p=>p.starts_on<=p.ends_on,'活動結束日期不可早於開始日期').refine(p=>p.kind!=='percent'||p.value<=100,'百分比折抵必須介於 1–100');
export type Promotion=z.infer<typeof promotionSchema>&{id:string};
export function promotionQuote(services:Pick<Service,'id'|'price'>[],promotion:Promotion|null,date:string){
 const subtotal=services.reduce((n,s)=>n+(s.price??0),0);
 if(!promotion)return {subtotal,discount:0,totalPrice:subtotal,promotionSnapshot:null};
 if(!promotion.active||!date||date<promotion.starts_on||date>promotion.ends_on)throw new Error('此優惠不適用於所選預約日期');
 const eligible=services.filter(s=>!promotion.service_ids.length||promotion.service_ids.includes(s.id)).reduce((n,s)=>n+(s.price??0),0);
 if(eligible<=0||eligible<promotion.minimum)throw new Error('所選服務或金額未符合優惠條件');
 const discount=Math.min(eligible,promotion.kind==='fixed'?promotion.value:Math.floor(eligible*promotion.value/100));
 return {subtotal,discount,totalPrice:subtotal-discount,promotionSnapshot:{id:promotion.id,name:promotion.name,description:promotion.description,kind:promotion.kind,value:promotion.value,minimum:promotion.minimum,service_ids:promotion.service_ids,starts_on:promotion.starts_on,ends_on:promotion.ends_on}};
}

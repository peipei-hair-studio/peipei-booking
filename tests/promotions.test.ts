import {describe,it,expect} from 'vitest';
import {promotionQuote,promotionSchema,type Promotion} from '../src/promotions';
import {siteSchema,defaultSite,passwordSchema} from '../src/site';
const services=[{id:crypto.randomUUID(),price:501},{id:crypto.randomUUID(),price:800}];
const base:Promotion={id:crypto.randomUUID(),name:'測試優惠',description:'',starts_on:'2026-11-01',ends_on:'2026-11-30',kind:'fixed',value:200,minimum:0,service_ids:[],active:true,sort_order:0};
describe('優惠與品牌設定',()=>{
 it('固定金額折抵',()=>expect(promotionQuote(services,base,'2026-11-14')).toMatchObject({subtotal:1301,discount:200,totalPrice:1101}));
 it('百分比採整數向下取整',()=>expect(promotionQuote(services,{...base,kind:'percent',value:10},'2026-11-14')).toMatchObject({discount:130,totalPrice:1171}));
 it('指定服務只折抵適用部分',()=>expect(promotionQuote(services,{...base,kind:'percent',value:10,service_ids:[services[0].id]},'2026-11-14').discount).toBe(50));
 it('折抵不超過適用服務原價',()=>expect(promotionQuote(services,{...base,value:1000,service_ids:[services[0].id]},'2026-11-14')).toMatchObject({discount:501,totalPrice:800}));
 it('活動期間含開始及結束當天',()=>{expect(promotionQuote(services,base,'2026-11-01').discount).toBe(200);expect(promotionQuote(services,base,'2026-11-30').discount).toBe(200);expect(()=>promotionQuote(services,base,'2026-12-01')).toThrow();});
 it('停用及未達門檻不可用',()=>{expect(()=>promotionQuote(services,{...base,active:false},'2026-11-14')).toThrow();expect(()=>promotionQuote(services,{...base,minimum:1302},'2026-11-14')).toThrow();});
 it('門檻以適用服務計算',()=>expect(()=>promotionQuote(services,{...base,service_ids:[services[0].id],minimum:600},'2026-11-14')).toThrow());
 it('沒有優惠維持原價',()=>expect(promotionQuote(services,null,'2026-11-14')).toMatchObject({subtotal:1301,totalPrice:1301,discount:0,promotionSnapshot:null}));
 it('不合法活動參數拒絕',()=>{const {id,...data}=base;expect(promotionSchema.safeParse({...data,kind:'percent',value:101}).success).toBe(false);expect(promotionSchema.safeParse({...data,ends_on:'2026-10-01'}).success).toBe(false);});
 it('IG LINE 限制官方 HTTPS 網域',()=>{expect(siteSchema.safeParse({...defaultSite,instagramUrl:'https://www.instagram.com/peipei/',lineUrl:'https://lin.ee/test'}).success).toBe(true);expect(siteSchema.safeParse({...defaultSite,lineUrl:'javascript:alert(1)'}).success).toBe(false);expect(siteSchema.safeParse({...defaultSite,instagramUrl:'https://instagram.com.evil.example/name'}).success).toBe(false);});
 it('拒絕可執行圖片資料',()=>expect(siteSchema.safeParse({...defaultSite,logoUrl:'data:image/svg+xml,<svg onload="alert(1)"/>'}).success).toBe(false));
 it('管理員密碼最低 12 字元',()=>{expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true);expect(passwordSchema.safeParse('a'.repeat(11)).success).toBe(false);});
});

import {z} from 'zod';
const text=(max=200)=>z.string().trim().min(1).max(max);
const social=(hosts:string[])=>z.string().max(500).refine(v=>{if(!v)return true;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname.toLowerCase());}catch{return false;}},'請輸入正確的官方 HTTPS 連結');
export const copyDefaults={
 footerDescription:'高雄楠梓美髮工作室。提供剪髮設計、燙髮造型、染髮設計、護髮修護與頭皮 SPA 線上預約服務。',footerContactTitle:'門市聯絡資訊',footerCopyright:'All rights reserved.',footerBookingNote:'採預約制',
 headerNote:'留一段時間，好好喜歡自己。',adminLink:'店務管理 ↗',heroEyebrow:'A LITTLE TIME FOR YOURSELF',heroTitle:'讓美好，',heroAccent:'從髮開始。',heroDescription:'選擇喜歡的服務與時間，剩下的交給 Pei Pei。',heroBadge:'線上預約 · 高雄楠梓',
 instagramLabel:'IG 作品集',lineLabel:'官方 LINE',footerHours:'11:00–20:00 · 每週三公休',footerNote:'實際可預約日期以預約日曆為準 · Asia/Taipei',
 step1:'選擇服務',step2:'預約時間',step3:'聯絡資料',step4:'確認預約',title1:'選擇適合你的服務',title2:'挑個舒服的時間',title3:'讓我們與你聯繫',title4:'確認這次的美好約定',
 emptyTitle:'服務準備中',emptyDescription:'店家尚未開放已定價服務，請致電洽詢。',serviceHint:'可複選服務，時間將依所選項目加總。',dateLabel:'預約日期',slotTitle:'可用時段',selectDate:'請先選擇日期',noSlots:'當日公休、已額滿，或剩餘時間不足，請選擇其他日期。',
 nameLabel:'姓名 *',phoneLabel:'聯絡電話 *',notesLabel:'備註（選填）',notesPlaceholder:'例如：髮況、希望的造型或其他需求',privacyNote:'資料僅供店家處理本次預約與聯繫使用。',confirmationNote:'送出時系統會再次驗證優惠、價格與空檔。預約狀態為待確認，店家將依需要與您聯繫。',
 summaryEyebrow:'YOUR APPOINTMENT',summaryTitle:'你的預約小卡',summaryEmpty:'從一項服務開始，把時間留給自己。',summaryNote:'✦ 每一次整理，都是新的開始。如需協助，歡迎致電店家。',durationLabel:'預估時間',totalLabel:'服務總額',promotionTitle:'本期優惠活動',promotionHint:'每筆預約限選一項優惠，不可合併使用；依預約日期判斷活動期間。',noPromotion:'不使用優惠',subtotalLabel:'服務原價',discountLabel:'活動折抵',
 backButton:'上一步',nextButton:'下一步',submitButton:'確認送出預約',successEyebrow:'THANK YOU',successTitle:'已收到你的預約',successNote:'目前狀態：待確認。請保存預約編號，方便與店家聯繫。',successContact:'如需調整或取消，請致電',homeButton:'返回首頁',
 loginEyebrow:'PEI PEI STUDIO',loginTitle:'歡迎回來',loginNote:'登入店務管理，照顧每一份預約。',loginButton:'安全登入',
};
export type CopyKey=keyof typeof copyDefaults;
const copyShape=Object.fromEntries(Object.keys(copyDefaults).map(k=>[k,text(1000)])) as {[K in CopyKey]:z.ZodString};
export const siteSchema=z.object({brandName:text(80),brandSubtitle:text(80),shopName:text(120),logoText:text(8),
 logoUrl:z.string().max(220000).refine(v=>!v||/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(v)||/^https:\/\/[^\s]+$/.test(v),'LOGO 請使用 HTTPS 圖片或 PNG/JPEG/WebP 上傳'),
 address:text(200),phone:z.string().regex(/^[0-9+() -]{7,24}$/),instagramUrl:social(['instagram.com','www.instagram.com']),lineUrl:social(['line.me','www.line.me','lin.ee','page.line.me']),
 background:z.string().regex(/^#[0-9a-fA-F]{6}$/),accent:z.string().regex(/^#[0-9a-fA-F]{6}$/),font:z.enum(['sans','serif']),copy:z.object(copyShape).strict()}).strict();
export type Site=z.infer<typeof siteSchema>;
export const defaultSite:Site={brandName:'Pei Pei',brandSubtitle:'美髮預約系統',shopName:'Pei Pei 美髮預約系統',logoText:'P.',logoUrl:'',address:'高雄市楠梓區後昌路1029號',phone:'07-3655699',instagramUrl:'',lineUrl:'',background:'#f8f5ef',accent:'#a66e75',font:'sans',copy:{...copyDefaults}};
export const passwordSchema=z.string().min(12,'密碼至少需要 12 字元').max(256,'密碼最多 256 字元');

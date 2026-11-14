import type {PoolClient} from 'pg';
import {defaultSite,siteSchema} from '../src/site';
import type {Promotion} from '../src/promotions';
export async function site(c:PoolClient){
 const content=(await c.query('SELECT content FROM site_settings WHERE id=1')).rows[0]?.content||{};
 return siteSchema.parse({...defaultSite,...content,copy:{...defaultSite.copy,...content.copy}});
}
export async function promotions(c:PoolClient,onlyActive=false):Promise<Promotion[]>{
 return (await c.query(`SELECT p.id,p.name,p.description,to_char(p.starts_on,'YYYY-MM-DD') starts_on,to_char(p.ends_on,'YYYY-MM-DD') ends_on,p.kind,p.value,p.minimum,p.active,p.sort_order,
 ARRAY(SELECT service_id::text FROM promotion_services WHERE promotion_id=p.id ORDER BY service_id) service_ids
 FROM promotions p WHERE ($1=false OR (p.active AND p.ends_on>=(now() AT TIME ZONE 'Asia/Taipei')::date)) ORDER BY p.sort_order,p.created_at`,[onlyActive])).rows;
}

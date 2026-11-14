import { it,expect } from 'vitest';
import { NetlifyDB } from '@netlify/database-dev';
it('官方 Netlify 本機資料庫可套用正式 migration',async()=>{
 const db=new NetlifyDB({logger:()=>{}});
 try {await db.start();const migrations=await db.applyMigrations('./netlify/database/migrations');expect(migrations).toContain('0001_initial');
 const r=await db.query<{capacity:number}>('SELECT capacity FROM business_settings WHERE id=1');expect(r.rows[0].capacity).toBe(1);
 }finally{await db.stop();}
});

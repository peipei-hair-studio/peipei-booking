import { getDatabase } from '@netlify/database';
import type { PoolClient } from 'pg';
let cached:ReturnType<typeof getDatabase>|undefined;
export const database = () => {
 if(!cached) {
  cached=getDatabase();
  // netlify dev 的單一 WASM 資料庫沒有多連線交易隔離；本機以單一 pool connection 排隊。
  // 雲端仍使用官方 pool 的正常並行能力，並由 PostgreSQL 列鎖與 trigger 保護。
  if(process.env.NETLIFY_DEV==='true') cached.pool.options.max=1;
 }
 return cached;
};
export async function transaction<T>(work:(c:PoolClient)=>Promise<T>):Promise<T> {
 // 官方 client 在 server / serverless 回傳不同型別的 pg-compatible pool。
 // 此處只使用兩者共通的 query(text, values) 與 release()。
 const c=await database().pool.connect() as unknown as PoolClient;
 try { await c.query('BEGIN'); const r=await work(c); await c.query('COMMIT'); return r; }
 catch(e) {await c.query('ROLLBACK'); throw e;} finally {c.release();}
}

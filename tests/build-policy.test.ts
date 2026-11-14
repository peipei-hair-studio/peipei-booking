import {it,expect} from 'vitest';
import {build} from 'vite';
it('正式 build 將 CSP 放入 HTML 且不產生會影響 netlify dev 的 _headers',async()=>{
 const output=await build({build:{write:false},logLevel:'silent'});
 const bundles=Array.isArray(output)?output:[output];
 const files=bundles.flatMap(b=>'output' in b?b.output:[]);
 const html=files.find(f=>f.fileName==='index.html');
 expect(html?.type).toBe('asset');
 if(html?.type!=='asset')throw new Error('缺少 index.html');
 expect(String(html.source)).toContain('http-equiv="Content-Security-Policy"');
 expect(String(html.source).replaceAll('&#39;',"'")).toContain("script-src 'self'");
 expect(String(html.source)).not.toContain('unsafe-inline');
 expect(files.some(f=>f.fileName==='_headers')).toBe(false);
});

import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
let content='';
try {content=await readFile('.env','utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(!/^APP_ORIGIN=.+$/m.test(content)) content+='\nAPP_ORIGIN=http://localhost:8888\n';
if(!/^RATE_LIMIT_SECRET=.{32,}$/m.test(content)) {
 const line='RATE_LIMIT_SECRET='+randomBytes(32).toString('hex');
 content=/^RATE_LIMIT_SECRET=.*$/m.test(content)?content.replace(/^RATE_LIMIT_SECRET=.*$/m,line):content+'\n'+line+'\n';
}
await writeFile('.env',content,{mode:0o600});
console.log('本機 .env 已就緒；隨機安全密鑰不會顯示。重新啟動 npm run dev 後生效。');

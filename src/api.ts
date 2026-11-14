export class ApiError extends Error {constructor(message:string,public status:number,public fields:{path:string;message:string}[]=[]){super(message);}}
let csrf='';
export function setCsrf(s:string){csrf=s;}
export async function api<T>(path:string,options:{method?:string;body?:unknown;signal?:AbortSignal}={}):Promise<T> {
 const response=await fetch('/api'+path,{method:options.method||'GET',credentials:'same-origin',signal:options.signal,
 headers:{...(options.body!==undefined?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:options.body===undefined?undefined:JSON.stringify(options.body)});
 let data;try {data=await response.json();}catch{throw new ApiError('無法連接預約服務，請稍後再試',503);}
 if(!response.ok) throw new ApiError(data.error||'操作失敗',response.status,data.fields);return data;
}

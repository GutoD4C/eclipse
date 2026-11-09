(() => {
 'use strict';
 const key='eclipse-public-admin-v1';
 const maxProducts=2000;
 const sessionKey=key+':session';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const defaults=()=>({products:copy(demoProducts),demoCatalogRestored:true,users:{admin:'admin'},settings:{
  phone:'',storeAddress:'Rua Dr. Bernardino de Campos, 220 — Centro, Cachoeira Paulista/SP',
  instagram:'https://www.instagram.com/lojaeclipsecp/',facebook:'https://www.facebook.com/eclipsecpoficial/'
 }});
 function read(){
  let state;
  try{state=JSON.parse(localStorage.getItem(key));}catch{return defaults();}
  if(!state)return defaults();
  if(state.demoCatalogRestored||!Array.isArray(state.products)||typeof restoreDemoCatalog!=='function')return state;
  const restored={...state,products:restoreDemoCatalog(state.products),demoCatalogRestored:true};
  if(state.categories){
   const used=new Set(restored.products.flatMap(p=>p.categoryKeys||[]));
   const known=new Set(state.categories.map(item=>item.slug));
   restored.categories=[...state.categories,...Object.values(demoCategoryCorrections).map(item=>item.category).filter(item=>{
    if(!used.has(item.slug)||known.has(item.slug))return false;
    known.add(item.slug);return true;
   })];
  }
  try{save(restored);}catch{return restored;}
  return restored;
 }
 function save(state){
  try{localStorage.setItem(key,JSON.stringify(state));}
  catch{throw Error('O armazenamento de teste está cheio. Use imagens menores ou restaure o catálogo de exemplo.');}
 }
 const categoriesFor=state=>state.categories??Object.entries(window.ECLIPSE_DEPARTMENTS||{}).flatMap(([audience,dept])=>
  dept.groups.flatMap(group=>group.items.map(item=>({...item,audience}))));
 const categoryInfo=state=>Object.fromEntries(categoriesFor(state).map(item=>[item.slug,item]));
 const categoryKey=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 async function digest(value){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 }
 const money=value=>Math.round(Number(value)*100)/100;
 const photo=value=>typeof value==='string'&&(/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(value));
 function prepare(data,id,old,state){
  const name=String(data.name||'').trim(),sku=String(data.sku||'').trim();
  const categories=categoryInfo(state);
  if(!name||!sku||!data.variants?.length)throw Error('Informe nome, referência e pelo menos uma cor com tamanho.');
  if(!data.categoryKeys?.length||data.categoryKeys.some(category=>!Object.hasOwn(categories,category)))throw Error('Selecione uma categoria.');
  const seen=new Set();
  let nextId=Math.max(id*1000,...(old?.variants||[]).map(v=>v.id))+1;
  const variants=data.variants.map(v=>{
   const Cor=String(v.attributes?.Cor||'').trim(),Tamanho=String(v.attributes?.Tamanho||'').trim();
   const key=JSON.stringify([Cor.toLowerCase(),Tamanho.toLowerCase()]);
   const regular=money(v.regular),price=data.sale?money(v.price):regular;
   if(!Cor||!Tamanho||seen.has(key)||!Number.isFinite(regular)||!Number.isFinite(price)||price<0||price>regular)throw Error('Confira cores, tamanhos e preços das combinações.');
   seen.add(key);
   return {...v,id:old?.variants?.some(item=>item.id===v.id)?v.id:nextId++,attributes:{Cor,Tamanho},label:Cor+' · '+Tamanho,
    regular,price,available:!!v.available,max:null,image:(data.colorImages?.[Cor]||[]).find(photo)||''};
  });
  const colorImages=Object.fromEntries(Object.entries(data.colorImages||{}).map(([color,urls])=>[color,urls.filter(photo).slice(0,5)]));
  const images=(Object.values(colorImages).find(urls=>urls.length)||data.images||[]).filter(photo).slice(0,5);
  const sale=variants.some(v=>v.price<v.regular);
  const now=Date.now()/1000;
  return {...data,id,name,sku,brand:String(data.brand||''),variants,colorImages,images,image:images[0]||'',
   categories:data.categoryKeys.map(category=>categories[category].name),type:'variable',published:data.published!==false,
   available:variants.some(v=>v.available),price:Math.min(...variants.map(v=>v.price)),regular:Math.min(...variants.map(v=>v.regular)),
   sale,offerAt:sale?(old?.sale?(old.offerAt||old.arrivedAt):now):0,arrivedAt:old?.arrivedAt||now};
 }
 function prepareCombo(data,id,old,state){
  const products=state.products;
  if(!Array.isArray(data.basket)||data.basket.length<2||data.basket.length>20)throw Error('Escolha de 2 a 20 produtos.');
  const selected=data.basket.map(entry=>{
   const product=products.find(p=>p.id===entry.id&&!p.basket&&p.published!==false);
   const variants=product?.variants.filter(v=>entry.variantIds.includes(v.id));
   if(!variants?.length)throw Error('Escolha pelo menos um tamanho por produto.');
   return {product,variants};
  });
  const first=selected[0].product;
  const regular=money(selected.reduce((sum,{variants})=>sum+Math.min(...variants.map(v=>v.regular)),0));
  if(!(data.price>0&&data.price<regular))throw Error('O preço do combo deve ser menor que a soma dos preços normais.');
  return prepare({...data,sku:old?.sku||'COMBO-'+id,brand:'Eclipse',modelType:'combo',sale:true,
   audiences:first.audiences,categoryKeys:first.categoryKeys,recommendationAudiences:first.recommendationAudiences,
   description:'Inclui: '+selected.map(({product})=>product.name).join(', '),images:[first.image],
   variants:[{id:old?.variants?.[0]?.id,attributes:{Cor:'Conjunto',Tamanho:'Único'},regular,price:data.price,available:true}]},id,old,state);
 }
 function catalog(state){
  const records=copy(state.products),index=new Map(records.map(p=>[p.id,p]));
  for(const p of records){
   p.isNew=!p.basket&&Date.now()/1000-p.arrivedAt<30*86400;
   if(!p.basket)continue;
   p.basketOptions=p.basket.map(entry=>{
    const item=index.get(entry.id);
    const ids=entry.variantIds||[entry.variantId];
    const variants=item?.published!==false?item?.variants.filter(v=>v.available&&ids.includes(v.id))||[]:[];
    return {name:item?.name||'Produto indisponível',image:item?.image||'',variants:variants.map(v=>({id:v.id,label:v.label,color:v.attributes.Cor,size:v.attributes.Tamanho}))};
   });
   p.available=p.basketOptions.every(option=>option.variants.length);
   p.variants[0].available=p.available;
  }
  return records;
 }
 function validatedBackup(body){
  const invalid=()=>{throw Error('Arquivo de catálogo inválido. O catálogo atual foi preservado.');};
  if(body.schema!=='eclipse-prototype-v1'||!Array.isArray(body.products))invalid();
  if(body.products.length>maxProducts)throw Error('O backup excede o limite de 2.000 modelos. O catálogo atual foi preservado.');
  const productIds=new Set(),skus=new Set();
  return body.products.map(product=>{
   if(!product||!Number.isSafeInteger(product.id)||product.id<1||productIds.has(product.id)||
      typeof product.name!=='string'||!product.name.trim()||typeof product.sku!=='string'||!product.sku.trim()||
      skus.has(product.sku.toLowerCase())||!Array.isArray(product.audiences)||!Array.isArray(product.categoryKeys)||
      !Array.isArray(product.variants)||!product.variants.length||product.variants.length>999)invalid();
   productIds.add(product.id);skus.add(product.sku.toLowerCase());
   const variantIds=new Set();
   for(const v of product.variants){
    if(!v||!Number.isSafeInteger(v.id)||v.id<1||variantIds.has(v.id)||
       typeof v.attributes?.Cor!=='string'||!v.attributes.Cor.trim()||
       typeof v.attributes?.Tamanho!=='string'||!v.attributes.Tamanho.trim()||
       !Number.isFinite(v.price)||!Number.isFinite(v.regular)||v.price<0||v.regular<v.price||
       typeof v.available!=='boolean')invalid();
    variantIds.add(v.id);
   }
   if(product.basket&&(!Array.isArray(product.basket)||product.basket.length<2||product.basket.length>20||
      product.basket.some(entry=>!entry||!Number.isSafeInteger(entry.id)||
       !(Array.isArray(entry.variantIds)?entry.variantIds:[entry.variantId]).every(Number.isSafeInteger))))invalid();
   const images=Array.isArray(product.images)?product.images.filter(photo).slice(0,5):[];
   const colorImages=Object.fromEntries(Object.entries(product.colorImages||{}).map(([color,urls])=>
    [color,Array.isArray(urls)?urls.filter(photo).slice(0,5):[]]));
   return {...product,brand:typeof product.brand==='string'?product.brand:'',
    categories:Array.isArray(product.categories)?product.categories.filter(value=>typeof value==='string'):[],
    recommendationAudiences:Array.isArray(product.recommendationAudiences)?product.recommendationAudiences:product.audiences,
    price:Math.min(...product.variants.map(v=>v.price)),regular:Math.min(...product.variants.map(v=>v.regular)),
    image:photo(product.image)?product.image:images[0]||'',images,colorImages};
  });
 }
 async function request(path,options={}){
  const state=read(),method=options.method||'GET',body=typeof options.body==='string'?JSON.parse(options.body):{};
  const user=sessionStorage.getItem(sessionKey);
  const matchesPassword=async(name,password)=>Object.hasOwn(state.users,name)&&
   (name==='admin'&&state.users.admin==='admin'?password==='admin':state.users[name]===await digest(password));
  if(path==='login'){
   if(!await matchesPassword(body.username,body.password))throw Error('Usuário ou senha incorretos.');
   sessionStorage.setItem(sessionKey,body.username);
   return {username:body.username,csrf:'demo'};
  }
  if(path==='restore-login'){
   state.users.admin='admin';save(state);sessionStorage.removeItem(sessionKey);return {ok:true};
  }
  if(!user||!Object.hasOwn(state.users,user))throw Error('Entre no painel de demonstração.');
  if(path==='session')return {username:user,csrf:'demo'};
  if(path==='logout'){sessionStorage.removeItem(sessionKey);return {ok:true};}
  if(path==='products'&&method==='GET')return {products:catalog(state)};
  if(path==='categories'){
   const categories=categoriesFor(state);
   if(method==='GET')return categories;
   if(method==='POST'){
    const name=String(body.name??'').trim(),audience=body.audience,key=categoryKey(name);
    if(!Object.hasOwn(window.ECLIPSE_DEPARTMENTS||{},audience)||!key||name.length>80)throw Error('Informe um departamento e um nome de até 80 caracteres.');
    if(categories.some(item=>item.audience===audience&&categoryKey(item.name)===key))throw Error('Já existe uma categoria com esse nome neste departamento.');
    state.categories=[...categories,{slug:audience+'-loja-'+key,name,audience}];
   }else if(method==='DELETE'){
    if(state.products.some(p=>p.categoryKeys?.includes(body.slug)))throw Error('Mova os produtos vinculados antes de remover a categoria.');
    state.categories=categories.filter(item=>item.slug!==body.slug);
   }else throw Error('Operação de categorias inválida.');
   save(state);
   return state.categories;
  }
  if(path==='settings'){
   if(method==='GET')return state.settings;
   const phone=String(body.phone||'').replace(/[^0-9]/g,'');
   const storeAddress=String(body.storeAddress||'').trim();
   if(phone&&!/^[1-9][0-9]{9,14}$/.test(phone))throw Error('Use o código do país, DDD e número ou deixe o WhatsApp em branco.');
   if(!storeAddress)throw Error('Informe um endereço de teste.');
   for(const field of ['instagram','facebook']){
    if(body[field]&&!/^https:\/\//i.test(body[field]))throw Error('Use links que comecem com https:// nas redes sociais.');
   }
   state.settings={phone,storeAddress,instagram:String(body.instagram||''),facebook:String(body.facebook||'')};
   save(state);return state.settings;
  }
  if(path==='users'){
   if(user!=='admin')throw Error('Apenas a conta principal gerencia usuários.');
   if(method==='GET')return {users:Object.keys(state.users)};
   const name=String(body.username||'').trim().toLowerCase();
   if(!/^[a-z][a-z0-9._-]{2,39}$/.test(name)||name==='admin')throw Error('Informe outro usuário válido.');
   if(method==='DELETE')delete state.users[name];
   else{
    if(Object.hasOwn(state.users,name)||String(body.password||'').length<12)throw Error('Informe um usuário novo e uma senha de pelo menos 12 caracteres.');
    state.users[name]=await digest(body.password);
   }
   save(state);return {username:name};
  }
  if(path==='password'){
   if(!await matchesPassword(user,body.current))throw Error('Senha atual incorreta.');
   if(typeof body.password!=='string'||body.password.length<12||body.password.length>128||body.password.trim()!==body.password)throw Error('Use de 12 a 128 caracteres, sem espaços nas bordas.');
   state.users[user]=await digest(body.password);save(state);sessionStorage.removeItem(sessionKey);return {ok:true};
  }
  if(path==='images'){
   const file=options.body;
   if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>1024*1024)throw Error('Na demonstração use JPEG, PNG ou WebP de até 1 MB.');
   const url=await new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Falha ao ler a imagem.'));reader.readAsDataURL(file);
   });
   return {url};
  }
  if(path==='export')return {schema:'eclipse-prototype-v1',products:state.products,settings:state.settings,categories:categoriesFor(state)};
  if(path==='import'){
   const products=validatedBackup(body);
   const categories=body.categories??categoriesFor(state);
   const valid=Array.isArray(categories)&&categories.every(item=>item&&typeof item.slug==='string'&&/^[a-z0-9-]+$/.test(item.slug)&&typeof item.name==='string'&&item.name.trim()&&item.name.length<=80&&Object.hasOwn(window.ECLIPSE_DEPARTMENTS||{},item.audience));
   const slugs=new Set(valid?categories.map(item=>item.slug):[]);
   if(!valid||slugs.size!==categories.length||products.some(p=>p.categoryKeys.some(slug=>!slugs.has(slug))))throw Error('O backup contém categorias inválidas ou ausentes.');
   state.categories=categories;state.products=products;state.demoCatalogRestored=false;save(state);localStorage.removeItem('eclipse-demo-cart-v5');return {count:state.products.length};
  }
  if(path==='clear-catalog'&&method==='POST'){
   state.lastProductId=Math.max(state.lastProductId||0,...state.products.map(p=>p.id));state.products=[];save(state);localStorage.removeItem('eclipse-demo-cart-v5');return {ok:true};
  }
  if(path==='reset'){
   localStorage.removeItem(key);localStorage.removeItem('eclipse-demo-cart-v5');sessionStorage.removeItem(sessionKey);return {ok:true};
  }
  if(path==='products'||path.startsWith('products/')){
   if(method==='POST'&&state.products.length>=maxProducts)throw Error('O catálogo aceita até 2.000 modelos.');
   const id=method==='POST'?Math.max(state.lastProductId||0,...state.products.map(p=>p.id))+1:Number(path.split('/')[1]);
   const old=state.products.find(p=>p.id===id);
   if(method!=='POST'&&!old)throw Error('Produto não encontrado.');
   if(method==='DELETE'){state.products=state.products.filter(p=>p.id!==id);save(state);return {ok:true};}
   let record;
   if(body.basket)record=prepareCombo(body,id,old,state);
   else if(body.availability){
    record={...old,variants:old.variants.map(v=>({...v,available:body.availability[v.id]??v.available}))};
    record.available=record.variants.some(v=>v.available);
   }else if(body.offer){
    const {mode,value}=body.offer;
    if(!['remove','percent','amount'].includes(mode)||(mode!=='remove'&&!(value>0)))throw Error('Informe um desconto válido.');
    record=prepare({...old,sale:mode!=='remove',variants:old.variants.map(v=>({...v,price:mode==='remove'?v.regular:mode==='percent'?v.regular*(1-value/100):v.regular-value}))},id,old,state);
   }else record=prepare(body,id,old,state);
   if(state.products.some(p=>p.id!==id&&p.sku.toLowerCase()===record.sku.toLowerCase()))throw Error('Essa referência já está em uso.');
   state.products=old?state.products.map(p=>p.id===id?record:p):[...state.products,record];
   state.lastProductId=Math.max(state.lastProductId||0,id);save(state);return record;
  }
  throw Error('Ação indisponível na demonstração.');
 }
 window.ECLIPSE_PUBLIC_ADMIN={request,categories:()=>categoriesFor(read()),products:()=>catalog(read()).filter(p=>p.published!==false),settings:()=>read().settings,defaultLogin:()=>read().users.admin==='admin'};
})();

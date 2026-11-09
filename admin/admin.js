(() => {
'use strict';
const bySize=(a,b)=>window.eclipseCompareSizes(a.attributes.Tamanho,b.attributes.Tamanho);
const root=document.getElementById('admin-app'),departments=window.ECLIPSE_DEPARTMENTS||{};
let D=departments,categories=[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
const publicDemo=window.ECLIPSE_PUBLIC_ADMIN;
const demoNotice=publicDemo?'<p class="admin-demo-notice" role="note">Demonstração • sem dados reais. Direitos do site: © 2026 Gustavo Henrique De Inocencio Ribeiro</p>':'';
const logo=publicDemo?(window.ECLIPSE_CONFIG?.assets||'/assets/')+'eclipse-logo-transparente-v2.png':'../../../Desenvolvimento/WordPress/eclipse-catalogo/assets/eclipse-logo-transparente-v2.png';
const storefront=publicDemo?(window.ECLIPSE_CONFIG?.homeUrl||'/'):'/loja/';
let bindingController=null;
let saveAction=null;
let csrf='',user='',products=[],view='dashboard',search='',page=1,editing=null,variants=[],colorImages={},photoColor='';
const $=s=>root.querySelector(s);const perPage=20;
async function api(path,options={}){
 if(publicDemo)return publicDemo.request(path,options);
 const response=await fetch('/api/v1/admin/'+path,{credentials:'same-origin',...options,headers:{...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...(options.method&&options.method!=='GET'?{'X-CSRF-Token':csrf}:{}),...options.headers}});
 const data=await response.json();if(!response.ok){if(response.status===401&&path!=='login')login('Sua sessão terminou. Entre novamente.');throw Error(data.message||'Não foi possível concluir.');}return data;
}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('on');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast')?.classList.remove('on'),3500);}
function login(message=''){
 root.innerHTML=`<main class="login"><div class="login-brand"><img src="${logo}" alt="Eclipse"><h1>Seu catálogo.<br>Do seu jeito.</h1><p>Organize os produtos, cuide da disponibilidade e prepare as próximas novidades da Eclipse.</p></div><div class="login-panel"><h2>Administração Eclipse</h2>${demoNotice}${publicDemo?'<p>Teste o painel com dados de exemplo. As alterações ficam neste navegador.</p>':'<p>Acesso exclusivo da equipe. A sessão tem duração de quatro horas.</p>'}<form id="login-form"><label class="field">Usuário<input id="username" autocomplete="username" required value="admin"></label><label class="field">Senha<input id="password" type="password" autocomplete="current-password" required></label><p class="error" id="login-error">${esc(message)}</p><button class="button" type="submit">Entrar no painel ↗</button></form>${publicDemo?`<div class="notice demo-credentials"><strong>Acesso de teste</strong><div>Usuário <code>admin</code> · ${publicDemo.defaultLogin()?'Senha <code>admin</code>':'Use a senha definida neste navegador.'}</div>${publicDemo.defaultLogin()?'':'<button type="button" class="text-button" id="restore-demo-login">Restaurar senha de teste</button>'}</div>`:'<p class="helper">No primeiro início, a senha é gerada e exibida no terminal do protótipo.</p>'}<a class="text-button" href="${storefront}">Voltar para a loja</a></div></main>`;
 $('#restore-demo-login')?.addEventListener('click',async()=>{await api('restore-login',{method:'POST'});login('Senha de teste restaurada.');});
 $('#login-form').addEventListener('submit',async event=>{event.preventDefault();const button=$('#login-form button');button.disabled=true;try{const session=await api('login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});csrf=session.csrf;user=session.username;await start();}catch(error){$('#login-error').textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}});
}
function shell(){root.innerHTML=`<div class="layout"><aside class="sidebar"><a class="brand" href="${storefront}" target="_blank" rel="noopener"><img src="${logo}" alt="Eclipse"><small>ADMINISTRAÇÃO</small></a><button id="adm-menu" type="button" aria-controls="adm-navigation" aria-expanded="false">☰ Menu</button><div id="adm-navigation"><nav aria-label="Administração">${[['dashboard','Painel'],['products','Produtos'],['categories','Categorias'],['stock','Disponibilidade'],['offers','Ofertas'],['new','Lançamentos'],['settings','Configurações'],['backups','Backups'],...(user==='admin'?[['users','Usuários']]:[])].map(([key,label])=>`<button data-view="${key}" class="${view===key?'active':''}">${label}</button>`).join('')}</nav><div class="sidebar-bottom">${publicDemo?'<button id="reset-demo" class="text-button">Restaurar demonstração</button>':''}<span>Conectado: ${esc(user)}</span><button id="logout" class="text-button">Sair</button></div></div></aside><main class="main"><div class="topline"><span>${publicDemo?'DEMONSTRAÇÃO · ALTERAÇÕES NESTE NAVEGADOR':'PROTÓTIPO LOCAL · ECLIPSE'}</span><a href="${storefront}" target="_blank" rel="noopener">Abrir loja ↗</a></div>${demoNotice}<div id="content"></div></main></div><dialog id="editor" aria-labelledby="editor-title"><form id="product-form"><div class="dialog-header"><h2 id="editor-title">Produto</h2><button type="button" data-close aria-label="Fechar edição">×</button></div><div id="editor-body" class="editor-body"></div><div class="dialog-footer"><p id="editor-error" class="error" role="alert"></p><div><button type="button" class="text-button" data-close>Cancelar</button><button id="save-product" type="submit" class="button lime">Salvar produto ↗</button></div></div></form></dialog><dialog id="confirm-dialog" aria-labelledby="confirm-title"><div class="editor-body"><h2 id="confirm-title"></h2><p id="confirm-text" class="helper"></p><div class="checks"><button id="confirm-no" type="button" class="button outline">Cancelar</button><button id="confirm-yes" type="button" class="button">Confirmar</button></div></div></dialog><div id="toast" role="status"></div>`;bind();}
async function reload(){
 const [catalog,registry]=await Promise.all([api('products'),api('categories')]);
 products=catalog.products;
 categories=registry;
 D=Object.fromEntries(Object.entries(departments).map(([audience,dept])=>{
  const known=new Set(dept.groups.flatMap(group=>group.items.map(item=>item.slug)));
  const active=new Set(categories.filter(item=>item.audience===audience).map(item=>item.slug));
  const groups=dept.groups.map(group=>({...group,items:group.items.filter(item=>active.has(item.slug))})).filter(group=>group.items.length);
  const custom=categories.filter(item=>item.audience===audience&&!known.has(item.slug));
  if(custom.length)groups.push({name:'Categorias da loja',items:custom});
  return [audience,{...dept,groups}];
 }));
}
async function start(){view='dashboard';await reload();shell();render();}
const totalStock=p=>p.variants.filter(v=>v.available).length;
function render(){root.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));if(view==='dashboard')dashboard();else if(view==='categories')renderCategories();else if(view==='settings')settings();else if(view==='backups')backups();else if(view==='users'&&user==='admin')renderUsers();else productList();}
function renderCategories(){
 const previousSearch=$('#category-search')?.value||'';
 const previousDepartment=$('#category-filter')?.value||'';
 const departmentOptions=Object.entries(departments).map(([slug,d])=>`<option value="${esc(slug)}">${esc(d.label)}</option>`).join('');
 const counts=new Map();
 for(const product of products){
  for(const slug of new Set(product.categoryKeys||[]))counts.set(slug,(counts.get(slug)||0)+1);
 }
 const sorted=categories.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 $('#content').innerHTML=heading('Categorias','Organize as categorias do catálogo por departamento.')+`
 <details class="product-section">
  <summary>Adicionar categoria +</summary>
  <form id="category-form">
   <div class="editor-grid">
    <label class="field">Departamento<select id="category-audience" required>${departmentOptions}</select></label>
    <label class="field">Nome da categoria<input id="category-name" required maxlength="80"></label>
   </div>
   <button class="button lime">Adicionar categoria</button>
  </form>
 </details>
 <div class="catalog-tools">
  <label class="field">Buscar<input id="category-search" type="search" placeholder="Nome da categoria" value="${esc(previousSearch)}"></label>
  <label class="field">Departamento<select id="category-filter"><option value="">Todos</option>${departmentOptions}</select></label>
 </div>
 <p id="category-count" class="helper" role="status"></p>
 <div id="product-list"></div>`;
 const searchInput=$('#category-search');
 const filter=$('#category-filter');
 filter.value=previousDepartment;
 $('#category-audience').value=filter.value||$('#category-audience').options[0].value;
 function renderCategoryRows(){
  const term=searchKey(searchInput.value);
  const rows=sorted.filter(item=>(!filter.value||item.audience===filter.value)&&searchKey(item.name).includes(term));
  $('#category-count').textContent=rows.length===1?'1 categoria':rows.length+' categorias';
  $('#product-list').innerHTML=rows.length?`<div class="table-scroll"><table><thead><tr>
   <th>Categoria</th><th>Produtos vinculados</th><th>Situação</th><th>Ações</th>
  </tr></thead><tbody>${rows.map(item=>{
   const count=counts.get(item.slug)||0;
   return `<tr>
    <td><span class="name">${esc(item.name)}</span><small>${esc(departments[item.audience]?.label||item.audience)}</small></td>
    <td>${count} ${count===1?'produto':'produtos'}</td>
    <td>${count?'<span class="pill">Em uso</span>':'<span class="pill gray">Sem produtos</span>'}</td>
    <td><div class="row-actions">${count?'<small>Mova os produtos vinculados para remover.</small>':`<button type="button" class="danger" data-remove-category="${esc(item.slug)}" aria-label="Remover ${esc(item.name)}">Remover</button>`}</div></td>
   </tr>`;
  }).join('')}</tbody></table></div>`:'<div class="empty">Nenhuma categoria encontrada.</div>';
 }
 searchInput.oninput=renderCategoryRows;
 filter.onchange=renderCategoryRows;
 renderCategoryRows();
 $('#category-form').onsubmit=async event=>{
  event.preventDefault();
  const button=event.currentTarget.querySelector('button');
  button.disabled=true;
  try{
   await api('categories',{method:'POST',body:JSON.stringify({audience:$('#category-audience').value,name:$('#category-name').value})});
   await reload();if(view==='categories')renderCategories();toast('Categoria adicionada.');
  }catch(error){toast(error.message);}finally{button.disabled=false;}
 };
}
function heading(title,description,add=false){return `<div class="heading"><div><h1>${title}</h1><p>${description}</p></div>${add?'<button class="button lime" id="new-product">Adicionar produto +</button>':''}</div>`;}
function dashboard(){
 const models=products.filter(p=>!p.basket);
 const visible=models.filter(p=>p.published!==false);
 const promotions=visible.filter(p=>p.sale);
 const unavailable=models.filter(p=>!p.available);
 const combos=products.filter(p=>p.basket&&p.sale);
 const recent=models.slice().sort((a,b)=>b.arrivedAt-a.arrivedAt||b.id-a.id).slice(0,4);
 const stats=[
  [models.length,'Modelos cadastrados','products'],
  [visible.length,'Produtos publicados','products','published'],
  [models.length-visible.length,'Produtos ocultos','products','hidden'],
  [unavailable.length,'Modelos indisponíveis','stock','unavailable'],
  [promotions.length,'Promoções publicadas','offers','published'],
  [combos.length,'Combos','offers','','combos'],
  [models.filter(p=>p.isNew).length,'Lançamentos','new'],
  [models.filter(p=>p.available).length,'Modelos disponíveis','stock','available']
 ];
 const preview=(list,action,empty)=>list.length?`<ul class="dashboard-list">${list.map(p=>`<li>
  <div><strong>${esc(p.name)}</strong><small>${esc(p.sku)} · ${esc(p.brand||'Eclipse')}</small></div>
  ${action==='edit'? `<button class="text-button" data-edit="${p.id}">Editar</button>`:`<button class="text-button" data-stock="${p.id}">Revisar</button>`}
 </li>`).join('')}</ul>`:`<p class="helper">${empty}</p>`;
 $('#content').innerHTML=heading('Visão geral','Acompanhe o catálogo e vá direto às tarefas da loja.',true)+`
  <section class="dashboard-actions" aria-labelledby="dash-actions-title">
   <h2 id="dash-actions-title">Ações rápidas</h2>
   <div class="dashboard-links">
    <button class="button outline" data-view="products">Buscar produto</button>
    <button class="button outline" id="add-offer" data-view="offers">Criar promoção</button>
    <button class="button outline" id="add-basket" data-view="offers" data-offers-filter="combos">Criar combo</button>
    <button class="button outline" data-view="stock">Atualizar disponibilidade</button>
    ${publicDemo?'<button class="button outline danger" id="clear-demo-catalog">Limpar catálogo de teste</button>':''}
   </div>
  </section>
  <div class="stats">${stats.map(([value,label,destination,status='',kind=''])=>`
   <button class="stat stat-link" type="button" data-view="${destination}" data-status-filter="${status}" data-offers-filter="${kind}">
    <strong>${value}</strong><span>${label}</span><span class="stat-arrow" aria-hidden="true">↗</span>
   </button>`).join('')}</div>
  <div class="dashboard-grid">
   <section class="card"><h2>Cadastros mais recentes</h2>${preview(recent,'edit','Nenhum produto cadastrado.')}</section>
   <section class="card"><h2>Disponibilidade para revisar</h2>${preview(unavailable.slice(0,4),'stock','Todos os modelos têm pelo menos um tamanho disponível.')}
    ${unavailable.length>4?'<button class="text-button" data-view="stock" data-status-filter="unavailable">Ver todos os indisponíveis ↗</button>':''}</section>
  </div>
  <div class="dashboard-links">
   <button class="button outline" data-view="settings">Editar contatos da loja</button>
   <button class="button outline" data-view="backups">Exportar ou restaurar catálogo</button>
   ${user==='admin'?'<button class="button outline" data-view="users">Gerenciar usuários</button>':''}
  </div>`;
}
async function renderUsers(){
 $('#content').innerHTML=heading('Usuários','Acessos da equipe da Eclipse.')+'<p>Carregando usuários…</p>';
 try{
  const {users}=await api('users');
  if(view!=='users')return;
  $('#content').innerHTML=heading('Usuários','A conta principal gerencia os acessos da equipe.')+`
   <div class="settings-grid">
    <form class="card" id="create-user">
     <h2>Adicionar administrador</h2>
     <label class="field">Usuário<input id="new-username" autocomplete="off" required maxlength="40" placeholder="Ex.: loja.maria"></label>
     <label class="field">Senha inicial<input id="new-user-password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label>
     <p class="helper">Use pelo menos 12 caracteres. O usuário pode trocar a própria senha em Configurações.</p>
     <p id="user-error" class="error" role="alert"></p>
     <button class="button lime" type="submit">Adicionar usuário</button>
    </form>
    <section class="card"><h2>Contas cadastradas</h2>
     <ul class="user-list">${users.map(name=>`<li><span>${esc(name)}</span>${name==='admin'?'<span class="pill">Conta principal</span>':`<button class="text-button" type="button" data-remove-user="${esc(name)}">Remover</button>`}</li>`).join('')}</ul>
    </section>
   </div>`;
  $('#create-user').onsubmit=async event=>{
   event.preventDefault();
   const form=event.currentTarget;
   const button=form.querySelector('button');
   button.disabled=true;
   try{
    await api('users',{method:'POST',body:JSON.stringify({username:$('#new-username').value,password:$('#new-user-password').value})});
    await renderUsers();
    toast('Usuário adicionado.');
   }catch(error){if(form.isConnected)$('#user-error').textContent=error.message;}
   finally{button.disabled=false;}
  };
 }catch(error){if(view==='users'&&$('#content'))$('#content').textContent=error.message;}
}
let offerType='promotions';
const listFilters={department:'',status:'',order:'recent'};
const searchKey=value=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const matchesProductSearch=(product,term)=>searchKey([product.name,product.brand,product.sku].join(' ')).includes(term);
function filtered(){
 const term=searchKey(search);
 const rows=products.filter(p=>{
  if(view==='offers'&&(!p.sale||Boolean(p.basket)!==(offerType==='combos')))return false;
  if(view==='new'&&(!p.isNew||p.basket))return false;
  if((view==='products'||view==='stock')&&p.basket)return false;
  if(listFilters.department&&!p.audiences.includes(listFilters.department))return false;
  if(listFilters.status==='published'&&p.published===false)return false;
  if(listFilters.status==='hidden'&&p.published!==false)return false;
  if(listFilters.status==='available'&&!p.available)return false;
  if(listFilters.status==='unavailable'&&p.available)return false;
  return matchesProductSearch(p,term);
 });
 return rows.sort(listFilters.order==='name'
  ?(a,b)=>a.name.localeCompare(b.name,'pt-BR')
  :(a,b)=>b.arrivedAt-a.arrivedAt||b.id-a.id);
}
function productList(){
 const titles={
  products:['Produtos','Cadastre e edite os produtos do catálogo.'],
  stock:['Disponibilidade','Altere o status de cada cor e tamanho.'],
  offers:['Ofertas','Gerencie descontos e combos.'],
  new:['Lançamentos','Produtos cadastrados nos últimos 30 dias.']
 };
 const [title,description]=titles[view];
 $('#content').innerHTML=heading(title,description,view==='products')+
  (view==='offers'?`<div class="checks offer-switch" aria-label="Tipo de oferta">
   <button type="button" class="button outline" data-offer-type="promotions" aria-pressed="${offerType==='promotions'}">Promoções</button>
   <button type="button" class="button outline" data-offer-type="combos" aria-pressed="${offerType==='combos'}">Combos</button>
  </div><div class="checks">${offerType==='combos'?'<button class="button lime" id="add-basket">Criar combo</button>':'<button class="button lime" id="add-offer">Adicionar produto em oferta</button>'}</div>`:'')+`
  <div class="catalog-tools">
   <label class="field">Buscar<input id="admin-search" type="search" placeholder="Nome, marca ou referência" value="${esc(search)}"></label>
   <label class="field">Departamento<select id="filter-department"><option value="">Todos</option>${Object.entries(D).map(([key,department])=>`<option value="${esc(key)}">${esc(department.label)}</option>`).join('')}</select></label>
   <label class="field">Status<select id="filter-status"><option value="">Todos</option><option value="published">Publicado</option><option value="hidden">Oculto</option><option value="available">Disponível</option><option value="unavailable">Indisponível</option></select></label>
   <label class="field">Ordenar<select id="filter-order"><option value="recent">Mais recentes</option><option value="name">Nome A–Z</option></select></label>
  </div>
  <p id="count" class="helper" role="status"></p><div id="product-list"></div>`;
 $('#admin-search').oninput=event=>{search=event.target.value;page=1;renderRows();};
 for(const key of Object.keys(listFilters)){
  const input=$('#filter-'+key);
  input.value=listFilters[key];
  input.onchange=()=>{listFilters[key]=input.value;page=1;renderRows();};
 }
 renderRows();
}
function renderRows(){const all=filtered(),pages=Math.max(1,Math.ceil(all.length/perPage));page=Math.min(page,pages);$('#count').textContent=all.length+' modelos';const rows=all.slice((page-1)*perPage,page*perPage);$('#product-list').innerHTML=rows.length?`<div class="table-scroll"><table><thead><tr><th>Produto</th><th>Preço</th><th>Disponibilidade</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${rows.map(p=>`<tr><td><div class="product-cell">${p.image?`<img src="${esc(p.image)}" alt="">`:''}<div><span class="name">${esc(p.name)}</span><small>${esc(p.sku)} · ${esc(p.brand)}</small></div></div></td><td>${money(p.price)}${p.sale?`<small>De ${money(p.regular)}</small>`:''}</td><td>${totalStock(p)} de ${p.variants.length} combinações disponíveis</td><td>${p.published===false?'<span class="pill gray">Oculto</span>':p.available?'<span class="pill">Publicado</span>':'<span class="pill orange">Esgotado</span>'}${p.sale?'<small>Oferta</small>':''}${p.isNew?'<small>Lançamento</small>':''}</td><td><div class="row-actions">${view==='products'?`<button data-edit="${p.id}">Editar</button><button data-delete="${p.id}" class="danger">Remover</button>`:view==='stock'?`<button data-stock="${p.id}">Alterar disponibilidade</button>`:view==='offers'?(p.basket?`<button data-edit-combo="${p.id}">Editar combo</button><button data-delete="${p.id}">Remover combo</button>`:`<button data-offer="${p.id}">Editar desconto</button><button data-offer-remove="${p.id}">Retirar oferta</button>`):new Date(p.arrivedAt*1000).toLocaleDateString('pt-BR')}</div></td></tr>`).join('')}</tbody></table></div><div class="pagination"><button id="previous" ${page===1?'disabled':''}>← Anterior</button><span>${page} / ${pages}</span><button id="next" ${page===pages?'disabled':''}>Próxima →</button></div>`:'<div class="empty">Nenhum produto encontrado.</div>';}
function clone(value){return JSON.parse(JSON.stringify(value));}
function openEditor(id){saveAction=null;$('#editor').classList.remove('combo-editor');$('#editor-body').onclick=null;editing=products.find(p=>p.id===id)||null;const p=editing||{name:'',sku:'',brand:'',description:'',audiences:['homem'],recommendationAudiences:['homem'],categoryKeys:['masc-camisetas'],modelType:'camiseta',price:0,regular:0,sale:false,isNew:true,published:true,variants:[]};variants=clone(p.variants);colorImages=clone(p.colorImages||{});if(!Object.keys(colorImages).length){const colors=[...new Set(variants.map(v=>v.attributes.Cor))];for(const color of colors){const matching=variants.filter(v=>v.attributes.Cor===color);colorImages[color]=matching[0]?.image===p.image?(p.images||[]).slice(0,5):[...new Set(matching.map(v=>v.image).filter(Boolean))].slice(0,5);}}photoColor=variants[0]?.attributes.Cor||'Preto';$('#editor-title').textContent=editing?'Editar produto':'Novo produto';$('#editor-error').textContent='';$('#editor-body').innerHTML=`<div class="editor-grid"><label class="field full">Nome do produto *<input id="p-name" maxlength="180" required value="${esc(p.name)}"></label><label class="field">Referência / SKU *<input id="p-sku" maxlength="60" required value="${esc(p.sku)}"></label><label class="field">Marca<input id="p-brand" maxlength="100" value="${esc(p.brand)}"></label><label class="field full">Descrição<textarea id="p-description" maxlength="3000">${esc(p.description||'')}</textarea></label></div><h3 class="section-title">Organização e vitrine</h3><div class="checks" id="p-audiences">${Object.entries(D).map(([slug,d])=>`<label><input type="checkbox" value="${slug}" ${p.audiences.includes(slug)?'checked':''}> ${esc(d.label)}</label>`).join('')}</div><div class="editor-grid"><label class="field">Categoria *<select id="p-categories" multiple size="7" required></select></label><div><label class="field">Preferência nos destaques<select id="p-recommendation"><option value="auto">Usar departamentos selecionados</option><option value="homem">Masculino</option><option value="mulher">Feminino</option><option value="both">Masculino e feminino (unissex)</option><option value="infantil">Infantil / juvenil</option></select></label><label class="field">Tipo do modelo<input id="p-type" value="${esc(p.modelType)}" placeholder="tenis, camiseta, camisa, calca…"></label></div></div><div class="checks"><label><input id="p-published" type="checkbox" ${p.published!==false?'checked':''}> Publicado na loja</label></div><h3 class="section-title">Cores e tamanhos</h3><div class="editor-grid"><label class="field">Preço normal padrão (R$)<input id="p-normal" type="number" min="0" step="0.01" value="${p.regular}"></label></div><button type="button" class="text-button" id="apply-prices">Aplicar estes preços a todas as variações</button><div class="bulk color-builder"><label class="field">Cor<input id="bulk-colors" maxlength="100" placeholder="Ex.: Preto"></label><label class="field">Tamanhos desta cor<input id="bulk-sizes" placeholder="Ex.: P, M, G, GG"></label><button type="button" class="button outline" id="generate-variants">Adicionar cor e tamanhos</button></div><p class="helper">Adicione uma cor por vez. Clique em um tamanho para editar seu nome ou preço. Verde indica disponível e cinza indica indisponível.</p><div id="variants"></div><h3 class="section-title">Até 5 fotos por cor</h3><label class="field">Cor das fotos<select id="photo-color"></select></label><div class="photo-tools"><input id="photo-url" type="url" placeholder="https://…" aria-label="URL da foto"><button type="button" class="button outline" id="add-photo-url">Adicionar URL</button><label class="button outline">Enviar fotos<input id="photo-files" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label></div><p class="helper">A primeira foto é a capa desta cor. Cada cor aceita até cinco imagens. Use as setas para ordenar.</p><div id="photos" class="photos"></div><div class="checks"><label><input id="p-reviewed" type="checkbox" ${p.pieceImagesReviewed?'checked':''}> Revisei as fotos de moda íntima: mostram somente as peças, sem pessoas.</label></div>`;
 const rec=p.recommendationAudiences||p.audiences;$('#p-recommendation').value=rec.length===2&&rec.includes('homem')&&rec.includes('mulher')?'both':rec.length===1?rec[0]:'auto';renderCategoryOptions(p.categoryKeys);renderVariants();renderPhotoColors();groupProductFields();$('#editor').showModal();}
function groupProductFields(){
 const body=$('#editor-body');
 const fields=[...body.children];
 let section;
 for(const field of fields){
  if(!section||field.matches('.section-title')){
   section=document.createElement('details');
   section.className='product-section';
   const summary=document.createElement('summary');
   const isHeading=field.matches('.section-title');
   summary.textContent=isHeading?field.textContent:'Dados do produto';
   section.open=!isHeading;
   section.append(summary);
   body.append(section);
   if(isHeading){field.remove();continue;}
  }
  section.append(field);
 }
}

function renderCategoryOptions(selected=[]){const checked=[...root.querySelectorAll('#p-audiences input:checked')].map(i=>i.value);$('#p-categories').innerHTML=Object.entries(D).filter(([slug])=>checked.includes(slug)).map(([slug,d])=>d.groups.map(group=>`<optgroup label="${esc(d.label+' · '+group.name)}">${group.items.map(item=>`<option value="${item.slug}" ${selected.includes(item.slug)?'selected':''}>${esc(item.name)}</option>`).join('')}</optgroup>`).join('')).join('');}
function renderVariants(){
 const groups=new Map();
 variants.forEach((variant,index)=>{
  const color=variant.attributes.Cor;
  if(!groups.has(color))groups.set(color,[]);
  groups.get(color).push({variant,index});
 });
 for(const items of groups.values())items.sort((a,b)=>bySize(a.variant,b.variant));
 $('#variants').innerHTML=[...groups].map(([color,items],groupIndex)=>`
  <section class="variant-color">
   <div class="variant-color-body">
    <div class="variant-color-head">
     <label class="field">Cor<input data-color-name="${esc(color)}" value="${esc(color)}" maxlength="100" aria-label="Nome da cor ${groupIndex+1}"></label>
     <button type="button" class="text-button" data-more-sizes="${esc(color)}">Adicionar tamanhos</button>
     <button type="button" class="text-button danger" data-remove-color="${esc(color)}">Remover cor</button>
    </div>
    <div class="variant-size-list" aria-label="Tamanhos da cor ${esc(color)}">
     ${items.map(({variant:v,index:i})=>`<details class="variant-size">
      <summary class="stock-size" data-available="${v.available}" title="Editar tamanho e preço">${esc(v.attributes.Tamanho)}</summary>
      <div class="variant-size-editor">
       <label class="field">Tamanho<input data-variant="${i}" data-field="size" value="${esc(v.attributes.Tamanho)}" maxlength="40" required></label>
       <label class="field">Preço normal (R$)<input data-variant="${i}" data-field="regular" type="number" min="0" step="0.01" value="${v.regular}" required></label>
       <button type="button" class="text-button" data-remove-variant="${i}">Remover tamanho</button>
      </div>
     </details>`).join('')}
    </div>
   </div>
  </section>`).join('')||'<p class="helper">Adicione a primeira cor e seus tamanhos.</p>';
}
function renderPhotoColors(){const colors=[...new Set(variants.map(v=>v.attributes.Cor.trim()).filter(Boolean))];if(!colors.includes(photoColor))photoColor=colors[0]||'';$('#photo-color').innerHTML=colors.map(c=>`<option ${c===photoColor?'selected':''}>${esc(c)}</option>`).join('');renderPhotos();}
function renderPhotos(){const images=colorImages[photoColor]||[];$('#photos').innerHTML=images.map((url,i)=>`<div class="photo"><img src="${esc(url)}" alt="${esc(photoColor)} — foto ${i+1}"><small>${i===0?'CAPA DA COR':'FOTO '+(i+1)}</small><button type="button" data-photo-left="${i}" aria-label="Mover foto ${i+1} para a esquerda" ${i===0?'disabled':''}>←</button><button type="button" data-photo-right="${i}" aria-label="Mover foto ${i+1} para a direita" ${i===images.length-1?'disabled':''}>→</button><button type="button" data-photo-remove="${i}" aria-label="Remover foto ${i+1}">×</button></div>`).join('')||'<p class="helper">Nenhuma foto cadastrada para esta cor.</p>';}
function addPhoto(url,color=photoColor){
 if(!color)throw Error('Cadastre uma combinação com cor antes de adicionar fotos.');
 const list=colorImages[color]||[];
 if(list.length>=5)throw Error('Esta cor já tem cinco fotos.');
 if(!list.includes(url))colorImages[color]=[...list,url];
 if(photoColor===color)renderPhotos();
}
function collect(){if($('#photo-files')?.dataset.uploading)throw Error('Aguarde o envio das fotos antes de salvar.');if($('#bulk-colors').value.trim()||$('#bulk-sizes').value.trim()){const color=$('#bulk-colors');color.closest('details').open=true;color.focus();throw Error('Clique em Adicionar cor e tamanhos para incluir a linha preenchida antes de salvar.');}if(!variants.length)throw Error('Adicione pelo menos uma combinação de cor e tamanho.');const audiences=[...root.querySelectorAll('#p-audiences input:checked')].map(i=>i.value),recommend=$('#p-recommendation').value,colors=[...new Set(variants.map(v=>v.attributes.Cor.trim()))];const photos=Object.fromEntries(colors.map(c=>[c,(colorImages[c]||[]).slice()]));return {name:$('#p-name').value,sku:$('#p-sku').value,brand:$('#p-brand').value,description:$('#p-description').value,audiences,recommendationAudiences:recommend==='auto'?audiences:recommend==='both'?['homem','mulher']:[recommend],categoryKeys:[...$('#p-categories').selectedOptions].map(i=>i.value),modelType:$('#p-type').value,sale:editing?.sale===true,published:$('#p-published').checked,pieceImagesReviewed:$('#p-reviewed').checked,colorImages:photos,images:photos[colors[0]]||[],variants:variants.map(v=>({...v,price:editing?.sale?Math.min(v.regular,v.price):v.regular,image:photos[v.attributes.Cor.trim()]?.[0]||''}))};}

function patchProduct(id, payload) {
 return api('products/'+id,{method:'PATCH',body:JSON.stringify(payload)});
}
function actionDialog(title, markup, onSave, mode='') {
 $('#editor').classList.toggle('combo-editor',mode==='combo');
 $('#editor-body').onclick=null;
 saveAction=onSave;
 $('#editor-title').textContent=title;
 $('#editor-body').innerHTML=markup;
 $('#editor-error').textContent='';
 $('#editor').showModal();
}
function openStock(id) {
 const product=products.find(p=>p.id===id);
 const colors=new Map();
 for(const variant of product.variants){
  const color=variant.attributes.Cor;
  if(!colors.has(color))colors.set(color,[]);
  colors.get(color).push(variant);
 }
 actionDialog('Disponibilidade · '+product.name,
  '<p class="helper">Clique no tamanho para alternar. Verde = disponível. Cinza = indisponível.</p>'+
  [...colors].map(([color,items])=>`
   <details class="product-section" ${colors.size===1?'open':''}>
    <summary>${esc(color)} · <span data-stock-count>${items.filter(v=>v.available).length}/${items.length} disponíveis</span></summary>
    <div class="stock-sizes" role="group" aria-label="Tamanhos da cor ${esc(color)}">
     ${items.sort(bySize).map(v=>`<button type="button" class="stock-size" data-status="${v.id}" aria-pressed="${v.available}" aria-label="Tamanho ${esc(v.attributes.Tamanho)}">${esc(v.attributes.Tamanho)}</button>`).join('')}
    </div>
   </details>`).join(''),()=>patchProduct(id,{availability:Object.fromEntries(
    [...$('#editor-body').querySelectorAll('[data-status]')].map(button=>[button.dataset.status,button.getAttribute('aria-pressed')==='true'])
   )}));
 $('#editor-body').onclick=event=>{
  const button=event.target.closest('.stock-size');
  if(!button)return;
  button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));
  const group=button.closest('.product-section');
  const all=group.querySelectorAll('.stock-size').length;
  const available=group.querySelectorAll('.stock-size[aria-pressed=true]').length;
  group.querySelector('[data-stock-count]').textContent=available+'/'+all+' disponíveis';
 };
}
function openOffer(id) {
 const product=products.find(p=>p.id===id);
 const eligible=products.filter(p=>!p.basket);
 const options=list=>list.map(p=>`<option value="${p.id}">${esc(p.name+' · '+p.sku)}</option>`).join('');
 actionDialog(product?.basket?'Preço do combo':'Configurar oferta',`
  ${product?`<p>${esc(product.name)} · Preço normal a partir de ${money(product.regular)}</p>`:`<label class="field">Buscar produtos<input id="offer-search" type="search" placeholder="Nome, marca ou referência"></label><label class="field">Produto<select id="offer-product" required><option value="">Selecione um produto</option>${options(eligible)}</select></label>`}
  ${product?.basket?'':`<label class="field">Tipo de desconto<select id="offer-mode"><option value="percent">Porcentagem (%)</option><option value="amount">Valor em reais (R$)</option></select></label>`}
  <label class="field">${product?.basket?'Preço do combo (R$)':'Desconto'}<input id="offer-value" type="number" min="0.01" step="0.01" required value="${product?.basket?product.price:''}"></label><p class="notice" id="offer-preview" role="status"></p>`,()=>{
   const value=Number($('#offer-value').value);
   return patchProduct(id||Number($('#offer-product').value),{offer:{
    mode:product?.basket?'amount':$('#offer-mode').value,
    value:product?.basket?Math.round((product.regular-value)*100)/100:value
   }});
 });
 const preview=()=>{
  const item=product||products.find(p=>p.id===Number($('#offer-product')?.value));
  const input=$('#offer-value');
  const value=Number(input.value);
  const result=$('#offer-preview');
  if(!item){result.textContent='Selecione um produto para simular o desconto.';return;}
  if(!input.value||value<=0){
   result.textContent=item.sale?'Preço com desconto atual: '+money(item.price):'Preço normal a partir de '+money(item.regular);
   return;
  }
  const mode=$('#offer-mode')?.value;
  const amounts=item.variants.map(v=>product?.basket?value:mode==='percent'?v.regular*(1-value/100):v.regular-value);
  const min=Math.min(...amounts),max=Math.max(...amounts);
  if(min<0){result.textContent='O desconto excede o preço normal de uma combinação.';return;}
  result.textContent='Preço após o desconto: '+money(min)+(max-min>.005?' a '+money(max):'');
 };
 const selector=$('#offer-product');
 $('#offer-search')?.addEventListener('input',event=>{
  const term=searchKey(event.target.value), selected=selector.value;
  const matches=eligible.filter(p=>String(p.id)===selected||matchesProductSearch(p,term));
  selector.innerHTML='<option value="">'+(matches.length?'Selecione um produto':'Nenhum produto encontrado')+'</option>'+options(matches);
  selector.value=selected;
  preview();
 });
 for(const id of ['#offer-value','#offer-mode','#offer-product']){
  $(id)?.addEventListener('input',preview);
  $(id)?.addEventListener('change',preview);
 }
 preview();
}
function openBasket(id=0) {
 const combo=products.find(p=>p.id===id&&p.basket);
 const selected=new Map((combo?.basket||[]).map(item=>[item.id,new Set(item.variantIds||[item.variantId])]));
 const eligible=products.filter(p=>!p.basket&&(selected.has(p.id)||(p.published!==false&&p.variants.some(v=>v.available))));
 const missing=[...selected.keys()].filter(id=>!eligible.some(p=>p.id===id));
 for(const id of missing)selected.delete(id);
 let active=null;

 actionDialog(combo?'Editar combo':'Criar combo',`
  <div class="editor-grid">
   <label class="field">Nome do combo<input id="basket-name" required maxlength="180" value="${esc(combo?.name||'')}"></label>
   <label class="field">Preço (R$)<input id="basket-price" required type="number" min="0.01" step="0.01" value="${combo?.price??''}"></label>
  </div>
  ${missing.length?'<p class="notice">Um ou mais produtos foram removidos do catálogo. Revise a seleção antes de salvar.</p>':''}
  <div class="combo-workspace">
   <section aria-labelledby="basket-count">
    <h3 id="basket-count" role="status"></h3>
    <div id="basket-selected"></div>
   </section>
   <section aria-label="Catálogo">
    <label class="field">Buscar produtos<input id="basket-search" type="search" placeholder="Nome, marca ou referência"></label>
    <div id="basket-list" class="basket-list" aria-label="Produtos disponíveis"></div>
   </section>
  </div>`,()=>{
   if(selected.size<2) throw Error('Marque pelo menos dois produtos.');
   if([...selected.values()].some(ids=>!ids.size)) throw Error('Marque pelo menos um tamanho para cada produto do combo.');
   const payload={
    name:$('#basket-name').value,price:Number($('#basket-price').value),
    basket:[...selected].map(([id,ids])=>({id,variantIds:[...ids]}))
   };
   return combo?patchProduct(combo.id,payload):api('products',{method:'POST',body:JSON.stringify(payload)});
 },'combo');

 for(const product of eligible){
  const chosen=selected.get(product.id);
  if(chosen)for(const variantId of chosen)if(!product.variants.some(v=>v.id===variantId))chosen.delete(variantId);
 }
 const marked=$('#basket-selected'),list=$('#basket-list'),searchBox=$('#basket-search');
 const row=product=>{
  const {id,name,variants}=product;
  const checked=selected.has(id);
  const chosen=selected.get(id);
  const available=variants.filter(v=>v.available||chosen?.has(v.id)).sort((a,b)=>a.attributes.Cor.localeCompare(b.attributes.Cor,'pt-BR')||bySize(a,b));
  const choosing=checked&&active===id;
  const colors=new Map();
  for(const variant of available){
   const color=variant.attributes.Cor;
   if(!colors.has(color))colors.set(color,[]);
   colors.get(color).push(variant);
  }
  const inStock=available.filter(v=>v.available);
  const allChecked=inStock.length>0&&inStock.every(v=>chosen?.has(v.id));
  return `<div class="basket-row">
   <div class="basket-line">
    <label class="basket-check"><input type="checkbox" data-basket-product="${id}" ${checked?'checked':''}>
     <span>${esc(name)}${!checked?`<small>${esc(product.sku)}</small>`:''}</span>
    </label>
    ${checked&&!choosing?`<button class="text-button basket-change" type="button" data-basket-edit="${id}" aria-label="Alterar cor e tamanho de ${esc(name)}">${chosen.size===available.length?'Todos os tamanhos':chosen.size?chosen.size+' opções':'Escolher tamanhos'}</button>`:''}
   </div>
   ${choosing?`<fieldset class="basket-variant basket-sizes">
    <legend>Tamanhos que o cliente poderá escolher</legend>
    <label><input type="checkbox" data-basket-all="${id}" ${allChecked?'checked':''} ${inStock.length?'':'disabled'}> Todos disponíveis</label>
    ${[...colors].map(([color,items])=>`<div class="combo-color">
     <strong>${esc(color)}</strong>
     <div class="stock-sizes" role="group" aria-label="Tamanhos da cor ${esc(color)}">
      ${items.map(v=>`<button type="button" class="stock-size" data-basket-variant="${id}" data-variant-id="${v.id}" data-in-stock="${v.available}" aria-pressed="${chosen.has(v.id)}" aria-label="Tamanho ${esc(v.attributes.Tamanho)}${v.available?'':' indisponível'}">${esc(v.attributes.Tamanho)}${v.available?'':' · indisponível'}</button>`).join('')}
     </div>
    </div>`).join('')}
    <button type="button" class="text-button" data-basket-done="${id}">Concluir seleção</button>
   </fieldset>`:''}
  </div>`;
 };
 const drawAvailable=()=>{
  const term=searchKey(searchBox.value);
  const scroll=list.scrollTop;
  list.innerHTML=eligible.filter(p=>!selected.has(p.id)&&p.published!==false&&p.variants.some(v=>v.available)&&matchesProductSearch(p,term))
   .map(row).join('')||'<p class="helper">Nenhum produto encontrado.</p>';
  list.scrollTop=scroll;
 };
 const drawMarked=()=>{
  $('#basket-count').textContent='No combo ('+selected.size+'/20)';
  marked.innerHTML=eligible.filter(p=>selected.has(p.id)).map(row).join('')
   ||'<p class="helper">Marque pelo menos dois produtos.</p>';
 };
 const change=event=>{
  const input=event.target;
  if(input.dataset.basketAll){
   const chosen=selected.get(Number(input.dataset.basketAll));
   for(const button of input.closest('fieldset').querySelectorAll('[data-in-stock=true]')){
    const id=Number(button.dataset.variantId);
    if(input.checked)chosen.add(id);else chosen.delete(id);
    button.setAttribute('aria-pressed',String(input.checked));
   }
   $('#editor-error').textContent='';
   return;
  }
  const id=Number(input.dataset.basketProduct);
  if(!id)return;
  if(input.checked){
   if(selected.size>=20){
    input.checked=false;
    $('#editor-error').textContent='O combo aceita até 20 produtos.';
    return;
   }
   const available=eligible.find(p=>p.id===id).variants.filter(v=>v.available);
   selected.set(id,new Set(available.length===1?[available[0].id]:[]));
   active=id;
  }else{
   selected.delete(id);
   if(active===id)active=null;
  }
  $('#editor-error').textContent='';
  drawMarked();
  drawAvailable();
  const target=input.checked?marked.querySelector(`[data-basket-variant="${id}"]`):list.querySelector(`[data-basket-product="${id}"]`);
  (target||searchBox).focus();
 };
 list.onchange=marked.onchange=change;
 marked.onclick=event=>{
  const size=event.target.closest('[data-basket-variant]');
  if(size){
   const chosen=selected.get(Number(size.dataset.basketVariant));
   const id=Number(size.dataset.variantId);
   if(chosen.has(id)){
    chosen.delete(id);
    if(size.dataset.inStock!=='true')size.disabled=true;
   }else if(size.dataset.inStock==='true')chosen.add(id);
   size.setAttribute('aria-pressed',String(chosen.has(id)));
   const field=size.closest('fieldset');
   const inStock=[...field.querySelectorAll('[data-in-stock=true]')];
   field.querySelector('[data-basket-all]').checked=inStock.length>0&&inStock.every(button=>chosen.has(Number(button.dataset.variantId)));
   $('#editor-error').textContent='';
   return;
  }
  const done=event.target.closest('[data-basket-done]');
  if(done){
   active=null;
   drawMarked();
   marked.querySelector(`[data-basket-edit="${done.dataset.basketDone}"]`).focus();
   return;
  }
  const button=event.target.closest('[data-basket-edit]');
  if(!button)return;
  active=Number(button.dataset.basketEdit);
  drawMarked();
  (marked.querySelector('[data-basket-variant]')||marked.querySelector('[data-basket-done]')).focus();
 };
 searchBox.oninput=drawAvailable;
 drawMarked();
 drawAvailable();
}

function confirmAction(title,text){return new Promise(resolve=>{$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;const dialog=$('#confirm-dialog');const done=value=>{dialog.close();$('#confirm-yes').onclick=$('#confirm-no').onclick=null;resolve(value);};$('#confirm-yes').onclick=()=>done(true);$('#confirm-no').onclick=()=>done(false);dialog.oncancel=()=>done(false);dialog.showModal();});}
async function settings(){let settings;try{settings=await api('settings');}catch(error){toast(error.message);return;}if(view!=='settings')return;$('#content').innerHTML=heading('Configurações','Dados da loja e acesso da equipe.')+`<div class="settings-grid"><form class="card" id="settings-form"><h2>Loja</h2><label class="field">WhatsApp (país + DDD + telefone)<input id="setting-phone" inputmode="numeric" ${publicDemo?'placeholder="Ex.: 55 + DDD + número"':'required'} value="${esc(settings.phone)}"></label><label class="field">Instagram (URL completa)<input id="setting-instagram" type="url" value="${esc(settings.instagram??'https://www.instagram.com/lojaeclipsecp/')}"></label><label class="field">Facebook (URL completa)<input id="setting-facebook" type="url" value="${esc(settings.facebook??'https://www.facebook.com/eclipsecpoficial/')}"></label><label class="field">Endereço da loja<textarea id="setting-address" required maxlength="300">${esc(settings.storeAddress)}</textarea></label><p class="helper">${publicDemo?'Deixe o número vazio para simular. Preencha um número de teste para abrir a mensagem no WhatsApp.':'O rodapé, o mapa e o destino do carrinho usam estes dados após recarregar a loja.'}</p><p id="settings-error" class="error"></p><button class="button" type="submit">Salvar configurações</button></form><form class="card" id="password-form"><h2>Trocar senha</h2><label class="field">Senha atual<input id="password-current" type="password" autocomplete="current-password" required></label><label class="field">Nova senha<input id="password-new" type="password" minlength="12" autocomplete="new-password" required></label><label class="field">Repetir nova senha<input id="password-repeat" type="password" minlength="12" autocomplete="new-password" required></label><p class="helper">Use pelo menos 12 caracteres. Ao trocar, as sessões atuais serão encerradas.</p><p id="password-error" class="error"></p><button class="button outline" type="submit">Atualizar senha</button></form></div>`;
 $('#settings-form').onsubmit=async event=>{event.preventDefault();try{await api('settings',{method:'PUT',body:JSON.stringify({phone:$('#setting-phone').value,storeAddress:$('#setting-address').value,instagram:$('#setting-instagram').value,facebook:$('#setting-facebook').value})});toast('Configurações salvas.');}catch(error){$('#settings-error').textContent=error.message;}};
 $('#password-form').onsubmit=async event=>{event.preventDefault();if($('#password-new').value!==$('#password-repeat').value){$('#password-error').textContent='As senhas não conferem.';return;}try{await api('password',{method:'POST',body:JSON.stringify({current:$('#password-current').value,password:$('#password-new').value})});csrf='';login('Senha atualizada. Entre novamente.');}catch(error){$('#password-error').textContent=error.message;}};
}
function backups(){$('#content').innerHTML=heading('Backups','Guarde uma cópia antes de alterações importantes.')+`<div class="settings-grid"><div class="card"><h2>Exportar catálogo</h2><p>Salva produtos, variações, preços, disponibilidade e endereços das fotos em um arquivo JSON. As fotos enviadas ficam na pasta Dados/imagens e devem ser copiadas junto com o backup.</p><button class="button" id="export">Exportar backup ↗</button></div><div class="card file-card"><h2>Restaurar catálogo</h2><p>A restauração substitui os produtos atuais pelos registros do arquivo. Faça uma exportação antes de continuar.</p><input type="file" id="import-file" accept="application/json,.json" aria-label="Arquivo de backup"><button class="button outline" id="import">Selecionar e restaurar backup</button><p class="error" id="import-error"></p></div></div>`;}
function setAdminMenu(open){
 $('#adm-menu').setAttribute('aria-expanded',String(open));
 $('#adm-navigation').toggleAttribute('data-mobile-open',open);
}
function bind(){bindingController?.abort();bindingController=new AbortController();const listen=(type,callback)=>root.addEventListener(type,callback,{signal:bindingController.signal});listen('click',async event=>{const button=event.target.closest('button');if(!button)return;if(button.id==='adm-menu'){setAdminMenu(button.getAttribute('aria-expanded')!=='true');return;}if(button.dataset.view){setAdminMenu(false);if(window.matchMedia('(max-width:760px)').matches)window.scrollTo(0,0);view=button.dataset.view;search='';page=1;listFilters.department='';listFilters.status=button.dataset.statusFilter||'';listFilters.order='recent';if(view==='offers')offerType=button.dataset.offersFilter||'promotions';render();}if(button.hasAttribute('data-close'))$('#editor').close();if(button.id==='clear-demo-catalog'&&publicDemo){
 if(await confirmAction('Limpar catálogo de teste?','Produtos, promoções e combos deste navegador serão removidos. Os contatos e as contas de teste serão mantidos.')){
  try{await api('clear-catalog',{method:'POST'});await reload();render();toast('Catálogo limpo. Você já pode cadastrar seus produtos.');}
  catch(error){toast(error.message);}
 }
 return;
}if(button.id==='reset-demo'&&publicDemo&&await confirmAction('Restaurar demonstração?','As alterações feitas neste navegador serão apagadas.')){await api('reset',{method:'POST'});login('Catálogo de exemplo restaurado.');return;}if(button.id==='logout'){try{await api('logout',{method:'POST'});csrf='';login();}catch(error){toast(error.message);}}if(button.id==='new-product')openEditor();if(button.dataset.edit)openEditor(Number(button.dataset.edit));if(button.dataset.removeUser&&user==='admin'){
 const username=button.dataset.removeUser;
 if(await confirmAction('Remover usuário?','O acesso de '+username+' será encerrado.')){
  try{await api('users',{method:'DELETE',body:JSON.stringify({username})});await renderUsers();toast('Usuário removido.');}
  catch(error){toast(error.message);}
 }
}
if(button.dataset.removeCategory){
 const category=categories.find(item=>item.slug===button.dataset.removeCategory);
 if(category&&await confirmAction('Remover categoria?',category.name+' será removida do departamento.')){
  try{await api('categories',{method:'DELETE',body:JSON.stringify({slug:category.slug})});await reload();if(view==='categories')renderCategories();toast('Categoria removida.');}
  catch(error){toast(error.message);}
 }
 return;
}
if(button.dataset.stock)openStock(Number(button.dataset.stock));
if(button.id==='add-offer'||button.dataset.offer)openOffer(Number(button.dataset.offer)||0);
if(button.dataset.offerType){offerType=button.dataset.offerType;page=1;search='';listFilters.department='';listFilters.status='';render();root.querySelector('[data-offer-type][aria-pressed=true]').focus();}
if(button.id==='add-basket'||button.dataset.editCombo)openBasket(Number(button.dataset.editCombo)||0);
if(button.dataset.offerRemove&&await confirmAction('Retirar oferta?','O produto voltará ao preço normal.')){
 try{await patchProduct(Number(button.dataset.offerRemove),{offer:{mode:'remove'}});await reload();render();toast('Oferta retirada.');}catch(error){toast(error.message);}
}if(button.dataset.delete){const product=products.find(p=>p.id===Number(button.dataset.delete));if(await confirmAction('Remover produto?',product.name+' será removido do catálogo.')){try{await api('products/'+product.id,{method:'DELETE'});await reload();render();toast('Produto removido.');}catch(error){toast(error.message);}}}if(button.id==='previous'){page--;renderRows();}if(button.id==='next'){page++;renderRows();}if(button.hasAttribute('data-remove-variant')){variants.splice(Number(button.dataset.removeVariant),1);renderVariants();renderPhotoColors();}if(button.hasAttribute('data-remove-color')){
 const color=button.dataset.removeColor;
 const count=variants.filter(v=>v.attributes.Cor===color).length;
 if(await confirmAction('Remover cor?', 'A cor '+color+' será removida deste produto com seus '+count+' tamanho(s) e suas fotos ao salvar.')){
  variants=variants.filter(v=>v.attributes.Cor!==color);
  delete colorImages[color];
  if($('#bulk-colors').value.trim()===color){$('#bulk-colors').value='';$('#bulk-sizes').value='';}
  renderVariants();
  renderPhotoColors();
 }
}
if(button.dataset.moreSizes){
 $('#bulk-colors').value=button.dataset.moreSizes;
 $('#bulk-sizes').focus();
}
if(button.id==='generate-variants'){
 const input=$('#bulk-colors');
 const color=input.value.trim();
 const sizes=$('#bulk-sizes').value.split(/[,;]+/).map(value=>value.trim()).filter(Boolean);
 if(!color||!sizes.length){
  $('#editor-error').textContent='Informe uma cor e os tamanhos dela.';
  (color?$('#bulk-sizes'):input).focus();
  return;
 }
 const key=value=>value.toLocaleLowerCase('pt-BR');
 const matching=variants.filter(v=>key(v.attributes.Cor)===key(color));
 const name=matching[0]?.attributes.Cor||color;
 const existing=new Set(matching.map(v=>key(v.attributes.Tamanho)));
 const additions=[];
 for(const size of sizes){
  if(existing.has(key(size)))continue;
  existing.add(key(size));
  additions.push(size);
 }
 if(!additions.length||additions.some(size=>size.length>40)||variants.length+additions.length>999){
  $('#editor-error').textContent='Informe novos tamanhos válidos. O produto aceita até 999 combinações.';
  return;
 }
 const regular=Number($('#p-normal').value);
 variants.push(...additions.map(Tamanho=>({attributes:{Cor:name,Tamanho},regular,price:regular,available:false,image:''})));
 $('#editor-error').textContent='';
 input.value='';
 $('#bulk-sizes').value='';
 renderVariants();
 renderPhotoColors();
 input.focus();
}if(button.id==='apply-prices'){variants.forEach(v=>{v.regular=Number($('#p-normal').value);});renderVariants();}if(button.id==='add-photo-url'){try{const url=$('#photo-url').value.trim();if(!/^https:\/\//.test(url))throw Error('Use uma URL começando com https://.');addPhoto(url);$('#photo-url').value='';}catch(error){$('#editor-error').textContent=error.message;}}if(button.hasAttribute('data-photo-remove')){colorImages[photoColor].splice(Number(button.dataset.photoRemove),1);renderPhotos();}if(button.hasAttribute('data-photo-left')||button.hasAttribute('data-photo-right')){const list=colorImages[photoColor],i=Number(button.dataset.photoLeft??button.dataset.photoRight),j=i+(button.hasAttribute('data-photo-left')?-1:1);if(j>=0&&j<list.length)[list[i],list[j]]=[list[j],list[i]];renderPhotos();}if(button.id==='export'){try{const data=await api('export'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='eclipse-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){toast(error.message);}}if(button.id==='import'){const file=$('#import-file').files[0];if(!file){$('#import-error').textContent='Selecione um arquivo de backup.';return;}if(await confirmAction('Restaurar o catálogo?', 'Os produtos atuais serão substituídos pelo arquivo selecionado.')){try{const result=await api('import',{method:'POST',body:await file.text()});await reload();toast(result.count+' modelos restaurados.');}catch(error){$('#import-error').textContent=error.message;}}}});
 listen('keydown',event=>{
  if(event.key==='Escape'&&$('#adm-menu')?.getAttribute('aria-expanded')==='true'){
   setAdminMenu(false);$('#adm-menu').focus();
  }
 });
 listen('click',event=>{
  if($('#adm-menu')?.getAttribute('aria-expanded')==='true'&&!event.target.closest('.sidebar'))setAdminMenu(false);
 });
 listen('input',event=>{const input=event.target;if(input.dataset.variant!==undefined){const v=variants[Number(input.dataset.variant)],field=input.dataset.field;if(field==='color')v.attributes.Cor=input.value;else if(field==='size'){v.attributes.Tamanho=input.value;input.closest('.variant-size').querySelector('summary').textContent=input.value.trim()||'Tamanho';}else if(field==='available'){v.available=input.value==='true';v.max=null;}else v[field]=Number(input.value);}});
 listen('change',async event=>{if(event.target.closest('#p-audiences'))renderCategoryOptions([...$('#p-categories').selectedOptions].map(i=>i.value));if(event.target.hasAttribute('data-color-name')){
 const input=event.target,oldColor=input.dataset.colorName,newColor=input.value.trim();
 if(!newColor||variants.some(v=>v.attributes.Cor!==oldColor&&v.attributes.Cor.toLowerCase()===newColor.toLowerCase())){
  input.value=oldColor;
  $('#editor-error').textContent='Informe um nome de cor diferente das demais.';
  return;
 }
 if(newColor!==oldColor){
  for(const variant of variants)if(variant.attributes.Cor===oldColor)variant.attributes.Cor=newColor;
  if(Object.hasOwn(colorImages,oldColor)){
   colorImages[newColor]=colorImages[oldColor];
   delete colorImages[oldColor];
  }
  if(photoColor===oldColor)photoColor=newColor;
  $('#editor-error').textContent='';
  renderVariants();
  renderPhotoColors();
 }
}if(event.target.id==='photo-color'){photoColor=event.target.value;renderPhotos();}if(event.target.id==='photo-files'){
 const input=event.target,files=[...input.files],color=photoColor,gallery=colorImages;
 input.disabled=true;input.dataset.uploading='true';
 try{
  if(!color)throw Error('Cadastre uma combinação com cor antes de adicionar fotos.');
  if((gallery[color]||[]).length+files.length>5)throw Error('Cada cor aceita até cinco fotos.');
  for(const file of files){
   const result=await api('images',{method:'POST',headers:{'Content-Type':file.type},body:file});
   if(gallery!==colorImages||!input.isConnected||!variants.some(v=>v.attributes.Cor.trim()===color))break;
   addPhoto(result.url,color);
  }
 }catch(error){if(input.isConnected)$('#editor-error').textContent=error.message;}
 finally{input.value='';input.disabled=false;delete input.dataset.uploading;}
}});

 $('#product-form').addEventListener('invalid',event=>{for(let el=event.target.parentElement;el&&el!==event.currentTarget;el=el.parentElement)if(el.tagName==='DETAILS')el.open=true;},true);
 $('#product-form').addEventListener('submit',async event=>{event.preventDefault();$('#editor-error').textContent='';$('#save-product').disabled=true;try{if(saveAction){await saveAction();}else{const payload=collect();await api('products'+(editing?'/'+editing.id:''),{method:editing?'PUT':'POST',body:JSON.stringify(payload)});}$('#editor').close();await reload();render();toast('Produto salvo. Recarregue a loja para conferir.');}catch(error){$('#editor-error').textContent=error.message;}finally{if($('#save-product'))$('#save-product').disabled=false;}});
}
if(location.protocol==='file:'&&!publicDemo){root.innerHTML='<main class="login-panel"><h1>Inicie o protótipo local</h1><p>Execute o arquivo Iniciar-prototipo.sh na pasta do projeto e abra http://127.0.0.1:8787/admin/. O painel usa login e banco de dados; ele não funciona como um arquivo HTML isolado.</p></main>';return;}
api('session').then(async session=>{csrf=session.csrf;user=session.username;await start();}).catch(()=>login());
})();

/* Eclipse storefront. No admin credentials or write endpoints are exposed here. */
(async () => {
  'use strict';
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = item => `${item.id}:${item.variantId || 0}:${Array.isArray(item.basketChoices)?item.basketChoices.join(','):''}`;
  const validateCart = input => Array.isArray(input) ? input.filter(i => i && Number.isInteger(i.id) && i.id > 0 && Number.isInteger(i.variantId) && i.variantId >= 0 && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 99 && Number.isFinite(i.price) && i.price >= 0 && typeof i.name === 'string').slice(0, 100) : [];
  function mergeItem(cart, item) {
    const next = cart.map(i => ({ ...i }));
    const existing = next.find(i => key(i) === key(item));
    if (existing) existing.quantity = Math.min(99, existing.quantity + item.quantity);
    else if (next.length < 100) next.push({ ...item });
    else throw Error('O carrinho aceita até 100 combinações por pedido.');
    return next;
  }
  const validPhoto=url=>typeof url==='string'&&(/^https?:\/\//.test(url)||/^\/media\/[a-zA-Z0-9._-]+$/.test(url)||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(url));
  function galleryPhotos(product,color) {
    const explicit=product.colorImages&&color!==undefined&&color!==null;
    const photos=explicit?(product.colorImages[color]||[]):[product.image,...(Array.isArray(product.images)?product.images:[])];
    return [...new Set(photos.filter(validPhoto))].slice(0,5);
  }
  const compareSizes = typeof module !== 'undefined' && module.exports ? require('./size-order.js') : window.eclipseCompareSizes;
  function variantAttributes(variant) {
    if (variant.attributes && Object.keys(variant.attributes).length) return variant.attributes;
    const parts = String(variant.label || '').split(' · ');
    return parts.length > 1 ? { Cor: parts.slice(0,-1).join(' · '), Tamanho: parts.at(-1) } : { Tamanho: parts[0] || 'Único' };
  }
  const isSize = name => /tamanho|numera[çc][ãa]o|size/i.test(name);
  function variantGroups(product) {
    const names = [...new Set((product.variants || []).flatMap(v => Object.keys(variantAttributes(v))))];
    return names.sort((a,b) => Number(isSize(a)) - Number(isSize(b))).map(name => {
      let values = [...new Set(product.variants.map(v => variantAttributes(v)[name]).filter(Boolean))];
      if (isSize(name) && values.some(v => /^(PP|P|M|G|GG|XG|XGG|GGG)$/i.test(v))) values = [...new Set(['PP','P','M','G','GG',...values])];
      values.sort(isSize(name) ? compareSizes : (a,b) => a.localeCompare(b,'pt-BR',{numeric:true}));
      return { name, values };
    });
  }
  function matchingVariant(product, choices) {
    const groups = variantGroups(product);
    if (!groups.every(g => choices[g.name])) return null;
    return product.variants.find(v => v.available && groups.every(g => variantAttributes(v)[g.name] === choices[g.name])) || null;
  }
  function optionAvailable(product, choices, name, value) {
    const groups = variantGroups(product), index = groups.findIndex(g => g.name === name);
    return product.variants.some(v => v.available && variantAttributes(v)[name] === value && groups.slice(0,index).every(g => !choices[g.name] || variantAttributes(v)[g.name] === choices[g.name]));
  }
  function normalizeOrder(order) {
    const payments = {pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito',dinheiro:'Dinheiro'};
    if (!payments[order?.payment]) throw Error('Selecione a forma de pagamento.');
    if (!['retirada','entrega'].includes(order?.fulfilment)) throw Error('Selecione retirada na loja ou entrega.');
    return {payment:order.payment,paymentLabel:payments[order.payment],fulfilment:order.fulfilment,address:String(order.address||'').trim().slice(0,500)};
  }
  function messageFor(quote, order) {
    const lines = quote.items.map(i => `${i.quantity}x ${i.name}${i.sku ? ` [${i.sku}]` : ''}${i.label ? ` — ${i.label}` : ''}\n${money(i.price)} cada · ${money(i.price * i.quantity)}`);
    const preferences = order ? normalizeOrder(order) : null;
    const tail = preferences ? `Pagamento escolhido: ${preferences.paymentLabel}\nRecebimento: ${preferences.fulfilment === 'retirada' ? 'Retirar na loja' : 'Entrega'}${preferences.fulfilment === 'entrega' ? `\nEndereço: ${preferences.address || 'A combinar no atendimento'}\nFrete: a confirmar, não incluído no total` : ''}\n\nPodem confirmar a disponibilidade e orientar o pagamento?` : 'Podem confirmar a disponibilidade, o pagamento e a entrega? Frete a combinar.';
    return `Olá, Eclipse! Tenho interesse nestes produtos:\n\n${lines.join('\n\n')}\n\nTotal dos produtos: ${money(quote.total)}\n\n${tail}`;
  }
  function normalizeProfile(input) {
    if (!input || input.consent !== true || !['homem','mulher'].includes(input.audience)) return null;
    const name=String(input.name||'').replace(/[\u0000-\u001f<>]/g,'').trim().replace(/\s+/g,' ').slice(0,60);
    if(!name)return null;
    return {name,audience:input.audience,consent:true,version:1};
  }
  const offerDate=p=>p.offerAt||p.arrivedAt||0;
  const matchesPreference=(product,audience)=>!audience||(product.recommendationAudiences||product.audiences||[]).includes(audience);
  function selectDistinctPair(products,audience,previous=[],random=Math.random) {
    const pool=[...new Map(products.filter(p=>p.available&&matchesPreference(p,audience)).map(p=>[p.id,p])).values()];
    const kind=p=>p.modelType||p.category||(p.categories||[])[0]||'';
    let pairs=[];
    for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++)if(kind(pool[i])&&kind(pool[i])!==kind(pool[j]))pairs.push([pool[i],pool[j]]);
    if(!pairs.length)return [];
    const fresh=pairs.filter(pair=>pair.every(p=>!previous.includes(p.id)));
    const different=pairs.filter(pair=>!pair.every(p=>previous.includes(p.id)));
    pairs=fresh.length?fresh:different.length?different:pairs;
    return pairs[Math.min(pairs.length-1,Math.floor(Math.max(0,random())*pairs.length))];
  }
  function randomSelection(products,count,audience,previous=[],random=Math.random) {
    const pool=[...new Map(products.filter(p=>p.available&&matchesPreference(p,audience)).map(p=>[p.id,p])).values()];
    const shuffle=list=>{const result=list.slice();for(let i=result.length-1;i>0;i--){const j=Math.min(i,Math.floor(Math.max(0,random())*(i+1)));[result[i],result[j]]=[result[j],result[i]];}return result;};
    return [...shuffle(pool.filter(p=>!previous.includes(p.id))),...shuffle(pool.filter(p=>previous.includes(p.id)))].slice(0,count);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { money, escape, key, validateCart, mergeItem, messageFor, galleryPhotos, variantAttributes, variantGroups, matchingVariant, optionAvailable, normalizeOrder, normalizeProfile, selectDistinctPair, randomSelection, matchesPreference };
  if (typeof document === 'undefined') return;
  const cfg=window.ECLIPSE_CONFIG, root=document.getElementById('eclipse-store');
  if(!cfg||!root)return;
  if(cfg.publicDemo&&window.ECLIPSE_PUBLIC_ADMIN){
    const settings=window.ECLIPSE_PUBLIC_ADMIN.settings();
    cfg.storeAddress=settings.storeAddress||cfg.storeAddress;
    cfg.phone=/^[1-9][0-9]{9,14}$/.test(settings.phone)?settings.phone:'';
    for(const key of ['instagram','facebook']){
      if(typeof settings[key]==='string'&&(!settings[key]||/^https:\/\//i.test(settings[key])))cfg[key]=settings[key];
    }
  }
  const cartStorageKey=cfg.demo?'eclipse-demo-cart-v5':'eclipse-cart-v1';
  const activeCategories=await request('categories').catch(()=>[]);
  const activeSlugs=new Set(activeCategories.map(category=>category.slug));
  const departments=Object.fromEntries(Object.entries(window.ECLIPSE_DEPARTMENTS||{}).map(([slug,department])=>[
    slug,{...department,groups:department.groups.map(group=>({...group,items:group.items.filter(item=>activeSlugs.has(item.slug))}))}
  ]));
  const profileKey=cfg.demo?'eclipse-demo-profile-v1':'eclipse-profile-v1';
  let profile=null;try{profile=normalizeProfile(JSON.parse(localStorage.getItem(profileKey)||'null'));}catch{}
  let cart=[];
  try{cart=validateCart(JSON.parse(localStorage.getItem(cartStorageKey)||'[]'));}catch{}
  let shownPhotoColor=undefined,photoIndex=0;
  let directItems=null,current=null,choices={},productSequence=0,listSequence=0;
  let state={view:'home',audience:'',category:'',search:'',stock:false,page:1},pages=1;
  const audiences=Object.entries(departments).map(([slug,d])=>[slug,d.label.toUpperCase()]);
  const storeAddress=cfg.storeAddress||'Rua Dr. Bernardino de Campos, 220 — Centro, Cachoeira Paulista/SP — CEP 12630-000';
  const mapsQuery=encodeURIComponent('Eclipse, '+storeAddress);
  const mapsUrl='https://www.google.com/maps/search/?api=1&query='+mapsQuery;
  const logo=`<span class="ec-logo-file"><img src="${escape(cfg.assets)}eclipse-logo-transparente-v2.png" alt="Eclipse" width="150" height="150"></span>`;
  const bag='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>';
  const imageFor=p=>validPhoto(p.image)?`<img src="${escape(p.image)}" alt="${escape(p.name)}" loading="lazy"><span class="ec-photo-fallback" hidden>Foto indisponível</span>`:'<span class="ec-no-photo">ECLIPSE<small>Foto em breve</small></span>';
  function comboCarousel(product, openFromCard=false){
    const items=product.basketOptions;
    return `<div class="ec-combo-carousel" data-combo-carousel data-slide="0" role="group" aria-label="Fotos dos produtos de ${escape(product.name)}">
      <div class="ec-combo-stage">
      ${items.map((item,index)=>`<div data-combo-slide ${index?'hidden':''}>
        ${openFromCard?`<button type="button" class="ec-product-open ec-product-image" data-id="${product.id}" aria-label="Ver ${escape(product.name)}">${imageFor(item)}<span class="ec-sale-tag">COMBO</span></button>`:`<div class="ec-detail-image">${imageFor(item)}</div>`}
        <p class="ec-combo-caption" aria-live="polite">${index+1}/${items.length} · ${escape(item.name)}</p>
      </div>`).join('')}
      <div class="ec-combo-controls">
        <button type="button" data-combo-step="-1" aria-label="Foto anterior">‹</button>
        <button type="button" data-combo-step="1" aria-label="Próxima foto">›</button>
      </div>
      <button type="button" class="ec-combo-pause" data-combo-pause aria-label="Pausar rotação das fotos" aria-pressed="false">Ⅱ</button>
      </div>
      ${openFromCard?'':`<div class="ec-combo-items-title">Produtos do combo</div>
      <div class="ec-combo-thumbnails" aria-label="Todos os produtos do combo">
        ${items.map((item,index)=>`<button type="button" data-combo-photo="${index}" aria-pressed="${index===0}" aria-label="Ver foto de ${escape(item.name)}" title="${escape(item.name)}">
          ${validPhoto(item.image)?`<img src="${escape(item.image)}" alt="" loading="lazy">`:`<span class="ec-combo-no-image">Sem foto</span>`}
          <span class="ec-combo-piece-name">${escape(item.name)}</span>
        </button>`).join('')}
      </div>`}
    </div>`;
  }
  function moveComboSlide(carousel,step){
    const slides=[...carousel.querySelectorAll('[data-combo-slide]')];
    if(slides.length<2)return;
    const next=(Number(carousel.dataset.slide)+step+slides.length)%slides.length;
    carousel.dataset.slide=String(next);
    carousel.dataset.rotatedAt=String(Date.now());
    slides.forEach((slide,index)=>slide.hidden=index!==next);
    carousel.querySelectorAll('[data-combo-photo]').forEach((button,index)=>{
      button.setAttribute('aria-pressed',String(index===next));
    });
  }
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  window.setInterval(()=>{
    if(document.hidden||reduceMotion.matches)return;
    const now=Date.now();
    root.querySelectorAll('[data-combo-carousel]').forEach(carousel=>{
      if(!carousel.getClientRects().length||carousel.matches(':hover,:focus-within')||carousel.dataset.paused==='true')return;
      const last=Number(carousel.dataset.rotatedAt);
      if(!last){carousel.dataset.rotatedAt=String(now);return;}
      if(now-last>=4500)moveComboSlide(carousel,1);
    });
  },500);
  function comboSizeOptions(variants){
    const colors=new Map();
    for(const variant of variants){
      if(!colors.has(variant.color))colors.set(variant.color,[]);
      colors.get(variant.color).push(variant);
    }
    return [...colors].map(([color,sizes])=>`<optgroup label="${escape(color)}">${sizes.sort((a,b)=>compareSizes(a.size,b.size)).map(v=>`<option value="${v.id}" ${variants.length===1?'selected':''}>${escape(v.size)}</option>`).join('')}</optgroup>`).join('');
  }
  const offerPrice=p=>{
    const variants=(p.variants||[]).filter(v=>v.regular>v.price);
    const priced=variants.reduce((best,v)=>!best||v.price<best.price?v:best,null)||p;
    const differentPrices=variants.some(v=>v.price!==priced.price);
    return `<div class="ec-offer-price">
      ${priced.regular>priced.price?`<del>De ${money(priced.regular)}</del>`:''}
      <small>${differentPrices?'Com desconto, a partir de':'Preço com desconto'}</small><strong>${money(priced.price)}</strong>
    </div>`;
  };
  const card=p=>`<article class="ec-card ${p.sale?'ec-offer-card':''}">${p.basketOptions?.length?comboCarousel(p,true):`<button class="ec-product-open ec-product-image" data-id="${p.id}" aria-label="Ver ${escape(p.name)}">${imageFor(p)}${p.basket?'<span class="ec-sale-tag">COMBO</span>':p.sale?'<span class="ec-sale-tag">OFERTA</span>':p.isNew?'<span class="ec-new-tag">ACABOU DE CHEGAR</span>':''}<span class="ec-card-arrow">↗</span></button>`}<div class="ec-card-info"><p>${escape([...new Set(p.categories||[])].join(' / '))}</p><button class="ec-product-open ec-product-name" data-id="${p.id}">${escape(p.name)}</button>${p.sale?offerPrice(p):`<div class="ec-price"><strong>${money(p.price)}</strong></div>`}<span class="ec-card-hint">${p.available?(p.basketOptions?'Escolha o tamanho de cada peça':'Escolha sua cor e tamanho'):'Esgotado'}</span></div></article>`;
  root.innerHTML=`<div class="ec-app ec-store-v2">
    <div class="ec-top"><span>Cachoeira Paulista · SP</span><span>${cfg.demo?'AMBIENTE DE DEMONSTRAÇÃO':'ENVIO PARA TODO O BRASIL'}</span></div>
    ${cfg.publicDemo?'<div class="ec-demo-notice" role="note"><strong>Demonstração • sem dados reais. Direitos do site: © 2026 Gustavo Henrique De Inocencio Ribeiro</strong></div>':''}
    <header class="ec-header"><a class="ec-brand" href="#inicio" aria-label="Eclipse — início">${logo}</a><button type="button" id="ec-mobile-menu" aria-controls="ec-department-menu" aria-expanded="false"><span aria-hidden="true">☰</span><span>Menu</span></button><nav class="ec-audience-nav" id="ec-department-menu" aria-label="Navegação da loja"><div class="ec-nav-mobile-links"><a href="#catalogo">Catálogo</a><a href="#lancamentos">Lançamentos</a><a href="#ofertas">Ofertas</a></div>${audiences.map(([slug,label])=>`<details class="ec-nav-dept" data-department="${slug}">
      <summary>${escape(label)}</summary>
      <div class="ec-mega">
       <div class="ec-mega-intro"><strong>${escape(label)}</strong><a class="ec-view-all" href="#catalogo?publico=${slug}">Ver tudo ↗</a></div>
       <div class="ec-department-groups">${departments[slug].groups.map((group,index)=>!group.items.length?'':group.items.length===1
        ?`<a class="ec-mega-category" href="#catalogo?publico=${slug}&amp;categoria=${group.items[0].slug}">${escape(group.items[0].name)} ↗</a>`
        :`<details class="ec-category-group"><summary>${escape(group.name)}</summary><div>
         <a class="ec-mega-category" href="#catalogo?publico=${slug}&amp;categoria=grupo-${index}">Ver categoria ↗</a>
         ${group.items.map(item=>`<a class="ec-mega-category" href="#catalogo?publico=${slug}&amp;categoria=${item.slug}">${escape(item.name)}</a>`).join('')}
        </div></details>`).join('')}</div>
      </div>
     </details>`).join('')}</nav><div class="ec-header-actions"><a href="#lancamentos" class="ec-launch-nav">LANÇAMENTOS</a><a href="#ofertas" class="ec-offer-nav">OFERTAS</a><button class="ec-bag ec-cart-open" aria-label="Abrir carrinho">${bag}<b id="ec-count">0</b></button></div></header>
    <main>
      <div class="ec-personal-bar"><p id="ec-greeting"></p><button type="button" id="ec-personalize">Personalizar minha experiência</button></div>
      <section id="ec-launches" class="ec-catalog ec-launches"><div class="ec-section-head"><div><p class="ec-eyebrow">NOVIDADES NA ECLIPSE</p><h1>ACABARAM DE CHEGAR<span>.</span></h1><p class="ec-section-copy">Novos favoritos para renovar seu estilo.</p></div><button class="ec-text-link" data-route="new">Ver todos os lançamentos ↗</button></div><p class="ec-mobile-swipe-hint">Deslize para ver mais peças ↔</p><div id="ec-new-grid" class="ec-grid"></div></section>
      <section id="ec-campaign" class="ec-hero ec-restored-campaign"><div class="ec-hero-copy"><p class="ec-eyebrow"><span></span> MODA QUE ACOMPANHA VOCÊ</p><h2>SEU ESTILO.<br>SUA PRÓXIMA<br>ECLIPSE.</h2><p>Do tênis ao look completo. Encontre as peças que combinam com o seu momento.</p><button class="ec-button ec-dark" id="ec-explore-personal">EXPLORAR CATÁLOGO ↗</button><small>ROUPAS / CALÇADOS / ACESSÓRIOS</small></div><div id="ec-campaign-products" class="ec-campaign-products"></div></section>
      <section id="ec-offer-feature"><div class="ec-offers-stripe"><div><span>SELEÇÃO ESPECIAL</span><h2>OFERTAS ECLIPSE</h2></div><a href="#ofertas">Explorar ofertas ↗</a></div><p class="ec-mobile-swipe-hint">Deslize para ver mais ofertas ↔</p><div id="ec-offer-grid" class="ec-grid"></div></section>
      <section id="ec-catalog" class="ec-catalog"><div class="ec-section-head"><div><p id="ec-catalog-eyebrow" class="ec-eyebrow">ESCOLHA O QUE COMBINA COM VOCÊ</p><h2 id="ec-catalog-title">EXPLORE O CATÁLOGO<span>.</span></h2></div><a id="ec-back-home" class="ec-text-link" href="#inicio" hidden>Voltar ao início ↗</a></div><div id="ec-offer-bar" hidden><nav id="ec-offer-types" class="ec-offer-types" aria-label="Tipo de oferta" hidden><a class="ec-outline" data-offer-type="promotions" href="#ofertas">Promoções</a><a class="ec-outline" data-offer-type="combos" href="#ofertas?tipo=combos">Combos</a></nav><label class="ec-offer-order">Ordenar por<select id="ec-offer-order"><option value="recent">Mais novas primeiro</option><option value="price">Menor preço</option></select></label></div><div class="ec-tools"><button type="button" id="ec-mobile-filters" aria-expanded="false" aria-controls="ec-categories">Filtros</button><div id="ec-categories" class="ec-categories"></div><form class="ec-search" role="search"><span aria-hidden="true">⌕</span><input aria-label="Buscar produtos" placeholder="Busque uma peça ou marca" type="search"><button type="submit" aria-label="Buscar">↵</button></form></div><div class="ec-filter-line"><span id="ec-results" role="status">Carregando coleção…</span><label><input type="checkbox" id="ec-in-stock"> Disponíveis</label></div><div id="ec-grid" class="ec-grid" aria-live="polite"></div><div class="ec-pagination"><button id="ec-prev" class="ec-outline">← Anterior</button><span id="ec-page"></span><button id="ec-next" class="ec-outline">Próxima →</button></div></section>
      <section id="ec-about" class="ec-about"><div><p class="ec-eyebrow">ECLIPSE · CACHOEIRA PAULISTA</p><h2>SEU ESTILO.<br>SUAS ESCOLHAS.</h2></div><div><p>Roupas, calçados e acessórios para diferentes momentos. Escolha suas peças, monte o carrinho e converse com a nossa equipe pelo WhatsApp.</p>${cfg.instagram!==''?`<a href="${escape(cfg.instagram||'https://www.instagram.com/lojaeclipsecp/')}" target="_blank" rel="noopener noreferrer">Instagram ↗</a>`:''}<div class="ec-how"><span>01<small>Escolha suas peças</small></span><span>02<small>Pagamento e recebimento</small></span><span>03<small>Envie pelo WhatsApp</small></span></div></div></section>
    </main><footer class="ec-compact-footer">
      <a href="#inicio" class="ec-footer-brand" aria-label="Eclipse — início">${logo}</a>
      <a href="${mapsUrl}" class="ec-footer-address" target="_blank" rel="noopener noreferrer">${escape(storeAddress)} ↗</a>
      <div class="ec-footer-links">
        ${cfg.publicDemo?'':`<a href="https://wa.me/${escape(cfg.phone)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`}
        ${cfg.instagram!==''?`<a href="${escape(cfg.instagram||'https://www.instagram.com/lojaeclipsecp/')}" target="_blank" rel="noopener noreferrer">Instagram</a>`:''}
        ${cfg.facebook?`<a href="${escape(cfg.facebook)}" target="_blank" rel="noopener noreferrer">Facebook</a>`:''}
      </div>
      <small class="ec-authorship"><span>© 2026 Gustavo Henrique De Inocencio Ribeiro · Desenvolvimento do site</span>${cfg.adminUrl?`<a class="ec-staff-link" href="${escape(cfg.adminUrl)}">Acessar ADM</a>`:''}</small>
    </footer>
    <dialog id="ec-welcome" class="ec-dialog ec-welcome" aria-labelledby="ec-welcome-title"><div class="ec-welcome-logo">${logo}</div><p class="ec-eyebrow">BEM-VINDO À ECLIPSE</p><h2 id="ec-welcome-title">Seu estilo começa<br>por aqui.</h2><p>Como podemos chamar você? Escolha uma preferência para descobrir peças que têm a sua cara.</p><form id="ec-profile-form"><label class="ec-field" for="ec-profile-name">Primeiro nome<input id="ec-profile-name" type="text" autocomplete="given-name" maxlength="60" required></label><fieldset class="ec-profile-choice"><legend>O que você quer explorar?</legend><label><input type="radio" name="stylePreference" value="homem" required> Moda masculina</label><label><input type="radio" name="stylePreference" value="mulher" required> Moda feminina</label></fieldset><label class="ec-consent"><input id="ec-profile-consent" type="checkbox" required><span>Concordo em salvar meu nome e minha preferência neste navegador para personalizar as sugestões. Posso alterar ou apagar esses dados a qualquer momento.</span></label><p class="ec-privacy-note">Nome e preferência são salvos apenas neste navegador. Não geram cadastro nem mensagens promocionais.</p><p id="ec-profile-error" role="alert"></p><button class="ec-button ec-dark" type="submit">DESCOBRIR MEU ESTILO ↗</button></form><button type="button" id="ec-profile-skip" class="ec-continue">Explorar sem personalizar</button><button type="button" id="ec-profile-clear" class="ec-clear-profile" hidden>Apagar minha personalização</button></dialog>
    <dialog id="ec-product" class="ec-dialog" aria-label="Detalhes do produto"><button class="ec-close" data-close aria-label="Fechar produto">×</button><div id="ec-product-content"></div></dialog>
    <dialog id="ec-cart" class="ec-dialog ec-cart-dialog" aria-labelledby="ec-cart-heading"><div class="ec-cart-title"><div><p class="ec-eyebrow">SUAS ESCOLHAS</p><h2 id="ec-cart-heading">Seu carrinho<span>.</span></h2></div><button class="ec-close" data-close aria-label="Fechar carrinho">×</button></div><p id="ec-direct-note" class="ec-cart-note" hidden>Compra deste item. Os outros produtos do seu carrinho foram preservados.</p><div id="ec-cart-items"></div><div class="ec-cart-bottom"><p class="ec-total">Total dos produtos<strong id="ec-total"></strong></p><form id="ec-order-form"><fieldset class="ec-checkout-fieldset"><legend>Como você quer receber?</legend><label><input type="radio" name="fulfilment" value="retirada"> Retirar na loja</label><label><input type="radio" name="fulfilment" value="entrega"> Entrega</label></fieldset><div id="ec-address-wrap" hidden><label class="ec-field" for="ec-address">Endereço de entrega <small>(opcional)</small></label><textarea id="ec-address" maxlength="500" rows="3" placeholder="Rua, número, bairro, cidade e CEP"></textarea><p class="ec-cart-note">O frete será confirmado pela equipe.</p></div><label class="ec-field" for="ec-payment">Forma de pagamento</label><select id="ec-payment" required><option value="">Selecione</option><option value="pix">Pix</option><option value="credito">Cartão de crédito</option><option value="debito">Cartão de débito</option><option value="dinheiro">Dinheiro</option></select><p class="ec-cart-note">A escolha será enviada à loja. O pagamento e a disponibilidade serão confirmados no atendimento.</p></form><p id="ec-checkout-error" role="alert"></p><label class="ec-field" id="ec-demo-message" hidden>Prévia da mensagem<textarea id="ec-demo-message-text" rows="7" readonly></textarea></label><button id="ec-checkout" class="ec-button ec-lime">${cfg.publicDemo&&!cfg.phone?'Simular mensagem do WhatsApp':'Continuar pelo WhatsApp ↗'}</button><a id="ec-whatsapp-ready" class="ec-button ec-lime" target="_blank" rel="noopener noreferrer" hidden>Abrir WhatsApp e enviar ↗</a><button class="ec-continue" data-close>Continuar comprando</button></div></dialog><div id="ec-toast" role="status" class="ec-toast"></div>
  </div>`;
  const $=s=>root.querySelector(s),pDialog=$('#ec-product'),cDialog=$('#ec-cart');
  function toast(text){$('#ec-toast').textContent=text;$('#ec-toast').classList.add('is-on');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#ec-toast').classList.remove('is-on'),3000);}
  async function request(path,options){if(cfg.demo)return window.ECLIPSE_DEMO.request(path,options);const response=await fetch(cfg.api+path,options);const data=await response.json();if(!response.ok)throw Error(data.message||'Não foi possível carregar. Tente novamente.');return data;}
  function invalidateQuote(){$('#ec-demo-message').hidden=true;$('#ec-whatsapp-ready').hidden=true;$('#ec-whatsapp-ready').removeAttribute('href');$('#ec-checkout').hidden=false;$('#ec-checkout-error').textContent='';}
  function save(){try{localStorage.setItem(cartStorageKey,JSON.stringify(cart));}catch{}renderCart();}
  const workingCart=()=>directItems||cart;
  function renderCart(){
    $('#ec-count').textContent=cart.reduce((n,i)=>n+i.quantity,0);
    const items=workingCart();$('#ec-direct-note').hidden=!directItems;
    $('#ec-cart-items').innerHTML=items.length?items.map((i,index)=>`<article class="ec-cart-item"><div>${imageFor(i)}</div><section><h3>${escape(i.name)}</h3><p>${escape(i.label)}</p><strong>${money(i.price)}</strong><div class="ec-qty"><button type="button" data-qty="${index}" data-delta="-1" aria-label="Diminuir quantidade de ${escape(i.name)}">−</button><span>${i.quantity}</span><button type="button" data-qty="${index}" data-delta="1" aria-label="Aumentar quantidade de ${escape(i.name)}">+</button></div></section><button type="button" data-remove="${index}" class="ec-remove" aria-label="Remover ${escape(i.name)}">×</button></article>`).join(''):'<div class="ec-empty"><h3>Seu próximo favorito está no catálogo.</h3><p>Adicione as peças que combinam com você.</p><button class="ec-outline" data-close>Continuar comprando</button></div>';
    $('#ec-total').textContent=money(items.reduce((n,i)=>n+i.price*i.quantity,0));$('#ec-order-form').hidden=!items.length;$('#ec-checkout').disabled=!items.length;invalidateQuote();
  }
  function readOrder(){return normalizeOrder({payment:$('#ec-payment').value,fulfilment:root.querySelector('input[name="fulfilment"]:checked')?.value,address:$('#ec-address').value});}
  let checkoutSequence=0;
  async function checkout(){
    const items=workingCart().map(i=>({...i}));let order;
    try{order=readOrder();}catch(error){$('#ec-checkout-error').textContent=error.message;return;}
    const turn=++checkoutSequence,signature=JSON.stringify({items,order});const button=$('#ec-checkout');button.disabled=true;button.textContent='Conferindo sua seleção…';$('#ec-checkout-error').textContent='';
    try{
      const quote=await request('quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items.map(({id,variantId,quantity,basketChoices})=>({id,variantId,quantity,basketChoices}))})});
      if(turn!==checkoutSequence||JSON.stringify({items:workingCart(),order:readOrder()})!==signature)return;
      quote.items=quote.items.map((item,index)=>items[index]?.basketChoices?{...item,basketChoices:items[index].basketChoices}:item);
      const changed=quote.items.some(i=>Math.abs((items.find(o=>key(o)===key(i))?.price??-1)-i.price)>.005);
      const updated=quote.items.map(i=>({...i,image:items.find(o=>key(o)===key(i))?.image||''}));
      if(directItems)directItems=updated;else cart=updated;save();
      const text=(cfg.demo?'TESTE DO SITE ECLIPSE — demonstração, sem compra real.\n\n':'')+messageFor(quote,order);
      if(cfg.publicDemo&&!/^[1-9][0-9]{9,14}$/.test(quote.phone)){
        $('#ec-demo-message-text').value=text;
        $('#ec-demo-message').hidden=false;
        button.hidden=true;
        $('#ec-checkout-error').textContent='Mensagem simulada. Nenhum pedido foi enviado.';
        return;
      }
      const ready=$('#ec-whatsapp-ready');ready.href=`https://wa.me/${quote.phone}?text=${encodeURIComponent(text)}`;ready.hidden=false;button.hidden=true;
      if(cfg.publicDemo)$('#ec-checkout-error').textContent='Confira a mensagem de teste e abra o WhatsApp para enviá-la ao número configurado.';
      else $('#ec-checkout-error').textContent=changed?'Os preços foram atualizados. Confira o total antes de enviar.':'Confira sua lista e envie a mensagem no WhatsApp.';
    }catch(error){$('#ec-checkout-error').textContent=error.message;}finally{button.disabled=!workingCart().length;button.textContent=cfg.publicDemo&&!cfg.phone?'Simular mensagem do WhatsApp':'Continuar pelo WhatsApp ↗';}
  }
  function activeAudience(){return state.audience;}
  function renderCategories(){
    const department=departments[state.audience];
    $('#ec-mobile-filters').textContent=department?'Filtros · '+department.label:'Filtros';
    const departmentSelect=`<label class="ec-category-select-label" for="ec-department-select">Departamento</label><select id="ec-department-select"><option value="">Todos</option>${Object.entries(departments).map(([slug,d])=>`<option value="${slug}" ${state.audience===slug?'selected':''}>${escape(d.label)}</option>`).join('')}</select>`;
    const categorySelect=department?.groups.some(group=>group.items.length)?`<label class="ec-category-select-label" for="ec-category-select">Categoria</label><select id="ec-category-select"><option value="">Todas as categorias</option>
      ${department.groups.map((group,index)=>!group.items.length?'':group.items.length===1
        ?`<option value="${group.items[0].slug}">${escape(group.items[0].name)}</option>`
        :`<optgroup label="${escape(group.name)}"><option value="grupo-${index}">Tudo em ${escape(group.name)}</option>${group.items.map(item=>`<option value="${item.slug}">${escape(item.name)}</option>`).join('')}</optgroup>`).join('')}
    </select>`:'';
    $('#ec-categories').innerHTML=departmentSelect+categorySelect;
    const select=$('#ec-category-select');
    if(select&&[...select.options].some(option=>option.value===state.category))select.value=state.category;
    root.querySelectorAll('[data-department]').forEach(link=>{
      if(link.dataset.department===state.audience)link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
  }

  function route(view='catalog',audience='',category=''){
    const q=new URLSearchParams();if(audience)q.set('publico',audience);if(category)q.set('categoria',category);
    const hash=(view==='offers'?'ofertas':view==='new'?'lancamentos':view==='home'?'inicio':'catalogo')+(q.size?'?'+q:'');
    if(location.hash==='#'+hash)applyRoute();else location.hash=hash;
  }
  function animateIn(element, distance=12){
    if(!element?.animate||reduceMotion.matches)return;
    element.getAnimations().forEach(animation=>animation.cancel());
    element.animate([{opacity:0,transform:`translateY(${distance}px)`},{opacity:1,transform:'translateY(0)'}],
      {duration:260,easing:'cubic-bezier(.2,.75,.25,1)'});
  }
  const mobileLayout=window.matchMedia('(max-width: 760px)');
  function setMobileMenu(open){
    $('#ec-mobile-menu').setAttribute('aria-expanded',String(open));
    $('#ec-department-menu').toggleAttribute('data-mobile-open',open);
    if(!open)root.querySelectorAll('.ec-nav-dept[open]').forEach(menu=>menu.open=false);
  }
  function setMobileFilters(open){
    $('#ec-mobile-filters').setAttribute('aria-expanded',String(open));
    $('#ec-categories').toggleAttribute('data-mobile-open',open);
  }
  function applyRoute(){
    setMobileMenu(false);
    setMobileFilters(false);
    const [path,query]=(location.hash.slice(1)||'inicio').split('?'),q=new URLSearchParams(query||'');
    state={view:path==='ofertas'?'offers':path==='lancamentos'?'new':path==='inicio'?'home':'catalog',audience:audiences.some(([s])=>s===q.get('publico'))?q.get('publico'):['crianca','adolescente'].includes(q.get('publico'))?'infantil':'',category:q.get('categoria')||'',offerType:q.get('tipo')==='combos'?'combos':'promotions',order:'recent',search:'',stock:false,page:1};
    $('.ec-search input').value='';$('#ec-in-stock').checked=false;
    root.querySelectorAll('.ec-nav-dept[open]').forEach(d=>d.open=false);
    const home=state.view==='home';$('#ec-launches').hidden=!home;$('#ec-campaign').hidden=!home;$('#ec-offer-feature').hidden=!home;$('#ec-back-home').hidden=home;
    $('#ec-catalog').classList.toggle('ec-offers-page',state.view==='offers');
    const publicName=audiences.find(([s])=>s===state.audience)?.[1]||'';
    $('#ec-catalog-title').textContent=(state.view==='offers'?'OFERTAS':state.view==='new'?'LANÇAMENTOS':'CATÁLOGO')+(publicName?' · '+publicName:'');
    $('#ec-catalog-eyebrow').textContent=state.view==='offers'?'PREÇOS ESPECIAIS · SELEÇÃO ECLIPSE':'ENCONTRE SEU PRÓXIMO FAVORITO';
    $('#ec-offer-bar').hidden=state.view!=='offers';
    $('#ec-offer-types').hidden=state.view!=='offers';
    $('#ec-offer-order').value=state.order;
    root.querySelectorAll('[data-offer-type]').forEach(link=>{
      link.classList.toggle('is-active',link.dataset.offerType===state.offerType);
      if(link.dataset.offerType===state.offerType)link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    renderCategories();load();
    animateIn($('#ec-catalog .ec-section-head'));
    if(home){loadPersonalSelections();window.scrollTo({top:0,behavior:reduceMotion.matches?'instant':'smooth'});}else $('#ec-catalog').scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth'});
  }
  const componentRequests=new Map();
  function readComboComponent(id){
    if(!componentRequests.has(id)){
      const pending=request('products/'+id).catch(()=>null).finally(()=>componentRequests.delete(id));
      componentRequests.set(id,pending);
    }
    return componentRequests.get(id);
  }
  async function withComboPhotos(product){
    const members=product.basket;
    if(!Array.isArray(members)||!members.length)return product;
    const existing=product.basketOptions||[];
    if(existing.length===members.length&&existing.every(option=>validPhoto(option.image)))return product;
    const basketOptions=await Promise.all(members.map(async (entry,index)=>{
      const known=existing[index];
      if(known&&validPhoto(known.image))return known;
      const item=await readComboComponent(entry.id);
      if(!item)return known||{name:'Produto indisponível',image:'',variants:[]};
      const allowed=entry.variantIds||[entry.variantId];
      const variants=(item.variants||[]).filter(v=>v.available&&allowed.includes(v.id));
      const image=[item.image,variants[0]?.image,...(item.images||[])].find(validPhoto)||'';
      return {name:item.name,image,variants:known?.variants||variants.map(variant=>{
        const attributes=variantAttributes(variant);
        return {id:variant.id,label:variant.label,color:attributes.Cor,size:attributes.Tamanho};
      })};
    }));
    return {...product,basketOptions,available:product.available&&basketOptions.every(item=>item.variants.length)};
  }
  const isCombo=product=>Boolean(product.basket?.length||product.basketOptions?.length||product.modelType==='combo'||product.modelType==='cesta');
  async function listProducts(params, turn){
    const page=await request('products?'+params);
    const type=params.get('offerType');
    if(type!=='promotions'&&type!=='combos')return page;
    const matches=product=>product.sale&&isCombo(product)===(type==='combos');
    if(page.products.every(matches))return page;

    // If an older server returns mixed offers, partition them before paginating.
    const fallback=new URLSearchParams(params);
    fallback.delete('offerType');
    fallback.set('page','1');
    fallback.set('limit','24');
    const first=await request('products?'+fallback);
    const products=[...first.products];
    for(let number=2;number<=first.pages&&turn===listSequence;number++){
      fallback.set('page',String(number));
      products.push(...(await request('products?'+fallback)).products);
    }
    const filtered=[...new Map(products.filter(matches).map(product=>[product.id,product])).values()];
    const start=(Number(params.get('page'))-1)*24;
    return {products:filtered.slice(start,start+24),total:filtered.length,pages:Math.ceil(filtered.length/24)};
  }
  async function load(){
    const turn=++listSequence;$('#ec-grid').innerHTML='<p class="ec-loading">Carregando produtos…</p>';$('#ec-grid').setAttribute('aria-busy','true');$('#ec-prev').disabled=$('#ec-next').disabled=true;
    try{
      const scope=state.view==='offers'?'offers':state.view==='new'?'new':'all';
      const group=state.category.match(/^grupo-(\d+)$/);
      const category=group?((window.ECLIPSE_DEPARTMENTS||{})[state.audience]?.groups[Number(group[1])]?.items||[]).map(item=>item.slug).join(','):state.category;
      const data=await listProducts(new URLSearchParams({scope,offerType:state.view==='offers'?state.offerType:'',order:state.order||'recent',audience:activeAudience(),category,search:state.search,page:state.page,stock:state.stock?'1':'0'}),turn);
      if(turn!==listSequence)return;
      const products=await Promise.all(data.products.map(withComboPhotos));
      if(turn!==listSequence)return;pages=Number(data.pages)||1;
      $('#ec-results').textContent=`${data.total} ${data.total===1?'produto':'produtos'}`;
      const isComboPage=state.view==='offers'&&state.offerType==='combos';
      const hasFilters=Boolean(state.audience||state.category||state.search||state.stock);
      const emptyTitle=isComboPage?'Nenhum combo encontrado.':'Nenhum produto encontrado.';
      const emptyHint=hasFilters?'Limpe os filtros para ver todos os resultados.':isComboPage?'Os combos publicados aparecerão aqui.':'Confira outra seleção do catálogo.';
      $('#ec-grid').innerHTML=products.map(card).join('')||`<div class="ec-empty"><h3>${emptyTitle}</h3><p>${emptyHint}</p>${hasFilters?'<button id="ec-reset" class="ec-outline">Limpar filtros</button>':''}</div>`;
      animateIn($('#ec-grid'),8);
      $('#ec-page').textContent=`${state.page} / ${pages}`;$('#ec-prev').disabled=state.page<=1;$('#ec-next').disabled=state.page>=pages;
    }catch(error){if(turn!==listSequence)return;$('#ec-grid').innerHTML=`<div class="ec-empty"><p>${escape(error.message)}</p><button id="ec-retry" class="ec-outline">Tentar novamente</button></div>`;}finally{if(turn===listSequence)$('#ec-grid').removeAttribute('aria-busy');}
  }
  async function openProduct(id){
    const turn=++productSequence;current=null;choices={};shownPhotoColor=undefined;$('#ec-product-content').innerHTML='<p class="ec-loading">Carregando detalhes…</p>';pDialog.showModal();animateIn(pDialog,10);
    try{
      const p=await withComboPhotos(await request(`products/${id}`));if(!pDialog.open||turn!==productSequence)return;current=p;
      $('#ec-product-content').innerHTML=`<div class="ec-gallery">${p.basketOptions?.length?comboCarousel(p):`<div class="ec-product-photo">
        <div class="ec-detail-image" id="ec-main-photo"></div>
        <div class="ec-combo-controls ec-gallery-controls" id="ec-gallery-controls" hidden>
          <button type="button" data-gallery-step="-1" aria-label="Foto anterior">‹</button>
          <button type="button" data-gallery-step="1" aria-label="Próxima foto">›</button>
        </div>
      </div><div class="ec-thumbnails" id="ec-photo-thumbnails" aria-label="Fotos da cor do produto"></div>`}</div><div class="ec-detail"><p class="ec-eyebrow">${escape([...new Set(p.categories||[])].join(' / '))}</p><h2>${escape(p.name)}</h2>${p.description?`<p>${escape(p.description)}</p>`:''}<p class="ec-detail-price">${money(p.price)}</p>${p.type==='variable'?'<div id="ec-variant-controls"></div>':''}<p id="ec-selected-stock" role="status" class="ec-stock-status">${p.available?'Selecione uma combinação para consultar a disponibilidade.':'Produto indisponível.'}</p><label class="ec-field">Quantidade<input id="ec-quantity" type="number" min="1" max="99" value="1" inputmode="numeric"></label><p id="ec-product-error" role="alert"></p><div class="ec-buy-actions"><button class="ec-button ec-dark" id="ec-add" ${!p.available?'disabled':''}>Adicionar ao carrinho ${bag}</button><button class="ec-direct" id="ec-direct" ${!p.available?'disabled':''}>Comprar só este item ↗</button></div><p class="ec-detail-note">Escolha pagamento e recebimento na próxima etapa.</p></div>`;
      animateIn($('#ec-product-content'),8);
      if(p.basketOptions){
        $('#ec-variant-controls').innerHTML=p.basketOptions.map(option=>`
          <label class="ec-field">${escape(option.name)}
           <select data-basket-choice aria-label="Cor e tamanho de ${escape(option.name)}">
            <option value="">Escolha a cor e o tamanho</option>
            ${comboSizeOptions(option.variants)}
           </select>
          </label>`).join('');
        $('#ec-selected-stock').textContent=p.available?'Escolha uma opção por produto.':'Combo indisponível.';
      }else if(p.type==='variable')renderVariantControls();
      else renderProductPhotos(null);
    }catch(error){if(turn===productSequence)$('#ec-product-content').innerHTML=`<p class="ec-loading">${escape(error.message)}</p>`;}
  }
  function selectedColor(){const group=variantGroups(current).find(g=>/^(cor|color|colour)$/i.test(g.name));return group&&choices[group.name]?choices[group.name]:null;}
  function showProductPhoto(index){
    const images=galleryPhotos(current,shownPhotoColor);
    if(!images.length)return;
    photoIndex=(index+images.length)%images.length;
    $('#ec-main-photo').innerHTML=imageFor({...current,image:images[photoIndex]});
    $('#ec-photo-thumbnails').querySelectorAll('[data-photo]').forEach((button,i)=>{
      button.classList.toggle('is-active',i===photoIndex);
      button.setAttribute('aria-pressed',String(i===photoIndex));
    });
  }
  function renderProductPhotos(color){
    if(shownPhotoColor===color)return;
    shownPhotoColor=color;
    photoIndex=0;
    const images=galleryPhotos(current,color);
    $('#ec-gallery-controls').hidden=images.length<2;
    $('#ec-photo-thumbnails').innerHTML=images.map((url,i)=>`<button type="button" data-photo="${i}" aria-label="Ver foto ${i+1}"><img src="${escape(url)}" alt="${escape(current.name)} — foto ${i+1}" loading="lazy"></button>`).join('');
    if(images.length)showProductPhoto(0);
    else $('#ec-main-photo').innerHTML=imageFor({...current,image:''});
  }
  function renderVariantControls(){
    $('#ec-variant-controls').innerHTML=variantGroups(current).map((g,index)=>`<fieldset class="ec-option-group"><legend>${escape(isSize(g.name)?'Tamanho (BR)':g.name)}${choices[g.name]?`: <strong>${escape(choices[g.name])}</strong>`:''}</legend><div class="ec-option-list">${g.values.map(value=>{const available=optionAvailable(current,choices,g.name,value);return `<button type="button" class="ec-option ${isSize(g.name)?'ec-size-circle':'ec-color-option'} ${choices[g.name]===value?'is-selected':''}" data-option-group="${index}" data-option-value="${escape(value)}" aria-pressed="${choices[g.name]===value}" ${available||!isSize(g.name)?'':'disabled'} aria-label="${escape(g.name+': '+value+(available?'':' — indisponível'))}">${escape(value)}</button>`;}).join('')}</div></fieldset>`).join('');
    const v=matchingVariant(current,choices);$('.ec-detail-price').textContent=money(v?.price??current.price);
    $('#ec-selected-stock').textContent=v?(v.available?'Disponível':'Indisponível'):'Selecione cor e tamanho disponíveis.';
    $('#ec-quantity').max=v?.max??99;
    renderProductPhotos(selectedColor());
  }
  function selection(){
    const p=current;
    if(p.basketOptions){
      const inputs=[...root.querySelectorAll('[data-basket-choice]')];
      const basketChoices=inputs.map(input=>Number(input.value));
      if(!p.available||basketChoices.some(id=>!id))throw Error('Escolha uma cor e um tamanho para cada produto do combo.');
      const quantity=Number($('#ec-quantity').value);
      if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw Error('Informe uma quantidade entre 1 e 99.');
      const label=p.basketOptions.map((option,index)=>option.name+' ('+option.variants.find(v=>v.id===basketChoices[index]).label+')').join('; ');
      const image=p.basketOptions.find(item=>validPhoto(item.image))?.image||p.image;
      return {id:p.id,variantId:p.variants[0].id,name:p.name,sku:p.sku,image,label,quantity,price:p.price,basketChoices};
    }
    const v=p.type==='variable'?matchingVariant(p,choices):null;
    if(p.type==='variable'&&!v)throw Error('Selecione a cor e o tamanho disponíveis.');
    const quantity=Number($('#ec-quantity').value);
    if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw Error('Informe uma quantidade entre 1 e 99.');
    if(v?.max!==null&&v?.max!==undefined&&quantity>v.max)throw Error('Quantidade acima do estoque disponível.');
    return{id:p.id,variantId:v?.id||0,name:p.name,sku:p.sku,image:p.colorImages?(galleryPhotos(p,selectedColor())[0]||''):(v?.image||p.image),label:v?.label||'',quantity,price:v?.price??p.price,max:v?.max??null};
  }
  const welcome=$('#ec-welcome');
  let featureSequence=0;const selectionCache=new Map();
  async function selectionPool(scope,audience){
    const cacheKey=scope+':'+audience;if(scope!=='offers'&&selectionCache.has(cacheKey))return selectionCache.get(cacheKey);
    let list=[],page=1,pages=1;
    do {const data=await request('products?'+new URLSearchParams({scope,audience,limit:24,page,stock:'1'}));list.push(...await Promise.all(data.products.map(withComboPhotos)));pages=data.pages||1;page++;}while(page<=pages&&page<=24);
    if(scope!=='offers')selectionCache.set(cacheKey,list);return list;
  }
  function previousPair(key){try{return JSON.parse(sessionStorage.getItem(key)||'[]');}catch{return [];}}
  function rememberPair(key,pair){try{sessionStorage.setItem(key,JSON.stringify(pair.map(p=>p.id)));}catch{}}
  async function loadPersonalSelections(){
    const turn=++featureSequence,audience=profile?.audience||'',prefix='eclipse-home-v2:'+audience;
    $('#ec-new-grid').innerHTML='<p class="ec-loading">Escolhendo seus próximos favoritos…</p>';
    $('#ec-offer-grid').innerHTML='<p class="ec-loading">Selecionando ofertas…</p>';
    $('#ec-campaign-products').innerHTML='';
    try{
      const [offerPool,catalogPool]=await Promise.all([selectionPool('offers',audience),selectionPool('all',audience)]);
      if(turn!==featureSequence)return;
      const arrivals=randomSelection(offerPool,6,audience,previousPair(prefix+':arrivals'));
      const offers=offerPool.filter(p=>audience?matchesPreference(p,audience):['homem','mulher'].some(group=>matchesPreference(p,group)))
        .sort((a,b)=>offerDate(b)-offerDate(a)||b.id-a.id).slice(0,6);
      rememberPair(prefix+':arrivals',arrivals);
      $('#ec-new-grid').innerHTML=arrivals.map(card).join('')||'<p class="ec-loading">Ofertas chegam em breve.</p>';
      $('#ec-offer-grid').innerHTML=offers.map(card).join('')||'<p class="ec-loading">Ofertas chegam em breve.</p>';
      const campaignPool=catalogPool.filter(p=>!arrivals.some(n=>n.id===p.id));
      const campaign=selectDistinctPair(campaignPool,audience,previousPair(prefix+':campaign'));
      rememberPair(prefix+':campaign',campaign);
      $('#ec-campaign-products').innerHTML=campaign.map(p=>`<button class="ec-product-open ec-campaign-product ${['tenis','sandalia'].includes(p.modelType)?'ec-campaign-contain':''}" data-id="${p.id}" aria-label="Ver ${escape(p.name)}">${imageFor(p).replace('loading="lazy"','loading="eager"')}<span><small>${escape((p.categories||[])[0]||'')}</small><strong>${escape(p.name)}</strong><b>VER PRODUTO ↗</b></span></button>`).join('');
    }catch{if(turn===featureSequence){$('#ec-new-grid').innerHTML='<p class="ec-loading">Não foi possível carregar as novidades agora.</p>';$('#ec-offer-grid').innerHTML='<p class="ec-loading">Tente novamente em instantes.</p>';}}
  }
  function updateGreeting(){
    $('#ec-greeting').textContent=profile?`Olá, ${profile.name.split(' ')[0]}! Vamos descobrir seu próximo favorito?`:'Seu próximo favorito está esperando por você.';
    $('#ec-personalize').textContent=profile?'Alterar minhas preferências':'Personalizar minha experiência';
  }
  function openWelcome(){
    $('#ec-profile-name').value=profile?.name||'';$('#ec-profile-consent').checked=!!profile;
    root.querySelectorAll('input[name="stylePreference"]').forEach(input=>input.checked=input.value===profile?.audience);
    $('#ec-profile-clear').hidden=!profile;$('#ec-profile-skip').textContent=profile?'Voltar sem alterar':'Explorar sem personalizar';$('#ec-profile-error').textContent='';welcome.showModal();
  }
  $('#ec-profile-form').addEventListener('submit',event=>{
    event.preventDefault();const input={name:$('#ec-profile-name').value,audience:root.querySelector('input[name="stylePreference"]:checked')?.value,consent:$('#ec-profile-consent').checked};
    const next=normalizeProfile(input);if(!next){$('#ec-profile-error').textContent='Informe seu nome, escolha uma preferência e confirme o aceite.';return;}
    profile=next;try{localStorage.setItem(profileKey,JSON.stringify(profile));}catch{}
    welcome.close();updateGreeting();renderCategories();load();loadPersonalSelections();
  });
  $('#ec-personalize').addEventListener('click',openWelcome);
  $('#ec-profile-skip').addEventListener('click',()=>welcome.close());
  $('#ec-profile-clear').addEventListener('click',()=>{try{localStorage.removeItem(profileKey);Object.keys(sessionStorage).filter(key=>key.startsWith('eclipse-pair-v1:')||key.startsWith('eclipse-home-v2:')).forEach(key=>sessionStorage.removeItem(key));}catch{}profile=null;welcome.close();updateGreeting();renderCategories();load();loadPersonalSelections();});
  $('#ec-explore-personal').addEventListener('click',()=>route('catalog',profile?.audience||''));
  root.addEventListener('click',event=>{
    const offerLink=event.target.closest('a[data-offer-type],a.ec-offer-nav');
    if(offerLink&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){
      event.preventDefault();
      if(offerLink.hash!==location.hash)history.pushState(null,'',offerLink.hash);
      applyRoute();
      return;
    }
    const button=event.target.closest('button');if(!button)return;
    if(button.id==='ec-mobile-menu'){
      setMobileMenu(button.getAttribute('aria-expanded')!=='true');
      return;
    }
    if(button.id==='ec-mobile-filters'){
      setMobileFilters(button.getAttribute('aria-expanded')!=='true');
      return;
    }
    if(button.hasAttribute('data-close')){button.closest('dialog')?.close();return;}
    if(button.hasAttribute('data-combo-photo')){
      const carousel=button.closest('[data-combo-carousel]');
      moveComboSlide(carousel,Number(button.dataset.comboPhoto)-Number(carousel.dataset.slide));
      return;
    }
    if(button.dataset.comboStep){
      moveComboSlide(button.closest('[data-combo-carousel]'),Number(button.dataset.comboStep));
      return;
    }
    if(button.hasAttribute('data-combo-pause')){
      const carousel=button.closest('[data-combo-carousel]');
      const paused=carousel.dataset.paused!=='true';
      carousel.dataset.paused=String(paused);
      carousel.dataset.rotatedAt=String(Date.now());
      button.setAttribute('aria-pressed',String(paused));
      button.setAttribute('aria-label',paused?'Retomar rotação das fotos':'Pausar rotação das fotos');
      button.textContent=paused?'▶':'Ⅱ';
      return;
    }
    if(button.dataset.galleryStep){
      showProductPhoto(photoIndex+Number(button.dataset.galleryStep));
      return;
    }
    if(button.hasAttribute('data-route')){route(button.dataset.route,button.dataset.audience||'',button.dataset.category||'');return;}
    if(button.classList.contains('ec-cart-open')){directItems=null;renderCart();cDialog.showModal();animateIn(cDialog,10);}
    if(button.classList.contains('ec-product-open'))openProduct(Number(button.dataset.id));
    if(button.hasAttribute('data-option-group')){
      const index=Number(button.dataset.optionGroup),groups=variantGroups(current),group=groups[index];choices[group.name]=button.dataset.optionValue;
      groups.slice(index+1).forEach(g=>{if(choices[g.name]&&!optionAvailable(current,choices,g.name,choices[g.name]))delete choices[g.name];});$('#ec-product-error').textContent='';renderVariantControls();
      [...root.querySelectorAll(`[data-option-group="${index}"]`)].find(b=>b.dataset.optionValue===button.dataset.optionValue)?.focus();
    }
    if(button.hasAttribute('data-photo'))showProductPhoto(Number(button.dataset.photo));
    if(button.hasAttribute('data-category-filter')){state.category=button.dataset.categoryFilter;state.page=1;renderCategories();load();}
    if(button.id==='ec-retry')load();
    if(button.id==='ec-reset'){
      if(state.view==='offers'){
        const hash=state.offerType==='combos'?'#ofertas?tipo=combos':'#ofertas';
        if(location.hash===hash)applyRoute();else location.hash=hash;
        return;
      }
      state.category='';state.search='';state.stock=false;state.page=1;
      $('.ec-search input').value='';$('#ec-in-stock').checked=false;
      renderCategories();load();
    }
    if(button.id==='ec-prev'||button.id==='ec-next'){state.page+=button.id==='ec-next'?1:-1;load();$('#ec-catalog').scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth'});}
    if(button.hasAttribute('data-remove')){workingCart().splice(Number(button.dataset.remove),1);save();checkoutSequence++;}
    if(button.hasAttribute('data-qty')){const i=workingCart()[Number(button.dataset.qty)],next=Math.max(1,Math.min(99,i.quantity+Number(button.dataset.delta)));if(Number.isInteger(i.max)&&next>i.max){toast('Quantidade acima do estoque disponível.');return;}i.quantity=next;save();checkoutSequence++;}
    if(button.id==='ec-add'||button.id==='ec-direct'){
      try{const item=selection();if(button.id==='ec-direct'){directItems=[item];renderCart();pDialog.close();cDialog.showModal();animateIn(cDialog,10);}else{const existing=cart.find(i=>key(i)===key(item));if(Number.isInteger(item.max)&&(existing?.quantity||0)+item.quantity>item.max)throw Error('A soma no carrinho excede o estoque desta combinação.');cart=mergeItem(cart,item);directItems=null;save();pDialog.close();toast('Adicionado ao carrinho.');}}catch(error){$('#ec-product-error').textContent=error.message;}
    }
    if(button.id==='ec-checkout')checkout();
  });
  root.addEventListener('change',event=>{
    if(event.target.id==='ec-department-select'){
      if(state.view==='offers'){
        const q=new URLSearchParams();
        if(event.target.value)q.set('publico',event.target.value);
        if(state.offerType==='combos')q.set('tipo','combos');
        location.hash='#ofertas'+(q.size?'?'+q:'');
      }else route(state.view==='home'?'catalog':state.view,event.target.value);
    }
    if(event.target.id==='ec-category-select'){
      state.category=event.target.value;
      state.page=1;
      load();
    }
    if(event.target.id==='ec-offer-order'){state.order=event.target.value;state.page=1;load();}
    if(event.target.id==='ec-in-stock'){state.stock=event.target.checked;state.page=1;load();}
    if(event.target.closest('#ec-order-form')){checkoutSequence++;invalidateQuote();$('#ec-address-wrap').hidden=root.querySelector('input[name="fulfilment"]:checked')?.value!=='entrega';}
  });
  $('#ec-address').addEventListener('input',()=>{checkoutSequence++;invalidateQuote();});
  $('#ec-order-form').addEventListener('submit',event=>event.preventDefault());
  const searchInput=$('.ec-search input');
  function filterCatalog(){
    const search=searchInput.value.trim();
    if(search===state.search)return;
    state.search=search;
    state.page=1;
    load();
  }
  searchInput.addEventListener('input',event=>{if(!event.isComposing)filterCatalog();});
  searchInput.addEventListener('compositionend',filterCatalog);
  $('.ec-search').addEventListener('submit',event=>{
    event.preventDefault();
    filterCatalog();
    $('#ec-catalog').scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth'});
  });
  root.querySelectorAll('.ec-nav-dept').forEach(d=>d.addEventListener('toggle',event=>{if(event.target===d&&d.open)root.querySelectorAll('.ec-nav-dept').forEach(other=>{if(other!==d)other.open=false;});}));
  root.addEventListener('keydown',event=>{if(event.key==='Escape')root.querySelectorAll('.ec-nav-dept').forEach(d=>d.open=false);});
  const departmentMenus=[...root.querySelectorAll('.ec-nav-dept')];
  const hoverMenu=window.matchMedia('(hover: hover) and (pointer: fine)');
  for(const menu of departmentMenus){
    menu.addEventListener('pointerenter',event=>{
      if(!hoverMenu.matches||event.pointerType!=='mouse')return;
      departmentMenus.forEach(other=>other.open=other===menu);
    });
    menu.addEventListener('pointerleave',event=>{
      if(hoverMenu.matches&&event.pointerType==='mouse'&&!menu.contains(document.activeElement))menu.open=false;
    });
    menu.querySelector('summary').addEventListener('click',event=>{
      if(hoverMenu.matches&&event.detail>0&&menu.open)event.preventDefault();
      departmentMenus.filter(other=>other!==menu).forEach(other=>other.open=false);
    });
    menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>menu.open=false));
  }
  root.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(mobileLayout.matches&&$('#ec-mobile-menu').getAttribute('aria-expanded')==='true'){
      setMobileMenu(false);
      $('#ec-mobile-menu').focus();
      return;
    }
    const menu=departmentMenus.find(item=>item.open);
    if(menu){menu.open=false;menu.querySelector('summary').focus();}
  });
  document.addEventListener('click',event=>{
    if(!event.target.closest('.ec-audience-nav,#ec-mobile-menu'))setMobileMenu(false);
  });
  $('#ec-department-menu').addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    if(!link||!mobileLayout.matches)return;
    setMobileMenu(false);
    if(link.hash===location.hash)applyRoute();
  });
  mobileLayout.addEventListener('change',()=>setMobileMenu(false));
  root.addEventListener('error',event=>{if(event.target.tagName==='IMG'&&event.target.nextElementSibling?.classList.contains('ec-photo-fallback')){event.target.hidden=true;event.target.nextElementSibling.hidden=false;}},true);
  [pDialog,cDialog].forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
  window.addEventListener('hashchange',applyRoute);
  renderCart();updateGreeting();applyRoute();if(!profile)openWelcome();
})();

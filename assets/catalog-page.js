/* Catalog entries identify models. Only separately validated evidence grants a checked badge. */
(() => {
  'use strict';
  const root = document.getElementById('mira-label-landing');
  const PAGE_SIZE = 12;
  const LANGUAGES = ['ru', 'en', 'zh-CN'];
  const state = {...window.miraPreferences, page:1};
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  const search = root.querySelector('[data-catalog-search]');
  const list = root.querySelector('[data-model-list]');
  const errors = root.querySelector('[data-catalog-error]');
  let catalog;
  let registry;
  let release;
  let registryFailed = false;
  let releaseFailed = false;
  let catalogFailed = false;
  let copy;

  const svg = body => `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const icons = {
    moon:svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
    sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'),
    check:svg('<path d="m20 6-11 11-5-5"/>'),
    pending:svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/>'),
    external:svg('<path d="M15 3h6v6m0-6-9 9m-3-9H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>')
  };
  const theme = () => state.theme === 'auto' ? (systemTheme.matches ? 'dark' : 'light') : state.theme;
  const text = (key, values = {}) => {
    let value = copy?.[state.language]?.[key] || copy?.ru?.[key] || key;
    for (const [name, replacement] of Object.entries(values)) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  };
  const node = (tag, className, value) => {
    const el = document.createElement(tag);
    if (className) el.className=className;
    if (value !== undefined) el.textContent=String(value);
    return el;
  };
  const number = value => new Intl.NumberFormat(state.language).format(value);
  const persist = () => {
    try { localStorage.setItem('miralabel.landing.v1', JSON.stringify({language:state.language,theme:state.theme,format:state.format})); } catch {}
  };
  try {
    const query = new URL(location.href).searchParams;
    search.value = (query.get('q') || '').slice(0,100);
    const language = query.get('lang');
    if (LANGUAGES.includes(language)) {
      state.language = language;
      persist();
    }
  } catch {}
  const hasOwnerCheck = model => Boolean(registry && model.name === 'D11_H' && model.modelCodes.includes(528) &&
    registry.profiles.some(profile => profile.modelId === 528 && profile.ownerStatus === 'verified'));

  function renderModels() {
    const count = root.querySelector('[data-catalog-count]');
    const table = root.querySelector('[data-catalog-table]');
    const empty = root.querySelector('[data-catalog-empty]');
    const pagination = root.querySelector('[data-catalog-pagination]');
    const totals = root.querySelector('[data-catalog-totals]');
    root.querySelector('[data-catalog-clear]').hidden = !search.value;
    errors.replaceChildren();
    for (const [failed,key] of [[catalogFailed,'catalogUnavailable'],[registryFailed,'registryUnavailableCatalog'],[releaseFailed,'releaseUnavailableCatalog']]) {
      if (failed) errors.append(node('p','',text(key)));
    }
    errors.hidden = !errors.childElementCount;
    if (!catalog) {
      count.textContent = catalogFailed ? '' : text('loadingCatalog');
      table.hidden=true;
      empty.hidden=true;
      pagination.hidden=true;
      totals.replaceChildren();
      return;
    }
    const checked = catalog.models.filter(hasOwnerCheck).length;
    totals.replaceChildren();
    for (const [key,value] of [['models',catalog.models.length],['verified',checked],['unchecked',catalog.models.length-checked]]) {
      const el = node('span','ml-catalog-total',text({models:'totalModels',verified:'totalVerified',unchecked:'totalUnchecked'}[key],{count:number(value)}));
      el.dataset.total=key;
      el.dataset.count=String(value);
      totals.append(el);
    }
    const filtered = MiraModels.filter(catalog,search.value);
    const pages = Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
    state.page=Math.max(1,Math.min(state.page,pages));
    const start = (state.page-1)*PAGE_SIZE;
    const visible = filtered.slice(start,start+PAGE_SIZE);
    count.textContent=filtered.length ? text('catalogCount',{count:number(filtered.length),start:number(start+1),end:number(start+visible.length)}) : text('catalogCountEmpty');
    count.dataset.total=String(filtered.length);
    list.replaceChildren();
    for (const model of visible) {
      const row = node('tr');
      row.dataset.modelId=model.id;
      row.dataset.modelName=model.name;
      const identification = node('td');
      identification.append(node('div','ml-model-name',`NIIMBOT ${model.name}`));
      if (model.modelCodes.length) identification.append(node('p','ml-model-codes',text('modelCodes',{codes:model.modelCodes.join(', ')})));
      if (model.testOnly) identification.append(node('span','ml-model-test',text('testOnlyModel')));
      const statusCell=node('td');
      const checked=hasOwnerCheck(model);
      const status=node('span','ml-model-status');
      status.dataset.status=checked?'owner-verified':'untested';
      status.innerHTML=icons[checked?'check':'pending'];
      status.append(document.createTextNode(text(checked?'modelVerified':'modelUnchecked')));
      if (checked) status.title=text('ownerVerifiedDetails');
      statusCell.append(status);
      const actionCell=node('td');
      if (release) {
        const action=node('a','ml-model-report');
        action.href=MiraModels.reportURL(state.language,release.version,model);
        action.target='_blank';
        action.rel='noopener noreferrer';
        action.dataset.modelReport=model.id;
        action.setAttribute('aria-label',text('modelReportAria',{model:model.name}));
        action.append(node('span','',text('modelReport')));
        const icon=node('span');icon.innerHTML=icons.external;action.append(icon);
        actionCell.append(action);
      } else {
        const unavailable=node('span','ml-model-codes',text('reportUnavailable'));
        actionCell.append(unavailable);
      }
      row.append(identification,statusCell,actionCell);
      list.append(row);
    }
    table.hidden=!filtered.length;
    empty.hidden=Boolean(filtered.length);
    pagination.hidden=pages<=1;
    root.querySelector('[data-page-prev]').disabled=state.page<=1;
    root.querySelector('[data-page-next]').disabled=state.page>=pages;
    root.querySelector('[data-page-label]').textContent=text('pageLabel',{page:number(state.page),pages:number(pages)});
    pagination.dataset.page=String(state.page);
    pagination.dataset.pages=String(pages);
  }

  function render() {
    if (!copy) return;
    document.documentElement.lang=state.language;
    document.documentElement.dataset.theme=theme();
    document.title=text('pageTitle');
    document.querySelector('meta[name="description"]').content=text('pageDescription');
    root.querySelectorAll('[data-i18n]').forEach(el => {el.textContent=text(el.dataset.i18n);});
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {el.setAttribute('aria-label',text(el.dataset.i18nAria));});
    root.querySelector('[data-lang]').value=state.language;
    root.querySelector('[data-lang]').setAttribute('aria-label',text('language'));
    search.placeholder=text('searchPlaceholder');
    root.querySelector('[data-catalog-clear]').setAttribute('aria-label',text('clearSearch'));
    root.querySelector('[data-catalog-pagination]').setAttribute('aria-label',text('pagination'));
    root.querySelector('[data-i18n="catalogNotice"]').textContent=text(registryFailed?'catalogNoticeUnknown':'catalogNotice');
    const toggle=root.querySelector('[data-toggle-theme]');
    toggle.setAttribute('aria-label',text(theme()==='light'?'toDark':'toLight'));
    toggle.setAttribute('aria-pressed',String(theme()==='dark'));
    toggle.innerHTML=icons[theme()==='light'?'moon':'sun'];
    renderModels();
    if (release && window.MiraCommunity) MiraCommunity.render({root,registry,release,language:state.language,copy,error:registryFailed});
    else {
      root.querySelector('[data-registry-summary]').replaceChildren();
      root.querySelector('[data-registry-list]').replaceChildren(node('p','ml-registry-error',text('registryUnavailable')));
      root.querySelectorAll('[data-report-link]').forEach(link=>{link.removeAttribute('href');link.setAttribute('aria-disabled','true');});
    }
  }

  function clearSearch() {
    search.value='';state.page=1;renderModels();search.focus();
  }
  search.addEventListener('input',()=>{state.page=1;renderModels();});
  search.addEventListener('keydown',event=>{if(event.key==='Escape' && search.value){event.preventDefault();clearSearch();}});
  root.querySelector('[data-catalog-clear]').addEventListener('click',clearSearch);
  root.querySelector('[data-empty-clear]').addEventListener('click',clearSearch);
  for (const [selector,direction] of [['[data-page-prev]',-1],['[data-page-next]',1]]) {
    root.querySelector(selector).addEventListener('click',()=>{
      const focused=root.querySelector(selector);
      state.page+=direction;
      renderModels();
      // The browser may drop keyboard focus when the final/first page disables its button.
      if (focused.disabled) root.querySelector(direction>0?'[data-page-prev]':'[data-page-next]').focus({preventScroll:true});
    });
  }
  root.querySelector('[data-lang]').addEventListener('change',event=>{state.language=event.target.value;render();persist();});
  root.querySelector('[data-toggle-theme]').addEventListener('click',()=>{state.theme=theme()==='light'?'dark':'light';render();persist();});
  systemTheme.addEventListener('change',()=>{if(state.theme==='auto')render();});
  window.addEventListener('storage',event=>{
    if(event.key!=='miralabel.landing.v1')return;
    try {
      const next=JSON.parse(event.newValue||'{}');
      if(LANGUAGES.includes(next.language))state.language=next.language;
      if(['light','dark','auto'].includes(next.theme))state.theme=next.theme;
      if(['setup','zip'].includes(next.format))state.format=next.format;
      render();
    } catch {}
  });

  async function json(path) {
    const response=await fetch(path,{cache:'no-cache'});
    if(!response.ok)throw new Error('Unavailable data');
    return response.json();
  }
  Promise.allSettled([
    Promise.all(['assets/copy.json','assets/community-copy.json','assets/catalog-copy.json'].map(json)).then(([base,community,local])=>{
      copy=Object.fromEntries(LANGUAGES.map(language=>[language,{...base[language],...community[language],...local[language]}]));
      if(!LANGUAGES.every(language=>typeof copy[language].catalogTitle==='string'))throw new Error('Incomplete translations');
    }),
    json('data/models.json').then(value=>{
      if(!window.MiraModels || MiraModels.validate(value).length)throw new Error('Invalid catalog');
      catalog=value;
    }).catch(()=>{catalogFailed=true;}),
    json('data/compatibility.json').then(value=>{
      if(!window.MiraRegistry || MiraRegistry.validate(value).length)throw new Error('Invalid registry');
      registry=value;
    }).catch(()=>{registryFailed=true;}),
    json('release.json').then(value=>{
      if(typeof value.version!=='string' || !/^\d{1,3}(?:\.\d{1,3}){2,3}$/.test(value.version))throw new Error('Invalid release');
      release=value;
    }).catch(()=>{releaseFailed=true;})
  ]).then(results=>{
    if(results[0].status==='rejected') {
      document.documentElement.dataset.catalogState='error';
      root.querySelector('[data-catalog-count]').textContent='';
      errors.hidden=false;
      errors.textContent={ru:'Не удалось загрузить переводы. Попробуйте обновить страницу.',en:'Translations could not be loaded. Please refresh the page.','zh-CN':'无法加载翻译，请刷新页面。'}[state.language]||'Please refresh the page.';
    } else {
      render();
      document.documentElement.dataset.catalogState=catalogFailed?'error':'ready';
    }
    document.documentElement.dataset.ready='true';
  });
})();

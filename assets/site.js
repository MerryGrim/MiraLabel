(() => {
  'use strict';
  const root = document.getElementById('mira-label-landing');
  const state = { ...window.miraPreferences };
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  let copy;
  let icons;
  let release;
  let registry;
  let registryError;
  let failed = false;

  const theme = () => state.theme === 'auto' ? (systemTheme.matches ? 'dark' : 'light') : state.theme;
  const persist = () => { try { localStorage.setItem('miralabel.landing.v1', JSON.stringify(state)); } catch {} };
  const text = key => (copy[state.language][key] || copy.ru[key] || '').replaceAll('{version}', release.version);
  const validURL = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password; }
    catch { return false; }
  };
  function setDownloadLinks() {
    root.querySelectorAll('[data-download]').forEach(link => {
      const format = link.dataset.download === 'selected' ? state.format : link.dataset.download;
      const file = release.downloads[format];
      if (file && validURL(file.url)) {
        link.href = file.url;
        link.removeAttribute('aria-disabled');
        link.setAttribute('download', file.filename);
      } else {
        link.removeAttribute('href');
        link.setAttribute('aria-disabled', 'true');
      }
    });
  }
  function render() {
    if (!copy || !release || !icons) return;
    const currentTheme = theme();
    document.documentElement.lang = state.language;
    document.documentElement.dataset.theme = currentTheme;
    document.title = text('pageTitle');
    document.querySelector('meta[name="description"]').content = text('pageDescription');
    document.querySelector('meta[property="og:title"]').content = text('pageTitle');
    document.querySelector('meta[property="og:description"]').content = text('pageDescription');
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = text(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', text(el.dataset.i18nAria)); });
    const language = root.querySelector('[data-lang]');
    language.value = state.language;
    language.setAttribute('aria-label', text('language'));
    root.querySelector('.ml-links').setAttribute('aria-label', text('navigation'));
    root.querySelector('.ml-file-choices').setAttribute('aria-label', text('chooseFormat'));
    root.querySelector('[data-version-line]').textContent = text('versionLine');
    const toggle = root.querySelector('[data-toggle-theme]');
    toggle.setAttribute('aria-label', text(currentTheme === 'light' ? 'toDark' : 'toLight'));
    toggle.setAttribute('aria-pressed', String(currentTheme === 'dark'));
    toggle.innerHTML = icons[currentTheme === 'light' ? 'moon' : 'sun'];
    const screenshot = root.querySelector('[data-editor-screen]');
    screenshot.src = `assets/editor-${state.language}-${currentTheme}.webp`;
    screenshot.alt = text('screenAlt');
    root.querySelectorAll('[data-format]').forEach(link => {
      const file = release.downloads[link.dataset.format];
      link.setAttribute('aria-pressed', String(link.dataset.format === state.format));
      link.dataset.selected = String(link.dataset.format === state.format);
      const units = state.language === 'ru' ? 'МБ' : 'MB';
      const size = Number.isFinite(file?.bytes) ? Math.round(file.bytes / 1000000) : null;
      link.querySelector('small').textContent = `${link.dataset.format === 'setup' ? '.exe' : '.zip'}${size ? ` · ${size} ${units}` : ''}`;
    });
    root.querySelector('[data-selected-format]').textContent = text(state.format === 'zip' ? 'zipSelected' : 'setupSelected');
    root.querySelector('[data-download-label]').textContent = text(state.format === 'zip' ? 'downloadZip' : 'downloadSetup');
    if (validURL(release.author?.url)) root.querySelector('[data-author-link]').href = release.author.url;
    setDownloadLinks();
    if (window.MiraCommunity && root.querySelector('[data-registry-list]')) MiraCommunity.render({root,registry,release,language:state.language,copy,error:registryError});
    const ownerBadge = root.querySelector('[data-owner-model-badge]');
    if (ownerBadge) ownerBadge.hidden = !!registryError || !registry || MiraRegistry.validate(registry).length > 0 || !registry.profiles.some(profile => profile.modelId === 528 && profile.ownerStatus === 'verified');
    const status = root.querySelector('.ml-status');
    if (status) status.textContent = failed ? text('unavailable') : '';
  }

  root.querySelector('[data-lang]').addEventListener('change', event => {
    state.language = event.target.value;
    render();
    persist();
  });
  root.querySelector('[data-toggle-theme]').addEventListener('click', () => {
    state.theme = theme() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme();
    render();
    persist();
  });
  root.querySelectorAll('[data-format]').forEach(link => {
    link.addEventListener('click', () => {
      state.format = link.dataset.format;
      render();
      persist();
    });
  });
  root.querySelectorAll('[data-download]').forEach(link => {
    link.addEventListener('click', event => { if (link.getAttribute('aria-disabled') === 'true') event.preventDefault(); });
  });
  root.querySelectorAll('[data-scroll]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.getElementById(link.dataset.scroll);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
  });
  systemTheme.addEventListener('change', () => { if (state.theme === 'auto') render(); });
  window.addEventListener('storage', event => {
    if (event.key !== 'miralabel.landing.v1') return;
    try {
      const next = JSON.parse(event.newValue || '{}');
      if (['ru', 'en', 'zh-CN'].includes(next.language)) state.language = next.language;
      if (['auto', 'light', 'dark'].includes(next.theme)) state.theme = next.theme;
      if (['setup', 'zip'].includes(next.format)) state.format = next.format;
      render();
    } catch {}
  });
  const registryPromise = fetch('data/compatibility.json', {cache:'no-cache'}).then(response => {
    if (!response.ok) throw new Error('Registry unavailable');
    return response.json();
  }).then(value => { registry=value; }).catch(() => {registryError=true;});
  Promise.all(['assets/copy.json', 'assets/icons.json', 'release.json', 'assets/community-copy.json'].map(async path => {
    const response = await fetch(path, {cache:'no-cache'});
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.json();
  })).then(async ([translations, iconSet, releaseInfo, communityTranslations]) => {
    copy = Object.fromEntries(Object.keys(translations).map(language => [language,{...translations[language],...communityTranslations[language]}]));
    icons = iconSet;
    release = releaseInfo;
    if (!release.version || !release.downloads?.setup || !release.downloads?.zip) throw new Error('Incomplete release information');
    await registryPromise;
    render();
    document.documentElement.dataset.ready = 'true';
  }).catch(error => {
    failed = true;
    const message = document.createElement('p');
    message.className = 'ml-status';
    message.setAttribute('role', 'status');
    message.textContent = copy?.[state.language]?.unavailable || 'Ссылки на скачивание временно недоступны. Попробуйте обновить страницу.';
    root.querySelector('.ml-download-controls').append(message);
    console.error(error.message);
  });
})();

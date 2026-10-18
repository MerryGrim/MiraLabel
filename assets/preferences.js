/* Apply the stored preference before the stylesheet paints the page. */
(() => {
  const key = 'miralabel.landing.v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
  const language = ['ru', 'en', 'zh-CN'].includes(saved.language)
    ? saved.language
    : (navigator.languages || [navigator.language]).map(value => String(value).toLowerCase())
      .map(value => value.startsWith('zh') ? 'zh-CN' : value.startsWith('en') ? 'en' : value.startsWith('ru') ? 'ru' : null)
      .find(Boolean) || 'ru';
  const preference = ['light', 'dark'].includes(saved.theme) ? saved.theme : 'auto';
  const theme = preference === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = language;
  window.miraPreferences = { language, theme: preference, format: saved.format === 'zip' ? 'zip' : 'setup' };
})();

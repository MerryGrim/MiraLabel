/* APK model names are catalog evidence, never enabled print profiles or proof of printing. */
(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.MiraModels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ISSUE_BASE = 'https://github.com/MerryGrim/MiraLabel/issues/new';
  const VERSION = /^\d{1,3}(?:\.\d{1,3}){2,3}$/;
  const HASH = /^[0-9a-f]{64}$/;
  const LANGUAGES = {
    ru: {template:'report-ru.yml', title:'[Проверка печати]', model:'Модель из каталога APK', codes:'Коды из каталога (не ID подключённого устройства)', missing:'не указаны'},
    en: {template:'report-en.yml', title:'[Print check]', model:'Model from the APK catalog', codes:'Catalog codes (not the connected device ID)', missing:'not listed'},
    'zh-CN': {template:'report-zh.yml', title:'[打印验证]', model:'APK 目录中的型号', codes:'目录代码（不是已连接设备的 ID）', missing:'未列出'}
  };
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const keysAre = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value,key));
  const safeText = value => typeof value === 'string' && value.length > 0 && value.length <= 80 && !/[\u0000-\u001f\u007f-\u009f<>\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(value) && value.trim() === value;
  function validModel(model) {
    return keysAre(model,['id','name','modelCodes','testOnly']) && /^niimbot-[0-9a-f]{12}$/.test(model.id) && safeText(model.name) && Array.isArray(model.modelCodes) && model.modelCodes.length <= 32 && model.modelCodes.every(code=>Number.isInteger(code)&&code>=0&&code<=65535) && new Set(model.modelCodes).size===model.modelCodes.length && typeof model.testOnly === 'boolean';
  }
  function validate(catalog) {
    const errors=[];
    if (!keysAre(catalog,['schemaVersion','source','models'])) return ['Catalog must contain only schemaVersion, source and models.'];
    if (catalog.schemaVersion!==1) errors.push('Unsupported model catalog schema.');
    if (!keysAre(catalog.source,['name','xapkSha256','catalogSha256','notPrintProfiles']) || !safeText(catalog.source.name) || !HASH.test(catalog.source.xapkSha256) || !HASH.test(catalog.source.catalogSha256) || catalog.source.notPrintProfiles!==true) errors.push('Catalog source must declare hashes and that models are not print profiles.');
    if (!Array.isArray(catalog.models)||catalog.models.length<1||catalog.models.length>1000) return [...errors,'Model catalog must contain 1 to 1000 models.'];
    const ids=new Set(), names=new Set();
    catalog.models.forEach((model,index)=>{
      if (!validModel(model)) {errors.push(`Invalid model at index ${index}.`);return;}
      if (ids.has(model.id)) errors.push(`Duplicate catalog ID at index ${index}.`);
      if (names.has(model.name.toLocaleLowerCase('en-US'))) errors.push(`Duplicate model name at index ${index}.`);
      ids.add(model.id);names.add(model.name.toLocaleLowerCase('en-US'));
    });
    return errors;
  }
  const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\s_\-]+/gu,'');
  function filter(catalog,query) {
    if (validate(catalog).length) return [];
    const raw=typeof query==='string'?query.slice(0,160).trim():'';
    const normalized=normalize(raw).replace(/^niimbot/,'');
    if (!normalized) return catalog.models.slice();
    return catalog.models.filter(model=>normalize(model.name).includes(normalized)||model.modelCodes.some(code=>String(code).includes(normalized)));
  }
  function reportURL(language,version,model) {
    if (!validModel(model)) throw new TypeError('Expected a valid static APK catalog model.');
    const copy=LANGUAGES[language]||LANGUAGES.en;
    const url=new URL(ISSUE_BASE);
    url.searchParams.set('template',copy.template);
    url.searchParams.set('title',`${copy.title} NIIMBOT ${model.name}`);
    url.searchParams.set('model',`NIIMBOT ${model.name}`);
    if (typeof version==='string'&&VERSION.test(version)) url.searchParams.set('app-version',version);
    url.searchParams.set('manual-details',`${copy.model}: NIIMBOT ${model.name}\n${copy.codes}: ${model.modelCodes.length?model.modelCodes.join(', '):copy.missing}`);
    return url.toString();
  }
  return Object.freeze({validate,filter,reportURL});
});

#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Registry = require('../assets/registry.js');
const Models = require('../assets/models.js');
const root = path.resolve(__dirname, '..');
const errors = [];
function read(relative) {
  try {return JSON.parse(fs.readFileSync(path.join(root,relative),'utf8').replace(/^\uFEFF/,''));}
  catch {errors.push(`${relative}: cannot parse JSON data`);return null;}
}
const registry = read('data/compatibility.json');
if (registry) errors.push(...Registry.validate(registry));
const models = read('data/models.json');
if (models) errors.push(...Models.validate(models));
const templates = ['report-ru.yml','report-en.yml','report-zh.yml'];
for (const filename of templates) {
  // These forms intentionally use JSON syntax, which is valid YAML on GitHub.
  const form = read('.github/ISSUE_TEMPLATE/'+filename);
  if (!form) continue;
  const fail = message => errors.push(`${filename}: ${message}`);
  if (typeof form.name !== 'string' || typeof form.description !== 'string' || !Array.isArray(form.body)) {fail('missing name, description, or body');continue;}
  if (JSON.stringify(form.labels)!==JSON.stringify(['compatibility-report','needs-review'])) fail('only needs-review labels are allowed');
  const fields = form.body.filter(field=>field.id);
  const ids = fields.map(field=>field.id);
  if (new Set(ids).size!==ids.length) fail('duplicate field IDs');
  const byId = Object.fromEntries(fields.map(field=>[field.id,field]));
  const requiredIds = ['report','model','app-version','manual-details','protocol-attempt','observation-feed','observation-text','observation-qr','test-spec','qr-payload','photo','public-consent'];
  if (JSON.stringify([...ids].sort())!==JSON.stringify([...requiredIds].sort())) fail('the app/form field contract differs');
  if (byId.report?.type!=='textarea'||byId.report?.validations?.required!==true) fail('canonical report textarea must be required');
  if (byId['public-consent']?.type!=='checkboxes'||byId['public-consent']?.attributes?.options?.length!==1||byId['public-consent']?.attributes?.options?.[0]?.required!==true) fail('explicit public consent is required');
  if (byId['public-consent']?.attributes?.options?.some(option=>option.value===true||option.checked===true)) fail('public consent must never be preselected');
  if (byId.model?.type!=='input'||byId.model?.validations?.required===true) fail('model prefill must be an optional text input');
  if (byId['test-spec']?.attributes?.value||byId['qr-payload']?.attributes?.value) fail('generic model forms must not preselect the D11H test specification or QR payload');
  for (const id of ['observation-feed','observation-text','observation-qr']) {
    const field=byId[id];
    if (field?.type!=='dropdown'||field.attributes?.default!==0||field.attributes?.options?.length!==3||!field.attributes.options[0].startsWith('not_checked')) fail(`${id} must start with not_checked`);
  }
  for (const field of fields) if (!['report','public-consent'].includes(field.id)&&field.validations?.required===true) fail(`generated metadata must not need retyping: ${field.id}`);
}
const copies = [read('assets/copy.json'),read('assets/community-copy.json'),read('assets/catalog-copy.json')];
for (const [index,copy] of copies.entries()) {
  if (!copy) continue;
  const expected=Object.keys(copy.ru||{}).sort();
  if (JSON.stringify(Object.keys(copy).sort())!==JSON.stringify(['en','ru','zh-CN'])) errors.push(`copy ${index}: exactly RU/EN/zh-CN are expected`);
  for (const language of ['ru','en','zh-CN']) if (JSON.stringify(Object.keys(copy[language]||{}).sort())!==JSON.stringify(expected)||Object.values(copy[language]||{}).some(value=>typeof value!=='string'||!value.trim())) errors.push(`copy ${index}: incomplete ${language}`);
}
const page=fs.readFileSync(path.join(root,'index.html'),'utf8');
for (const asset of ['assets/registry.js','assets/community.js','assets/compatibility.css']) if (!page.includes(asset)) errors.push(`missing runtime asset ${asset}`);
if (!page.includes('id="compatibility"')||!page.includes('href="compatibility.html"')) errors.push('compact compatibility link is missing');
const catalogPage=fs.readFileSync(path.join(root,'compatibility.html'),'utf8');
for (const asset of ['assets/models.js','assets/catalog-page.js','assets/catalog-page.css','assets/community.js']) if (!catalogPage.includes(asset)) errors.push(`catalog page missing asset ${asset}`);
if (!catalogPage.includes('data-registry-list')||!catalogPage.includes('data-registry-summary')) errors.push('version-specific reports are missing from the compatibility page');
if (errors.length) {console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`Compatibility data, ${models.models.length} catalog models and three Issue Forms valid; ${registry.reports.length} reviewed reports. No unreviewed Issues are imported.`);

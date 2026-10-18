'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Models = require('../assets/models.js');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/models.json'),'utf8'));
const clone = () => structuredClone(catalog);

test('all 89 APK model names remain distinct catalog entries with no compatibility claims',()=>{
  assert.deepEqual(Models.validate(catalog),[]);
  assert.equal(catalog.models.length,89);
  assert.equal(new Set(catalog.models.map(model=>model.id)).size,89);
  assert.equal(catalog.source.notPrintProfiles,true);
  for (const model of catalog.models) {
    assert.deepEqual(Object.keys(model).sort(),['id','modelCodes','name','testOnly']);
    assert.ok(!('verified' in model));
  }
  assert.deepEqual(catalog.models.find(model=>model.name==='D11_H').modelCodes,[528]);
  assert.deepEqual(catalog.models.find(model=>model.name==='ET10').modelCodes,[5376,65535]);
});

test('name search accepts NIIMBOT prefix, case, separators and D11H alias without losing variants',()=>{
  for (const query of ['d11h','D11_H','D11-H','NIIMBOT D11 H']) assert.deepEqual(Models.filter(catalog,query).map(model=>model.name),['D11_H']);
  assert.deepEqual(Models.filter(catalog,'b21pro').map(model=>model.name),['B21_Pro']);
  assert.ok(Models.filter(catalog,'D11').length>5);
  assert.deepEqual(Models.filter(catalog,'not-a-real-model'),[]);
  assert.equal(Models.filter(catalog,' NIIMBOT ').length,89);
  assert.equal(Models.filter(catalog,'').length,89);
});

test('numeric catalog codes return all ambiguous matches and never resolve a device identity',()=>{
  assert.deepEqual(Models.filter(catalog,'6912').map(model=>model.name),['B2','B2 Pro']);
  assert.deepEqual(Models.filter(catalog,'65535').map(model=>model.name),['ET10']);
  assert.deepEqual(Models.filter(catalog,'256').map(model=>model.name),['A8','B3S','Betty','D101','JCB3S']);
  assert.deepEqual(Models.filter(catalog,'65536'),[]);
  assert.deepEqual(catalog.models.find(model=>model.name==='B20').modelCodes,[]);
});

test('all three report forms prefill each exact model without printing assumptions or public consent',()=>{
  for (const [language,template] of [['ru','report-ru.yml'],['en','report-en.yml'],['zh-CN','report-zh.yml']]) {
    for (const model of catalog.models) {
      const url=new URL(Models.reportURL(language,'0.2.7',model));
      assert.equal(url.origin,'https://github.com');
      assert.equal(url.pathname,'/MerryGrim/MiraLabel/issues/new');
      assert.equal(url.searchParams.get('template'),template);
      assert.equal(url.searchParams.get('model'),`NIIMBOT ${model.name}`);
      assert.equal(url.searchParams.get('app-version'),'0.2.7');
      assert.ok(url.searchParams.get('title').endsWith(`NIIMBOT ${model.name}`));
      assert.ok(url.searchParams.get('manual-details').includes(model.name));
      assert.deepEqual([...url.searchParams.keys()].sort(),['app-version','manual-details','model','template','title']);
      assert.ok(!url.toString().includes('MIRA-D11H-TEST'));
      assert.ok(!url.toString().includes('miralabel-print-check'));
      assert.ok(url.toString().length<2000);
    }
  }
});

test('report metadata labels ambiguous numbers as catalog codes, with safe language/version fallback',()=>{
  const model=catalog.models.find(model=>model.name==='B2 Pro');
  const url=new URL(Models.reportURL('unsupported','invalid-version',model));
  assert.equal(url.searchParams.get('template'),'report-en.yml');
  assert.equal(url.searchParams.get('app-version'),null);
  assert.match(url.searchParams.get('manual-details'),/Catalog codes \(not the connected device ID\): 6912/);
});

test('invalid catalogs fail closed; extra compatibility claims and unsafe input are rejected',()=>{
  for (const mutate of [
    data=>{data.models[0].verified=true;},
    data=>{data.models[0].modelCodes=[NaN];},
    data=>{data.models[0].modelCodes=[65536];},
    data=>{data.models[0].modelCodes=[1,1];},
    data=>{data.models[0].name='<script>';},
    data=>{data.models[0].name='A1\n';},
    data=>{data.models[0].name='A\u202e1';},
    data=>{data.models[1].id=data.models[0].id;},
    data=>{data.models[1].name=data.models[0].name;},
    data=>{data.source.notPrintProfiles=false;},
    data=>{data.source.catalogSha256='missing';}
  ]) {
    const data=clone();mutate(data);
    assert.ok(Models.validate(data).length>0);
    assert.deepEqual(Models.filter(data,''),[]);
  }
  for (const invalid of [null,{},[],{...catalog,models:[]},{...catalog,source:null}]) {
    assert.ok(Models.validate(invalid).length>0);
    assert.deepEqual(Models.filter(invalid,'D11'),[]);
  }
  assert.throws(()=>Models.reportURL('ru','0.2.7',{...catalog.models[0],name:'A1\n'}),TypeError);
});

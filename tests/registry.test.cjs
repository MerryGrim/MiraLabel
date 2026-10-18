/* Synthetic in-memory records: not community evidence and never included in the ledger. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../assets/registry.js');
const pristine=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/compatibility.json'),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
function record(number,author='ExampleTester',observations={exactlyOneWholeLabel:'yes',textNotCut:'yes',qrScans:'yes'}) {
  const report={schemaVersion:1,testSpec:R.TEST_SPEC,reportId:`00000000-0000-4000-8000-${String(number).padStart(12,'0')}`,createdUtc:'2026-10-18T10:00:00Z',appVersion:'0.2.7',printer:{modelId:528,modelName:'D11_H',firmware:'4.28',protocolVersion:5},transport:'BLE',windowsVersion:'10.0.26200',media:{widthMm:12,lengthMm:40,type:'gap',density:2},attemptStatus:'completed',protocolConfirmedPages:1,errorCode:null,observations,expectedQr:R.EXPECTED_QR};
  report.userResult=R.deriveResult(report);
  return {issueUrl:`https://github.com/MerryGrim/MiraLabel/issues/${number}`,author,evidenceLevel:'user_report',reviewedBy:'MerryGrim',reviewedAt:'2026-10-18',evidenceUrls:[],report};
}
test('empty ledger is honestly unconfirmed and the local baseline never counts',()=>{
  const registry=clone(pristine);registry.reports=[];
  assert.deepEqual(R.validate(registry),[]);
  const result=R.aggregate(registry,'0.2.7');
  assert.equal(result.reports,0);assert.equal(result.authors,0);assert.equal(result.rows.length,1);assert.equal(result.rows[0].status,'unconfirmed');
});
test('owner-verified model never fabricates version reports or hides failures and mixed results',()=>{
  const registry=clone(pristine);registry.reports=[];
  assert.equal(registry.profiles[0].ownerStatus,'verified');
  const empty=R.aggregate(registry,'0.2.7');
  assert.equal(empty.reports,0);assert.equal(empty.authors,0);
  assert.equal(empty.rows[0].status,'unconfirmed');assert.equal(empty.rows[0].evidenceLevel,'none');
  assert.ok(Object.values(empty.rows[0].counts).every(count=>count===0));

  registry.reports=[record(1,'Alice',{exactlyOneWholeLabel:'yes',textNotCut:'no',qrScans:'not_checked'})];
  const failure=R.aggregate(registry,'0.2.7').rows.find(row=>row.reportCount);
  assert.equal(failure.status,'failed');assert.equal(failure.counts.reported_failure,1);
  registry.reports.push(record(2,'Bob'));
  const mixed=R.aggregate(registry,'0.2.7').rows.find(row=>row.reportCount);
  assert.equal(mixed.status,'mixed');assert.equal(mixed.counts.reported_failure,1);assert.equal(mixed.counts.reported_success,1);
  assert.equal(registry.profiles[0].ownerStatus,'verified');

  const future=R.aggregate(registry,'0.2.8');
  const current=future.rows.find(row=>row.current);
  assert.equal(current.status,'unconfirmed');assert.equal(current.reportCount,0);
  assert.equal(future.rows.find(row=>!row.current&&row.reportCount).status,'mixed');
});
test('the frozen app schema and all tri-state human outcomes are accepted',()=>{
  const full=record(1).report;
  assert.deepEqual(R.validateReport(full),[]);
  full.attemptStatus='error';full.errorCode='request_failed';full.protocolConfirmedPages=null;
  assert.equal(R.deriveResult(full),'reported_success');
  assert.deepEqual(R.validateReport(full),[]);
  full.observations.qrScans='not_checked';full.userResult=R.deriveResult(full);assert.equal(full.userResult,'reported_partial');
  full.observations.qrScans='no';full.userResult=R.deriveResult(full);assert.equal(full.userResult,'reported_failure');
  full.observations={exactlyOneWholeLabel:'not_checked',textNotCut:'not_checked',qrScans:'not_checked'};full.userResult=R.deriveResult(full);assert.equal(full.userResult,'not_checked');
});
test('a protocol ACK without human observations never becomes successful evidence',()=>{
  const entry=record(1,'ExampleTester',{exactlyOneWholeLabel:'not_checked',textNotCut:'not_checked',qrScans:'not_checked'});
  const registry=clone(pristine);registry.reports=[entry];
  const row=R.aggregate(registry,'0.2.7').rows.find(row=>row.reportCount);
  assert.equal(row.status,'unconfirmed');assert.equal(row.counts.reported_success,0);
});
test('attempt status never splits matching scopes, and contradictory outcomes stay visible',()=>{
  const success=record(1,'Alice');const failure=record(2,'Bob',{exactlyOneWholeLabel:'yes',textNotCut:'no',qrScans:'not_checked'});
  failure.report.attemptStatus='error';failure.report.errorCode='request_failed';failure.report.protocolConfirmedPages=null;
  assert.equal(R.scopeKey(success.report),R.scopeKey(failure.report));
  const registry=clone(pristine);registry.reports=[success,failure];
  const row=R.aggregate(registry,'0.2.7').rows.find(row=>row.reportCount);
  assert.equal(row.status,'mixed');assert.equal(row.counts.reported_failure,1);assert.equal(row.counts.reported_success,1);assert.equal(row.authors,2);
});
test('report duplication cannot manufacture independent contributors',()=>{
  const registry=clone(pristine);registry.reports=[record(1,'Alice'),record(2,'alice')];
  const result=R.aggregate(registry,'0.2.7');const row=result.rows.find(row=>row.reportCount);
  assert.equal(result.reports,2);assert.equal(result.authors,1);assert.equal(row.counts.reported_success,1);assert.equal(row.status,'reported');
});
test('firmware, app version, protocol and paper density keep separate scopes',()=>{
  const original=record(1).report;
  for(const change of [value=>value.printer.firmware='4.29',value=>value.appVersion='0.2.8',value=>value.printer.protocolVersion=6,value=>value.media.density=3]) {
    const changed=clone(original);change(changed);assert.notEqual(R.scopeKey(original),R.scopeKey(changed));
  }
  const registry=clone(pristine);registry.reports=[record(1)];
  assert.equal(R.aggregate(registry,'0.2.8').rows.find(row=>row.current).status,'unconfirmed');
});
test('forged outcomes, private identifiers, unsafe evidence and untrusted reviewers fail',()=>{
  for(const change of [
    value=>value.report.userResult='not_checked',
    value=>value.report.printer.serialNumber='private',
    value=>value.report.printer.modelName='D11_H-A1B2C3',
    value=>value.report.transport='USB',
    value=>value.report.media.widthMm=14,
    value=>value.report.testSpec='some-other-test',
    value=>value.report.expectedQr='personal data',
    value=>value.issueUrl='javascript:alert(1)',
    value=>value.issueUrl='https://github.com/other/repo/issues/1',
    value=>value.evidenceUrls=['https://example.com/photo.png'],
    value=>value.reviewedBy='UnreviewedUser',
    value=>value.report.attemptStatus='not_run',
  ]) {
    const entry=record(1);change(entry);const registry=clone(pristine);registry.reports=[entry];assert.ok(R.validate(registry).length>0);
  }
});
test('duplicate report IDs and source issues are rejected instead of inflated',()=>{
  const registry=clone(pristine);registry.reports=[record(1),record(1)];assert.ok(R.validate(registry).some(message=>message.includes('duplicate')));
});
test('registry rejects unknown auto-confirm fields and broken dates without crashing',()=>{
  const registry=clone(pristine);registry.reports=[];registry.confirmed=true;assert.ok(R.validate(registry).length);
  delete registry.confirmed;registry.updatedAt='2026-99-99';assert.doesNotThrow(()=>R.validate(registry));assert.ok(R.validate(registry).length);
});
test('reviewing a user report never implies that the maintainer reproduced it',()=>{
  const registry=clone(pristine);registry.reports=[record(1)];
  assert.equal(R.aggregate(registry,'0.2.7').rows.find(row=>row.reportCount).evidenceLevel,'user_report');
  registry.reports[0].evidenceLevel='maintainer_reproduced';assert.ok(R.validate(registry).length);
  registry.reports[0].author='MerryGrim';assert.ok(R.validate(registry).length);
  registry.reports[0].evidenceUrls=[registry.reports[0].issueUrl];assert.deepEqual(R.validate(registry),[]);
  const row=R.aggregate(registry,'0.2.7').rows.find(row=>row.reportCount);
  assert.equal(row.evidenceLevel,'maintainer_reproduced');assert.equal(row.reproducedCount,1);
  assert.equal(R.aggregate(registry,'0.2.8').rows.find(row=>row.current).evidenceLevel,'none');
  registry.reports[0].report.observations={exactlyOneWholeLabel:'not_checked',textNotCut:'not_checked',qrScans:'not_checked'};
  registry.reports[0].report.userResult='not_checked';assert.ok(R.validate(registry).length);
});
module.exports={record};

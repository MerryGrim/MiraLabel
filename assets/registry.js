/* Shared, dependency-free validation and aggregation. Registry JSON is data, never code. */
(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.MiraRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TEST_SPEC = 'miralabel-print-check-v1';
  const EXPECTED_QR = 'MIRA-D11H-TEST';
  const OBSERVATIONS = ['exactlyOneWholeLabel', 'textNotCut', 'qrScans'];
  const RESULTS = ['reported_success', 'reported_partial', 'reported_failure', 'not_checked'];
  const VERSION = /^\d{1,3}(?:\.\d{1,3}){2,3}$/;
  const LOGIN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const ISSUE_URL = /^https:\/\/github\.com\/MerryGrim\/MiraLabel\/issues\/[1-9]\d*$/;
  const PHOTO_URL = /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{36}$/i;
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const equalKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const nullableInt = (value, min = 0, max = 65535) => value === null || Number.isInteger(value) && value >= min && value <= max;
  const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0, 10) === value;
  const utcDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(value) && dateOnly(value.slice(0,10)) && Number.isFinite(Date.parse(value));
  function deriveResult(report) {
    if (report.attemptStatus === 'not_run') return 'not_checked';
    const observations = OBSERVATIONS.map(key => report.observations[key]);
    if (observations.every(value => value === 'yes')) return 'reported_success';
    if (observations.some(value => value === 'no')) return 'reported_failure';
    if (observations.some(value => value === 'yes')) return 'reported_partial';
    return 'not_checked';
  }
  function validateMedia(media) {
    return equalKeys(media, ['widthMm', 'lengthMm', 'type', 'density']) &&
      media.widthMm === 12 && media.lengthMm === 40 && media.type === 'gap' && Number.isInteger(media.density) && media.density >= 1 && media.density <= 3;
  }
  function validateReport(report, prefix = 'report') {
    const errors = [];
    const check = (condition, message) => { if (!condition) errors.push(`${prefix}: ${message}`); };
    check(equalKeys(report, ['schemaVersion', 'testSpec', 'reportId', 'createdUtc', 'appVersion', 'printer', 'transport', 'windowsVersion', 'media', 'attemptStatus', 'protocolConfirmedPages', 'errorCode', 'observations', 'expectedQr', 'userResult']), 'unexpected or missing fields');
    if (!isObject(report)) return errors;
    check(report.schemaVersion === 1, 'schemaVersion must be 1');
    check(report.testSpec === TEST_SPEC, 'unknown test specification');
    check(report.expectedQr === EXPECTED_QR, 'unexpected fixed QR payload');
    check(typeof report.reportId === 'string' && UUID.test(report.reportId), 'invalid reportId UUID');
    check(utcDate(report.createdUtc), 'createdUtc must be a UTC timestamp');
    check(typeof report.appVersion === 'string' && VERSION.test(report.appVersion), 'appVersion must be exact, not a version range');
    check(report.transport === 'BLE', 'only the implemented BLE test is accepted; other transports need a separate specification');
    check(report.windowsVersion === null || typeof report.windowsVersion === 'string' && /^\d{1,5}(?:\.\d{1,8}){0,3}$/.test(report.windowsVersion), 'windowsVersion must be numeric or null');
    check(validateMedia(report.media), 'invalid media dimensions/type/density');
    check(['not_run', 'completed', 'error', 'cancelled'].includes(report.attemptStatus), 'invalid attemptStatus');
    check(nullableInt(report.protocolConfirmedPages, 0, 20), 'invalid protocolConfirmedPages');
    if (report.attemptStatus === 'not_run') check(report.protocolConfirmedPages === null, 'a test that was not run cannot have a protocol page count');
    if (report.attemptStatus === 'completed') check(report.printer !== null, 'completed test requires its captured printer snapshot');
    check([null, 'connection_failed', 'request_failed', 'cancelled'].includes(report.errorCode), 'invalid errorCode');
    check(equalKeys(report.observations, OBSERVATIONS) && OBSERVATIONS.every(key => ['yes', 'no', 'not_checked'].includes(report.observations[key])), 'observations must contain the three explicit human checks');
    if (report.attemptStatus === 'not_run' && isObject(report.observations)) check(OBSERVATIONS.every(key => report.observations[key] === 'not_checked'), 'a test that was not run cannot have physical observations');
    if (equalKeys(report.observations, OBSERVATIONS)) check(RESULTS.includes(report.userResult) && report.userResult === deriveResult(report), 'userResult disagrees with human observations');
    if (report.printer !== null) {
      check(equalKeys(report.printer, ['modelId', 'modelName', 'firmware', 'protocolVersion']), 'printer contains unexpected or missing fields');
      if (isObject(report.printer)) {
        check(nullableInt(report.printer.modelId, 1), 'invalid numeric model ID');
        check(report.printer.modelName === null || typeof report.printer.modelName === 'string' && /^[a-zA-Z0-9 ._()+-]{1,64}$/.test(report.printer.modelName), 'modelName must be a catalogue name, not a Bluetooth name');
        if (report.printer.modelId === 528) check(report.printer.modelName === 'D11_H', 'D11H name must match the fixed app catalogue');
        check(report.printer.firmware === null || typeof report.printer.firmware === 'string' && /^\d{1,3}(?:\.\d{1,5}){1,3}$/.test(report.printer.firmware), 'firmware must be numeric or null');
        check(nullableInt(report.printer.protocolVersion, 1, 255), 'invalid protocolVersion');
      }
    }
    return errors;
  }
  function validate(registry) {
    const errors = [];
    const check = (condition, message) => { if (!condition) errors.push(message); };
    check(equalKeys(registry, ['schemaVersion', 'testSpec', 'expectedQr', 'updatedAt', 'maintainers', 'profiles', 'reports']), 'registry: unexpected or missing fields');
    if (!isObject(registry)) return errors;
    check(registry.schemaVersion === 1 && registry.testSpec === TEST_SPEC && registry.expectedQr === EXPECTED_QR, 'registry: unknown schema or test specification');
    check(dateOnly(registry.updatedAt), 'registry: invalid updatedAt');
    check(same(registry.maintainers, ['MerryGrim']), 'registry: the approved maintainer is MerryGrim; extending the allowlist requires an explicit validator change');
    check(Array.isArray(registry.profiles) && registry.profiles.length === 1, 'registry: exactly one implemented D11H BLE profile is expected');
    if (Array.isArray(registry.profiles)) registry.profiles.forEach((profile, index) => {
      check(equalKeys(profile, ['id', 'model', 'modelId', 'ownerStatus', 'protocolVersion', 'transport', 'media', 'historicalBaseline']), `profile ${index}: unexpected fields`);
      if (!isObject(profile)) return;
      check(profile.id === 'd11h-ble' && profile.model === 'NIIMBOT D11H' && profile.modelId === 528 && profile.protocolVersion === 5 && profile.transport === 'BLE', `profile ${index}: unsupported profile must not be presented as implemented`);
      check(profile.ownerStatus === 'verified', `profile ${index}: D11H owner confirmation must remain explicit and separate from public reports`);
      check(validateMedia(profile.media), `profile ${index}: invalid media`);
      const baseline = profile.historicalBaseline;
      check(equalKeys(baseline, ['kind', 'appVersion', 'firmware', 'testedAt', 'publicEvidenceUrl']) && baseline.kind === 'author-local' && baseline.appVersion === '0.1.1' && baseline.firmware === '4.28' && baseline.testedAt === null && baseline.publicEvidenceUrl === null, `profile ${index}: historical local baseline is not a public report`);
    });
    check(Array.isArray(registry.reports), 'registry: reports must be an array');
    const ids = new Set(), issueURLs = new Set();
    if (Array.isArray(registry.reports)) registry.reports.forEach((record, index) => {
      const prefix = `reports[${index}]`;
      check(equalKeys(record, ['issueUrl', 'author', 'evidenceLevel', 'reviewedBy', 'reviewedAt', 'evidenceUrls', 'report']), `${prefix}: unexpected or missing review fields`);
      if (!isObject(record)) return;
      check(typeof record.issueUrl === 'string' && ISSUE_URL.test(record.issueUrl), `${prefix}: proof must be a public issue in MerryGrim/MiraLabel`);
      check(!issueURLs.has(record.issueUrl), `${prefix}: duplicate issue`); issueURLs.add(record.issueUrl);
      check(typeof record.author === 'string' && LOGIN.test(record.author), `${prefix}: author must be a public GitHub login`);
      check(['user_report','maintainer_reproduced'].includes(record.evidenceLevel), `${prefix}: an explicit evidence level is required`);
      check(Array.isArray(registry.maintainers) && registry.maintainers.includes(record.reviewedBy), `${prefix}: reviewer is not an approved maintainer`);
      check(dateOnly(record.reviewedAt), `${prefix}: invalid reviewedAt`);
      check(Array.isArray(record.evidenceUrls) && new Set(record.evidenceUrls).size === record.evidenceUrls.length && record.evidenceUrls.every(url => typeof url === 'string' && (url === record.issueUrl || PHOTO_URL.test(url))), `${prefix}: evidence URLs must be the source issue or GitHub photo attachments`);
      if (record.evidenceLevel === 'maintainer_reproduced') check(record.author?.toLowerCase() === 'merrygrim' && record.reviewedBy === 'MerryGrim' && Array.isArray(record.evidenceUrls) && record.evidenceUrls.length > 0 && ['completed','error','cancelled'].includes(record.report?.attemptStatus) && OBSERVATIONS.some(key=>['yes','no'].includes(record.report?.observations?.[key])), `${prefix}: maintainer reproduction requires the owner's own physical test and explicit public evidence`);
      errors.push(...validateReport(record.report, prefix));
      if (isObject(record.report)) {
        check(!ids.has(record.report.reportId), `${prefix}: duplicate reportId`); ids.add(record.report.reportId);
        if (utcDate(record.report.createdUtc) && dateOnly(record.reviewedAt)) check(record.reviewedAt >= record.report.createdUtc.slice(0, 10), `${prefix}: review predates the test`);
      }
    });
    return errors;
  }
  function scopeKey(report) {
    const printer = report.printer || {};
    // Attempt/ACK status deliberately does not split human successes from failures.
    return JSON.stringify([printer.modelId ?? null, printer.firmware ?? null, report.appVersion, report.transport, report.media.widthMm, report.media.lengthMm, report.media.type, report.media.density, report.testSpec, printer.protocolVersion ?? null]);
  }
  function aggregate(registry, currentAppVersion) {
    const errors = validate(registry);
    if (errors.length) throw new Error(errors.join('\n'));
    if (!VERSION.test(currentAppVersion)) throw new Error('An exact current app version is required');
    const groups = new Map();
    registry.profiles.forEach(profile => {
      const report = {appVersion:currentAppVersion, printer:{modelId:profile.modelId,modelName:profile.model,firmware:null,protocolVersion:profile.protocolVersion}, transport:profile.transport, media:profile.media, testSpec:registry.testSpec};
      groups.set(scopeKey(report), {key:scopeKey(report),scope:report,current:true,records:[]});
    });
    registry.reports.forEach(record => {
      const key = scopeKey(record.report);
      if (!groups.has(key)) groups.set(key, {key,scope:record.report,current:record.report.appVersion === currentAppVersion,records:[]});
      groups.get(key).records.push(record);
    });
    const uniqueAuthors = records => new Set(records.map(record => record.author.toLowerCase())).size;
    const rows = [...groups.values()].map(group => {
      const counts = Object.fromEntries(RESULTS.map(result => [result, uniqueAuthors(group.records.filter(record => record.report.userResult === result))]));
      const observed = RESULTS.filter(result => result !== 'not_checked' && counts[result] > 0);
      const status = observed.length > 1 ? 'mixed' : observed[0] === 'reported_success' ? 'reported' : observed[0] === 'reported_partial' ? 'partial' : observed[0] === 'reported_failure' ? 'failed' : 'unconfirmed';
      const latest = group.records.map(record => record.report.createdUtc.slice(0,10)).sort().at(-1) || null;
      const reproduced = group.records.filter(record=>record.evidenceLevel === 'maintainer_reproduced');
      return {...group, status, counts, authors:uniqueAuthors(group.records), reportCount:group.records.length, latest, evidenceLevel:reproduced.length?'maintainer_reproduced':group.records.length?'user_report':'none', reproducedCount:reproduced.length};
    });
    return {rows, reports:registry.reports.length, authors:uniqueAuthors(registry.reports), updatedAt:registry.updatedAt};
  }
  return {TEST_SPEC,EXPECTED_QR,OBSERVATIONS,RESULTS,deriveResult,validateReport,validate,scopeKey,aggregate};
});

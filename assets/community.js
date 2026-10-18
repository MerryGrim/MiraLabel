(function () {
  'use strict';
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const link = (url, text) => {
    const node = element('a', 'ml-text-link', text);
    node.href = url;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    return node;
  };
  function reportURL(language, version) {
    const url = new URL('https://github.com/MerryGrim/MiraLabel/issues/new');
    url.searchParams.set('template', `report-${language === 'zh-CN' ? 'zh' : language}.yml`);
    url.searchParams.set('app-version', version);
    return url.href;
  }
  function render(options) {
    const {root,registry,release,language,copy,error} = options;
    const t = key => copy[language][key] || copy.ru[key] || key;
    root.querySelectorAll('[data-report-link]').forEach(node => {node.href=reportURL(language,release.version);});
    const list = root.querySelector('[data-registry-list]');
    const summary = root.querySelector('[data-registry-summary]');
    list.replaceChildren(); summary.replaceChildren();
    const date = value => value ? new Intl.DateTimeFormat(language, {dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')) : t('unknown');
    let result;
    try {
      if (error || !registry) throw new Error('Registry unavailable');
      result = MiraRegistry.aggregate(registry,release.version);
    } catch {
      list.append(element('p','ml-registry-error',t('registryUnavailable')));
      return;
    }
    for (const [key,value] of [['registryReports',result.reports],['registryAuthors',result.authors],['registryUpdated',date(result.updatedAt)]]) {
      const item = element('span'); item.append(element('strong','',value), document.createTextNode(' · '+t(key))); summary.append(item);
    }
    const statusKeys = {unconfirmed:'statusUnconfirmed',reported:'statusReported',partial:'statusPartial',failed:'statusFailed',mixed:'statusMixed'};
    const resultKeys = {reported_success:'countSuccess',reported_partial:'countPartial',reported_failure:'countFailure',not_checked:'countUnchecked'};
    const attemptKeys = {not_run:'attemptNotRun',completed:'attemptCompleted',error:'attemptError',cancelled:'attemptCancelled'};
    const answerKeys = {yes:'answerYes',no:'answerNo',not_checked:'answerUnchecked'};
    const mediaKeys = {gap:'mediaGap',continuous:'mediaContinuous',black_mark:'mediaBlackMark',unknown:'mediaUnknown'};
    for (const row of result.rows) {
      const card = element('article','ml-scope-card');
      card.dataset.scopeStatus = row.status;
      const heading = element('div','ml-scope-heading');
      const title = element('div');
      const printer = row.scope.printer || {};
      const ownerVerified = registry.profiles.some(profile => profile.modelId === printer.modelId && profile.ownerStatus === 'verified');
      title.append(element('h3','',printer.modelId === 528 ? 'NIIMBOT D11H' : printer.modelId ? `NIIMBOT · ID ${printer.modelId}` : t('unknownModel')));
      title.append(element('p','ml-scope-subtitle',t(row.current && row.records.length === 0 ? 'currentScope' : 'reportedScope')));
      const badges = element('div','ml-scope-badges');
      if (ownerVerified) {
        const verified = element('span','ml-badge','✓ '+t('ownerVerified'));
        verified.dataset.status='owner-verified';
        verified.title=t('ownerVerifiedDetails');
        badges.append(verified);
      }
      const statusKey = row.status === 'unconfirmed' && ownerVerified ? (row.reportCount === 0 ? 'scopeNoReports' : 'reportNotChecked') : statusKeys[row.status];
      const badge = element('span','ml-badge',t(statusKey)); badge.dataset.status=row.status;
      badges.append(badge);
      heading.append(title,badges);card.append(heading);
      const details = element('dl','ml-scope-details');
      const media = row.scope.media;
      const levelKey = row.evidenceLevel === 'maintainer_reproduced' ? 'evidenceReproduced' : row.evidenceLevel === 'user_report' ? 'evidenceUserReport' : 'evidenceNone';
      const values = [['scopeVersion',row.scope.appVersion],['scopeFirmware',printer.firmware ?? t('unknown')],['scopeTransport',row.scope.transport],['scopeMedia',`${media.widthMm} × ${media.lengthMm} mm · ${t(mediaKeys[media.type])} · ${t('density')} ${media.density}`],['scopeProtocol',printer.protocolVersion ?? t('unknown')],['scopeSpec',row.scope.testSpec],['evidenceLabel',t(levelKey)]];
      for (const [key,value] of values) {const pair=element('div');pair.append(element('dt','',t(key)),element('dd','',value));details.append(pair);}
      card.append(details);
      const counts = element('div','ml-scope-counts');
      for (const [key,value] of Object.entries(row.counts)) {const item=element('span');item.append(element('strong','',value),document.createTextNode(' '+t(resultKeys[key])));counts.append(item);}
      card.append(counts);
      if (!row.records.length) card.append(element('p','ml-registry-empty',t('noPublicEvidence')));
      const foot = element('div','ml-scope-foot');
      foot.append(element('span','',`${row.reportCount} ${t('countReports')} · ${row.authors} ${t('countPeople')} · ${t('lastTest')}: ${date(row.latest)}`));
      foot.append(link(reportURL(language,release.version),t('reportButton')));card.append(foot);
      if (row.records.length) {
        const evidence = element('details','ml-evidence');evidence.append(element('summary','',t('showEvidence')));
        const reports = element('ul');
        for (const record of [...row.records].sort((a,b)=>b.report.createdUtc.localeCompare(a.report.createdUtc))) {
          const item=element('li');
          item.append(link(record.issueUrl,`${t('sourceIssue')} · @${record.author} · ${date(record.report.createdUtc.slice(0,10))}`));
          item.append(element('p','',`${t(resultKeys[record.report.userResult])} · ${t('attemptLabel')}: ${t(attemptKeys[record.report.attemptStatus])}`));
          item.append(element('p','',t(record.evidenceLevel === 'maintainer_reproduced' ? 'evidenceReproduced' : 'evidenceUserReport')));
          const observations=record.report.observations;
          item.append(element('p','',`${t('observationOne')}: ${t(answerKeys[observations.exactlyOneWholeLabel])}; ${t('observationText')}: ${t(answerKeys[observations.textNotCut])}; ${t('observationQr')}: ${t(answerKeys[observations.qrScans])}.`));
          record.evidenceUrls.filter(url=>url!==record.issueUrl).forEach(url=>item.append(link(url,t('attachment'))));
          reports.append(item);
        }
        evidence.append(reports);card.append(evidence);
      }
      list.append(card);
    }
  }
  window.MiraCommunity = {render,reportURL};
})();

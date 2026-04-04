(function () {
  const $ = (id) => document.getElementById(id);

  const TYPE_LABELS = {
    choiceList: 'Choice List',
    datagrid: 'Data Grid',
    datetime: 'Date Time',
    editgrid: 'Edit Grid',
    phoneNumber: 'Phone Number',
    selectboxes: 'Select Boxes',
    textfield: 'Text Field'
  };

  const SESSION_KEY = 'templateLibraryState';
  const REFRESH_HINT_KEY = 'templateLibraryRefreshHint';
  const SEARCH_DEBOUNCE_MS = 220;
  const PAGE_SIZE = 25;
  const ROOT_MARGIN = '600px 0px';
  const COVER_REFRESH_INTERVAL_MS = 2000;
  const COVER_REFRESH_MAX_ATTEMPTS = 20;
  const COVER_RECENT_WINDOW_MS = 15 * 60 * 1000;
  const CARD_ROW_TOP_TOLERANCE_PX = 4;
  const CARD_EQUALIZE_SELECTORS = [
    '.template-card-heading',
    '.template-card-cover',
    '.template-card-footer'
  ];
  const initialViewMode = getViewModeFromUrl();

  const elements = {
    activeTemplatesCount: $('activeTemplatesCount'),
    sessionLongest: $('sessionLongest'),
    sessionAverage: $('sessionAverage'),
    topComponents: $('topComponents'),
    resetStatsBtn: $('resetStatsBtn'),
    templateResultsMeta: $('templateResultsMeta'),
    templateFilters: $('templateFilters'),
    searchInput: $('templateSearchInput'),
    statusSelect: $('templateStatusSelect'),
    savedFromInput: $('templateSavedFromInput'),
    savedToInput: $('templateSavedToInput'),
    report: $('savedTemplateReport'),
    emptyState: $('savedTemplateEmptyState'),
    loadingState: $('savedTemplateLoading'),
    endState: $('savedTemplateEndState'),
    errorState: $('savedTemplateError'),
    sentinel: $('savedTemplateSentinel'),
    viewModeButtons: Array.from(document.querySelectorAll('.template-view-btn[data-view-mode]'))
  };

  const state = {
    filters: getFiltersFromUrl(),
    viewMode: initialViewMode.value,
    hasExplicitViewMode: initialViewMode.explicit,
    items: [],
    nextCursor: null,
    hasMore: true,
    isLoading: false,
    requestId: 0,
    observer: null,
    searchTimer: null,
    abortController: null,
    overviewLoaded: false,
    coverRefreshTimer: null,
    coverRefreshAttempts: 0,
    cardLayoutFrame: null
  };

  function parseSessionState() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function sanitizeViewMode(viewMode) {
    return String(viewMode || '').trim().toLowerCase() === 'list' ? 'list' : 'card';
  }

  function getViewModeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return {
      value: sanitizeViewMode(params.get('view') || 'card'),
      explicit: params.has('view')
    };
  }

  function persistSessionState() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        filters: state.filters,
        viewMode: state.viewMode,
        items: state.items,
        nextCursor: state.nextCursor,
        hasMore: state.hasMore,
        scrollY: window.scrollY || 0,
        updatedAt: Date.now()
      }));
    } catch (err) {
      console.warn('Could not persist template library state.', err);
    }
  }

  function restoreSessionState() {
    const cached = parseSessionState();
    if (!cached || typeof cached !== 'object') return false;

    const currentFilters = serializeFilters(state.filters);
    const cachedFilters = serializeFilters(cached.filters || {});
    if (currentFilters !== cachedFilters) return false;

    if (!state.hasExplicitViewMode) {
      state.viewMode = sanitizeViewMode(cached.viewMode);
    }
    state.items = Array.isArray(cached.items) ? cached.items : [];
    state.nextCursor = cached.nextCursor || null;
    state.hasMore = Boolean(cached.hasMore);
    renderTemplateCards();
    requestAnimationFrame(() => {
      window.scrollTo(0, Math.max(0, Number(cached.scrollY) || 0));
    });
    return state.items.length > 0;
  }

  function getFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return sanitizeFilters({
      q: params.get('q') || '',
      status: params.get('status') || 'active',
      savedFrom: params.get('savedFrom') || '',
      savedTo: params.get('savedTo') || ''
    });
  }

  function sanitizeFilters(filters = {}) {
    const status = ['active', 'archived', 'all'].includes(filters.status) ? filters.status : 'active';
    return {
      q: String(filters.q || '').trim(),
      status,
      savedFrom: String(filters.savedFrom || '').slice(0, 10),
      savedTo: String(filters.savedTo || '').slice(0, 10)
    };
  }

  function serializeFilters(filters = state.filters) {
    return JSON.stringify(sanitizeFilters(filters));
  }

  function syncFiltersToInputs() {
    if (elements.searchInput) elements.searchInput.value = state.filters.q;
    if (elements.statusSelect) elements.statusSelect.value = state.filters.status;
    if (elements.savedFromInput) elements.savedFromInput.value = state.filters.savedFrom;
    if (elements.savedToInput) elements.savedToInput.value = state.filters.savedTo;
  }

  function syncViewModeButtons() {
    elements.viewModeButtons.forEach((button) => {
      const isActive = button.getAttribute('data-view-mode') === state.viewMode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    if (elements.report) {
      elements.report.dataset.viewMode = state.viewMode;
    }
  }

  function syncStateToUrl() {
    const params = new URLSearchParams();
    Object.entries(state.filters).forEach(([key, value]) => {
      if (!value) return;
      if (key === 'status' && value === 'active') return;
      params.set(key, value);
    });
    if (state.viewMode !== 'card') {
      params.set('view', state.viewMode);
    }
    const nextUrl = params.toString() ? `/stats?${params.toString()}` : '/stats';
    window.history.replaceState(null, '', nextUrl);
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      throw new Error((data && data.error) || text || `Request failed: ${url}`);
    }

    return data;
  }

  function formatNum(value) {
    return Math.max(0, Number(value) || 0).toLocaleString();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDuration(msValue) {
    const safeMs = Math.max(0, Math.floor(Number(msValue) || 0));
    const totalSeconds = Math.floor(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatDateShort(value) {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Unknown date';
    return dt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatMetricValue(value) {
    return value == null ? 'Not tracked' : formatNum(value);
  }

  function humanizeType(type) {
    const raw = String(type || '').trim();
    if (!raw) return 'Unknown';
    if (TYPE_LABELS[raw]) return TYPE_LABELS[raw];
    return raw
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function renderOverview(overview = {}) {
    if (elements.activeTemplatesCount) {
      elements.activeTemplatesCount.textContent = formatNum(overview.activeTemplates || 0);
    }
    if (elements.sessionLongest) {
      elements.sessionLongest.textContent = formatDuration(overview.sessionTimeStats?.longestMs);
    }
    if (elements.sessionAverage) {
      elements.sessionAverage.textContent = formatDuration(overview.sessionTimeStats?.averageMs);
    }
  }

  function renderTopUsage(overview = {}) {
    if (!elements.topComponents) return;
    const topItems = Array.isArray(overview.topComponents) ? overview.topComponents : [];
    elements.topComponents.innerHTML = topItems.length
      ? topItems
        .map((item) => `<li><span>${escapeHtml(humanizeType(item.type))}</span><strong>${formatNum(item.count)}</strong></li>`)
        .join('')
      : '<li><span>No usage yet</span><strong>0</strong></li>';
  }

  function buildTopMix(topMix) {
    const items = Array.isArray(topMix) ? topMix : [];
    if (!items.length) {
      return '<li class="template-card-chip is-empty">No component mix saved</li>';
    }
    return items.map((entry) => `
      <li class="template-card-chip">
        <span>${escapeHtml(humanizeType(entry.type))}</span>
        <strong>${formatNum(entry.count)}</strong>
      </li>
    `).join('');
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return Math.abs(Number(count) || 0) === 1 ? singular : plural;
  }

  function formatSessionMetric(value) {
    return value == null ? 'Not tracked' : formatDuration(value);
  }

  function buildTemplateBadges(item) {
    return [
      item.status === 'archived'
        ? '<span class="template-card-badge template-card-badge-archived">Archived</span>'
        : '<span class="template-card-badge template-card-badge-active">Active</span>',
      item.canLoad
        ? '<span class="template-card-badge template-card-badge-action">Ready to Open</span>'
        : '<span class="template-card-badge template-card-badge-muted">Metadata Only</span>'
    ].join('');
  }

  function buildArchiveAction(item) {
    const templateId = escapeHtml(item.templateId || '');
    const displayName = escapeHtml(item.displayName || 'Untitled Template');
    const action = item.status === 'archived' ? 'restore' : 'archive';
    const actionLabel = action === 'restore' ? 'Restore' : 'Archive';
    const buttonClass = action === 'restore' ? 'btn btn-ghost' : 'btn btn-danger';

    return `<button class="${buttonClass} template-card-archive" type="button" data-action="${action}" data-template-id="${templateId}" data-template-name="${displayName}">${actionLabel}</button>`;
  }

  function buildTemplateCardDataAttrs(item, templateId, currentVersionId, displayName) {
    return `
      data-template-id="${templateId}"
      data-version-id="${currentVersionId}"
      data-template-name="${displayName}"
      data-template-can-load="${item.canLoad ? 'true' : 'false'}"
      ${item.canLoad ? `tabindex="0" role="button" aria-label="Open ${displayName} in the builder"` : ''}
    `;
  }

  function buildTemplateCover(item, options = {}) {
    const variant = options.variant === 'list' ? 'list' : 'card';
    const coverImageUrl = typeof item.coverImageUrl === 'string' ? item.coverImageUrl.trim() : '';
    const hasCoverImage = Boolean(coverImageUrl);
    const isPending = !hasCoverImage && isRecentPendingCover(item);
    const coverClasses = [
      'template-card-cover',
      variant === 'list' ? 'is-list' : '',
      hasCoverImage ? '' : 'is-fallback',
      isPending ? 'is-pending' : ''
    ].filter(Boolean).join(' ');

    return `
      <div class="${coverClasses}">
        ${hasCoverImage ? `<img class="template-card-cover-image" src="${escapeHtml(coverImageUrl)}" alt="" loading="lazy" decoding="async" aria-hidden="true">` : ''}
        <div class="template-card-cover-scrim"></div>
        <span class="template-card-cover-brand" aria-hidden="true">
          <svg viewBox="39 10 30 30" focusable="false" aria-hidden="true">
            <path d="M166.106,61.03,162.4,58.188h0l3.706,6.238L172.561,53Z" transform="translate(-112.246 -36.632)"/>
            <path d="M153.827,46.85l3.212-1.328-1.575-3.768-3.212,1.328a10.425,10.425,0,0,0-2.965-2.965l1.328-3.212L146.848,35.3l-1.328,3.212a10.682,10.682,0,0,0-4.2,0L139.991,35.3l-3.768,1.575,1.328,3.212a10.425,10.425,0,0,0-2.965,2.965l-3.212-1.328L129.8,45.491l3.212,1.328a10.681,10.681,0,0,0,0,4.2L129.8,52.348l1.575,3.768,3.212-1.328a10.954,10.954,0,0,0,2.965,3l-1.328,3.212,3.768,1.575,1.328-3.212a10.682,10.682,0,0,0,4.2,0l1.328,3.212,3.768-1.575-1.328-3.212a10.425,10.425,0,0,0,2.965-2.965l3.212,1.328,1.575-3.768-3.212-1.328a10.681,10.681,0,0,0,0-4.2ZM143.389,55.22a6.269,6.269,0,1,1,6.269-6.269,6.274,6.274,0,0,1-6.269,6.269Z" transform="translate(-89.713 -24.398)"/>
            <path d="M186.4,56.4l2.749-3.4-2.131,4.015Z" transform="translate(-128.834 -36.632)"/>
          </svg>
        </span>
      </div>
    `;
  }

  function buildTemplateCard(item) {
    const templateId = escapeHtml(item.templateId || '');
    const currentVersionId = escapeHtml(item.currentVersionId || '');
    const displayName = escapeHtml(item.displayName || 'Untitled Template');
    const compactMeta = [
      formatDateShort(item.latestSavedAt),
      `${formatNum(item.totalComponents)} components`
    ].join(' · ');

    return `
      <article class="template-report-card${item.canLoad ? ' is-loadable' : ''}${item.status === 'archived' ? ' is-archived' : ''}" ${buildTemplateCardDataAttrs(item, templateId, currentVersionId, displayName)}>
        <div class="template-card-body">
          <div class="template-card-heading">
            <h3>${displayName}</h3>
            <p class="template-card-meta-line">${escapeHtml(compactMeta)}</p>
          </div>

          ${buildTemplateCover(item)}
        </div>

        <div class="template-card-footer">
          <div class="template-card-footer-actions">
            ${buildArchiveAction(item)}
          </div>
        </div>
      </article>
    `;
  }

  function buildTemplateListRow(item) {
    const templateId = escapeHtml(item.templateId || '');
    const currentVersionId = escapeHtml(item.currentVersionId || '');
    const displayName = escapeHtml(item.displayName || 'Untitled Template');
    const logicCount = Math.max(0, Number(item.conditionalCount) || 0) + Math.max(0, Number(item.calculationCount) || 0);
    const metaLine = [
      `Saved ${formatDateShort(item.latestSavedAt)}`,
      `${formatNum(item.totalComponents)} ${pluralize(item.totalComponents, 'component')}`,
      `${formatNum(item.versionCount)} ${pluralize(item.versionCount, 'version')}`
    ].join(' · ');

    return `
      <article class="template-report-card template-report-row${item.canLoad ? ' is-loadable' : ''}${item.status === 'archived' ? ' is-archived' : ''}" ${buildTemplateCardDataAttrs(item, templateId, currentVersionId, displayName)}>
        <div class="template-row-media">
          ${buildTemplateCover(item, { variant: 'list' })}
        </div>

        <div class="template-row-main">
          <div class="template-card-heading">
            <div class="template-row-heading-line">
              <h3>${displayName}</h3>
              <div class="template-card-badges">
                ${buildTemplateBadges(item)}
              </div>
            </div>
            <p class="template-card-meta-line">${escapeHtml(metaLine)}</p>
          </div>

          <div class="template-row-stats">
            <div class="template-row-stat">
              <span>Types</span>
              <strong>${formatNum(item.uniqueTypes)}</strong>
            </div>
            <div class="template-row-stat">
              <span>Logic</span>
              <strong>${formatNum(logicCount)}</strong>
            </div>
            <div class="template-row-stat">
              <span>Session</span>
              <strong>${escapeHtml(formatSessionMetric(item.sessionElapsedMs))}</strong>
            </div>
          </div>

          <ul class="template-card-chip-list">
            ${buildTopMix(item.topMix)}
          </ul>
        </div>

        <div class="template-row-actions">
          <div class="template-card-footer-actions">
            ${buildArchiveAction(item)}
          </div>
        </div>
      </article>
    `;
  }

  function updateResultsMeta() {
    if (!elements.templateResultsMeta) return;
    const activeFilterCount = Object.values(state.filters).filter(Boolean).length
      - (state.filters.status === 'active' ? 1 : 0);
    const suffix = activeFilterCount > 0 ? ` with ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : '';
    elements.templateResultsMeta.textContent = `${formatNum(state.items.length)} loaded${suffix}`;
  }

  function renderTemplateCards() {
    if (!elements.report) return;

    syncViewModeButtons();
    elements.report.innerHTML = state.items
      .map((item) => (state.viewMode === 'list' ? buildTemplateListRow(item) : buildTemplateCard(item)))
      .join('');
    const hasItems = state.items.length > 0;
    if (elements.emptyState) elements.emptyState.hidden = hasItems || state.isLoading || state.hasMore;
    if (elements.endState) elements.endState.hidden = !hasItems || state.hasMore || state.isLoading;
    if (elements.loadingState) elements.loadingState.hidden = !state.isLoading;
    updateResultsMeta();
    persistSessionState();
    scheduleTemplateCardLayout();
    scheduleCoverRefresh();
  }

  function clearTemplateCardLayout() {
    if (state.cardLayoutFrame) {
      window.cancelAnimationFrame(state.cardLayoutFrame);
      state.cardLayoutFrame = null;
    }
  }

  function resetTemplateCardSectionHeights(cards) {
    (cards || []).forEach((card) => {
      CARD_EQUALIZE_SELECTORS.forEach((selector) => {
        const section = card.querySelector(selector);
        if (section) section.style.minHeight = '';
      });
    });
  }

  function equalizeTemplateCardSections() {
    if (!elements.report) return;
    const cards = Array.from(elements.report.querySelectorAll('.template-report-card:not(.template-report-row)'));
    if (!cards.length) return;

    resetTemplateCardSectionHeights(cards);

    const rows = [];
    cards.forEach((card) => {
      const top = Math.round(card.offsetTop);
      let row = rows.find((entry) => Math.abs(entry.top - top) <= CARD_ROW_TOP_TOLERANCE_PX);
      if (!row) {
        row = { top, cards: [] };
        rows.push(row);
      }
      row.cards.push(card);
    });

    rows.forEach((row) => {
      if (row.cards.length < 2) return;

      CARD_EQUALIZE_SELECTORS.forEach((selector) => {
        const sections = row.cards
          .map((card) => card.querySelector(selector))
          .filter(Boolean);

        if (sections.length < 2) return;

        const maxHeight = Math.max(...sections.map((section) => Math.ceil(section.getBoundingClientRect().height)));
        sections.forEach((section) => {
          section.style.minHeight = `${maxHeight}px`;
        });
      });
    });
  }

  function scheduleTemplateCardLayout() {
    clearTemplateCardLayout();
    if (state.viewMode !== 'card') return;
    state.cardLayoutFrame = window.requestAnimationFrame(() => {
      state.cardLayoutFrame = null;
      equalizeTemplateCardSections();
    });
  }

  function clearCoverRefreshTimer() {
    if (state.coverRefreshTimer) {
      window.clearTimeout(state.coverRefreshTimer);
      state.coverRefreshTimer = null;
    }
  }

  function isRecentPendingCover(item) {
    if (!item || item.hasCoverImage) return false;
    const savedAtMs = new Date(item.latestSavedAt || item.savedAt || 0).getTime();
    if (!Number.isFinite(savedAtMs)) return false;
    return (Date.now() - savedAtMs) <= COVER_RECENT_WINDOW_MS;
  }

  function mergeTemplateItems(currentItems = [], incomingItems = []) {
    const nextItems = [];
    const seen = new Set();
    (incomingItems || []).forEach((item) => {
      if (!item?.templateId) return;
      nextItems.push(item);
      seen.add(item.templateId);
    });
    (currentItems || []).forEach((item) => {
      if (!item?.templateId || seen.has(item.templateId)) return;
      nextItems.push(item);
    });
    return nextItems;
  }

  async function refreshTemplateSnapshots() {
    if (state.isLoading) return;

    const payload = await fetchJson(buildTemplateQuery(null));
    const incoming = Array.isArray(payload.items) ? payload.items : [];
    state.items = mergeTemplateItems(state.items, incoming);
    renderTemplateCards();
  }

  function persistRefreshHint(templateId) {
    try {
      localStorage.setItem(REFRESH_HINT_KEY, JSON.stringify({
        templateId: String(templateId || '').trim(),
        updatedAt: Date.now()
      }));
    } catch (err) {
      console.warn('Could not persist template library refresh hint.', err);
    }
  }

  function consumeRefreshHint() {
    try {
      const raw = localStorage.getItem(REFRESH_HINT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const updatedAt = Number(parsed?.updatedAt);
      if (!Number.isFinite(updatedAt) || (Date.now() - updatedAt) > COVER_RECENT_WINDOW_MS) {
        localStorage.removeItem(REFRESH_HINT_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function scheduleCoverRefresh() {
    clearCoverRefreshTimer();

    if (state.coverRefreshAttempts >= COVER_REFRESH_MAX_ATTEMPTS) return;
    if (!state.items.some(isRecentPendingCover)) return;

    state.coverRefreshTimer = window.setTimeout(async () => {
      try {
        state.coverRefreshAttempts += 1;
        await refreshTemplateSnapshots();
      } catch (err) {
        renderError(err.message || 'Failed to refresh template covers.');
      }
    }, COVER_REFRESH_INTERVAL_MS);
  }

  function renderError(message) {
    if (!elements.errorState) return;
    elements.errorState.hidden = !message;
    elements.errorState.textContent = message || '';
  }

  async function loadOverview() {
    const overview = await fetchJson('/api/stats/overview');
    renderOverview(overview);
    renderTopUsage(overview);
    state.overviewLoaded = true;
  }

  function buildTemplateQuery(cursor = null) {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    Object.entries(state.filters).forEach(([key, value]) => {
      if (!value) return;
      params.set(key, value);
    });
    if (cursor) params.set('cursor', cursor);
    return `/api/templates?${params.toString()}`;
  }

  async function fetchNextPage({ reset = false, preserveScroll = false, keepVisible = false } = {}) {
    if (state.isLoading) return;
    if (!state.hasMore && !reset) return;

    if (state.abortController) {
      state.abortController.abort();
    }

    const requestId = ++state.requestId;
    state.isLoading = true;
    renderError('');
    renderTemplateCards();

    if (reset) {
      clearCoverRefreshTimer();
      state.coverRefreshAttempts = 0;
      if (!keepVisible) {
        state.items = [];
      }
      state.nextCursor = null;
      state.hasMore = true;
      if (!preserveScroll) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      renderTemplateCards();
    }

    const controller = new AbortController();
    state.abortController = controller;

    try {
      const payload = await fetchJson(buildTemplateQuery(reset ? null : state.nextCursor), {
        signal: controller.signal
      });
      if (requestId !== state.requestId) return;

      const incoming = Array.isArray(payload.items) ? payload.items : [];
      state.items = reset ? incoming : state.items.concat(incoming);
      state.nextCursor = payload.nextCursor || null;
      state.hasMore = Boolean(payload.hasMore);
      renderTemplateCards();
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (requestId !== state.requestId) return;
      renderError(err.message || 'Failed to load templates.');
    } finally {
      if (requestId === state.requestId) {
        state.isLoading = false;
        renderTemplateCards();
      }
    }
  }

  async function loadTemplateIntoBuilder(card) {
    const templateId = card.getAttribute('data-template-id');
    const versionId = card.getAttribute('data-version-id');
    const templateName = card.getAttribute('data-template-name') || 'Saved template';
    if (!versionId) return;

    const template = await fetchJson(`/api/template-versions/${encodeURIComponent(versionId)}/blob`);
    localStorage.setItem('importedForm', JSON.stringify(template.json || {}));
    localStorage.setItem('builderTemplateLoadName', String(template.name || templateName));
    localStorage.setItem('builderTemplateContext', JSON.stringify({
      templateId,
      versionId,
      name: template.name || templateName,
      sessionElapsedMs: template.sessionElapsedMs
    }));
    persistSessionState();
    window.location.assign('/formbuilder');
  }

  async function archiveOrRestoreTemplate(button) {
    const templateId = button.getAttribute('data-template-id');
    const templateName = button.getAttribute('data-template-name') || 'this template';
    const action = button.getAttribute('data-action') || 'archive';
    const verb = action === 'restore' ? 'Restore' : 'Archive';

    if (!templateId) return;
    if (!window.confirm(`${verb} "${templateName}"?`)) return;

    button.disabled = true;
    try {
      await fetchJson(`/api/templates/${encodeURIComponent(templateId)}/${action}`, { method: 'POST' });
      await Promise.all([fetchNextPage({ reset: true }), loadOverview()]);
    } finally {
      button.disabled = false;
    }
  }

  function attachObserver() {
    if (!elements.sentinel) return;
    if (state.observer) state.observer.disconnect();
    state.observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry?.isIntersecting) return;
      fetchNextPage().catch((err) => {
        renderError(err.message || 'Failed to load additional templates.');
      });
    }, {
      root: null,
      rootMargin: ROOT_MARGIN,
      threshold: 0
    });
    state.observer.observe(elements.sentinel);
  }

  function updateFilter(partial, { debounce = false } = {}) {
    state.filters = sanitizeFilters({
      ...state.filters,
      ...partial
    });
    syncStateToUrl();
    persistSessionState();

    if (debounce) {
      window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(() => {
        fetchNextPage({ reset: true }).catch((err) => renderError(err.message || 'Failed to load templates.'));
      }, SEARCH_DEBOUNCE_MS);
      return;
    }

    fetchNextPage({ reset: true }).catch((err) => renderError(err.message || 'Failed to load templates.'));
  }

  function setViewMode(viewMode) {
    const nextViewMode = sanitizeViewMode(viewMode);
    if (nextViewMode === state.viewMode) return;

    state.viewMode = nextViewMode;
    syncStateToUrl();
    renderTemplateCards();
  }

  async function resetStats() {
    if (!window.confirm('Reset all saved template stats?')) return;
    if (elements.resetStatsBtn) elements.resetStatsBtn.disabled = true;

    try {
      await fetchJson('/api/stats/reset', { method: 'POST' });
      state.items = [];
      state.nextCursor = null;
      state.hasMore = true;
      renderTemplateCards();
      await Promise.all([loadOverview(), fetchNextPage({ reset: true })]);
    } finally {
      if (elements.resetStatsBtn) elements.resetStatsBtn.disabled = false;
    }
  }

  function bindEvents() {
    if (elements.resetStatsBtn) {
      elements.resetStatsBtn.addEventListener('click', () => {
        resetStats().catch((err) => renderError(err.message || 'Failed to reset stats.'));
      });
    }

    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (event) => {
        updateFilter({ q: event.target.value }, { debounce: true });
      });
    }

    if (elements.statusSelect) {
      elements.statusSelect.addEventListener('change', (event) => {
        updateFilter({ status: event.target.value });
      });
    }

    if (elements.savedFromInput) {
      elements.savedFromInput.addEventListener('change', (event) => {
        updateFilter({ savedFrom: event.target.value });
      });
    }

    if (elements.savedToInput) {
      elements.savedToInput.addEventListener('change', (event) => {
        updateFilter({ savedTo: event.target.value });
      });
    }

    elements.viewModeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setViewMode(button.getAttribute('data-view-mode'));
      });
    });

    if (elements.report) {
      elements.report.addEventListener('click', (event) => {
        const actionButton = event.target.closest('.template-card-archive');
        if (actionButton) {
          archiveOrRestoreTemplate(actionButton).catch((err) => renderError(err.message || 'Failed to update template.'));
          return;
        }

        const card = event.target.closest('.template-report-card[data-template-can-load="true"]');
        if (!card) return;
        loadTemplateIntoBuilder(card).catch((err) => renderError(err.message || 'Failed to open template.'));
      });

      elements.report.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target.closest('.template-card-archive')) return;
        const card = event.target.closest('.template-report-card[data-template-can-load="true"]');
        if (!card) return;
        event.preventDefault();
        loadTemplateIntoBuilder(card).catch((err) => renderError(err.message || 'Failed to open template.'));
      });
    }

    window.addEventListener('storage', (event) => {
      if (event.key !== REFRESH_HINT_KEY || !event.newValue) return;
      fetchNextPage({
        reset: true,
        preserveScroll: true,
        keepVisible: true
      }).catch((err) => renderError(err.message || 'Failed to refresh templates.'));
    });

    window.addEventListener('resize', scheduleTemplateCardLayout);
    window.addEventListener('pagehide', persistSessionState);
    window.addEventListener('pagehide', clearCoverRefreshTimer);
    window.addEventListener('pagehide', clearTemplateCardLayout);
  }

  async function init() {
    syncFiltersToInputs();
    syncViewModeButtons();
    bindEvents();
    attachObserver();

    const restored = restoreSessionState();
    const refreshHint = consumeRefreshHint();
    syncFiltersToInputs();
    syncViewModeButtons();
    syncStateToUrl();

    try {
      await loadOverview();
      if (!restored || refreshHint) {
        await fetchNextPage({ reset: true });
      } else {
        fetchNextPage({
          reset: true,
          preserveScroll: true,
          keepVisible: true
        }).catch((err) => renderError(err.message || 'Failed to refresh templates.'));
      }
    } catch (err) {
      renderError(err.message || 'Failed to load template library.');
    }
  }

  window.templateLibraryPersistRefreshHint = persistRefreshHint;
  init();
}());

// Pure settings-search helpers. The previous search only walked GROUPS[].items
// and missed: groups without items (theme/accent), the whole tabs/system tabs,
// group/section titles and tab labels. This module builds a flat, normalized
// index so every visible label can be found.

/** Normalize a string for matching: lowercase, ё→е, collapse spaces. */
export function normalizeQuery(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a flat search index from the settings data.
 *
 * @param {object} p
 * @param {Array} p.tabMeta      [{id,label,kicker,desc}]
 * @param {object} p.groups      GROUPS map: { tabId: [{id,title,desc,items?}] }
 * @param {Array} p.customSearch [{tab,anchor,title,sub}]
 * @param {Array} p.islandTabs   [{id,label,fixed?}]
 * @param {Array} p.systemEntries extra entries like {tab:'system',anchor:'startup',title,sub}
 * @returns {Array<{tab:string,anchor?:string,title:string,sub?:string,kind:'setting'|'nav',item?:object}>}
 */
export function buildSearchIndex({ tabMeta = [], groups = {}, customSearch = [], islandTabs = [], systemEntries = [] }) {
  const out = [];

  // Tab labels themselves.
  for (const meta of tabMeta) {
    out.push({ tab: meta.id, anchor: null, title: meta.label, sub: meta.kicker || meta.desc || '', kind: 'nav' });
  }

  // Groups: index group titles AND their items. Iterate the GROUPS map itself
  // (not tabMeta) so a group is indexed even if its tab is missing from
  // tabMeta — the old search silently skipped such groups.
  for (const [tabId, list] of Object.entries(groups)) {
    for (const group of list || []) {
      if (group.title) {
        out.push({ tab: tabId, anchor: group.id || null, title: group.title, sub: group.desc || '', kind: 'nav' });
      }
      for (const item of group.items || []) {
        out.push({ tab: tabId, anchor: group.id || null, title: item.title, sub: item.sub || '', kind: 'setting', item });
      }
    }
  }

  for (const entry of customSearch) {
    out.push({ tab: entry.tab, anchor: entry.anchor || null, title: entry.title, sub: entry.sub || '', kind: 'nav' });
  }

  for (const tab of islandTabs) {
    if (tab.fixed) continue;
    out.push({
      tab: 'tabs',
      anchor: 'tabs-list',
      title: `Вкладка «${tab.label}»`,
      sub: 'Показать или скрыть в меню острова',
      kind: 'nav',
    });
  }

  for (const entry of systemEntries) {
    out.push({ tab: entry.tab, anchor: entry.anchor || null, title: entry.title, sub: entry.sub || '', kind: 'nav' });
  }

  return out;
}

/**
 * Filter the index by a query. Matches on title + sub.
 * @param {Array} index
 * @param {string} query
 * @returns {Array}
 */
export function searchIndex(index, query) {
  const q = normalizeQuery(query);
  if (!q) return [];
  const results = [];
  for (const entry of index) {
    const hay = normalizeQuery(`${entry.title} ${entry.sub || ''}`);
    if (hay.includes(q)) results.push(entry);
  }
  return results;
}

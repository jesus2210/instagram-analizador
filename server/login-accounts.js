import { graph } from './meta.js';

const required = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement'];
const numericId = value => typeof value === 'string' && /^[0-9]+$/.test(value);
const grantId = value => numericId(value) ? value : Number.isSafeInteger(value) && value > 0 ? String(value) : null;

export async function loginAccounts(accessToken, request = graph, options = {}) {
  const accounts = new Map();
  const pages = new Map();
  let listedPageCount = 0;
  let after;
  const addInstagram = (ig, fallback = 'Instagram') => {
    if (ig?.id) accounts.set(ig.id, { id: ig.id, username: ig.username || fallback });
  };
  const success = () => ({ accounts: [...accounts.values()], pageCount: pages.size, listedPageCount, issue: null, missingPermissions: [] });
  for (let page = 0; page < 20; page++) {
    const result = await request('me/accounts', {
      access_token: accessToken,
      fields: 'id,name,instagram_business_account{id,username}', limit: '100',
      ...(after ? { after } : {}),
    });
    listedPageCount += (result.data || []).length;
    for (const p of result.data || []) {
      if (p.id) pages.set(p.id, p);
      addInstagram(p.instagram_business_account, p.name);
    }
    after = result.paging?.next ? result.paging?.cursors?.after : null;
    if (!after) break;
  }
  if (accounts.size) return success();

  // A successful OAuth grant can name assets omitted by /me/accounts.
  // Inspect only this app's valid token, then verify any granted IG object with
  // the user's token. Neither the app token nor raw inspection data is returned.
  let grantInspectionFailed = false;
  let grantError = null;
  let failedInstagramLookups = 0;
  const instagramLookupErrors = [];
  let grantedInstagramCount = 0;
  let instagramLookupIncomplete = false;
  if (options.appAccessToken && options.expectedAppId) {
    try {
      const inspection = await request('debug_token', {
        input_token: accessToken, access_token: options.appAccessToken,
      });
      const grant = inspection.data;
      if (!grant?.is_valid || String(grant.app_id) !== String(options.expectedAppId)) {
        grantInspectionFailed = true;
      } else {
        const instagramIds = new Set();
        for (const scope of grant.granular_scopes || []) {
          if (!(grant.scopes || []).includes(scope.scope)) continue;
          for (const rawId of scope.target_ids || []) {
            const id = grantId(rawId);
            if (!id) {
              if (typeof rawId === 'number') grantInspectionFailed = true;
              continue;
            }
            if (['pages_show_list', 'pages_read_engagement'].includes(scope.scope) && !pages.has(id)) {
              pages.set(id, { id, name: 'Instagram' });
            }
            if (['instagram_basic', 'instagram_manage_insights'].includes(scope.scope)) instagramIds.add(id);
          }
        }
        grantedInstagramCount = instagramIds.size;
        const candidates = [...instagramIds].slice(0, 5);
        instagramLookupIncomplete = instagramIds.size > candidates.length;
        const results = await Promise.allSettled(candidates.map(id => request(id, {
          fields: 'id,username,media_count', access_token: accessToken,
        })));
        results.forEach((result, index) => {
          if (result.status !== 'fulfilled') {
            failedInstagramLookups++;
            instagramLookupErrors.push({ code: result.reason?.providerCode ?? null, subcode: result.reason?.providerSubcode ?? null, status: result.reason?.status ?? null });
            return;
          }
          const ig = result.value;
          // media_count distinguishes an IG object from a Page ID in a grant.
          if (String(ig.id) === candidates[index] && typeof ig.username === 'string' && Number.isFinite(ig.media_count)) addInstagram(ig);
          else { failedInstagramLookups++; instagramLookupErrors.push({ code: null, status: null, reason: 'unexpected-object-shape' }); }
        });
      }
    } catch (error) { grantInspectionFailed = true; grantError = { code: error?.providerCode ?? null, subcode: error?.providerSubcode ?? null, status: error?.status ?? null }; }
  }
  if (accounts.size) return { ...success(), grantedInstagramCount };

  let failedPageLookups = 0;
  const candidates = [...pages.values()].slice(0, 50);
  const lookupIncomplete = pages.size > candidates.length || instagramLookupIncomplete;
  if (candidates.length) {
    try {
      const details = await request('', {
        ids: candidates.map(p => p.id).join(','),
        fields: 'instagram_business_account{id,username}',
        access_token: accessToken,
      });
      for (const p of candidates) {
        const detail = details[p.id];
        if (!detail || detail.error) { failedPageLookups++; continue; }
        addInstagram(detail.instagram_business_account, p.name);
      }
    } catch { failedPageLookups = candidates.length; }
  }
  if (accounts.size) return { ...success(), failedPageLookups, grantedInstagramCount };
  let missingPermissions = null;
  try {
    const result = await request('me/permissions', { access_token: accessToken });
    const granted = new Set((result.data || []).filter(p => p.status === 'granted').map(p => p.permission));
    missingPermissions = required.filter(p => !granted.has(p));
  } catch { /* Keep an unavailable permission inspection distinct from denial. */ }
  return {
    accounts: [], pageCount: pages.size, listedPageCount, missingPermissions,
    failedPageLookups, grantedInstagramCount, grantInspectionFailed, grantError, failedInstagramLookups, instagramLookupErrors,
    issue: missingPermissions?.length ? 'missing-permissions' : failedInstagramLookups ? 'instagram-lookup-failed' : failedPageLookups ? 'page-lookup-failed' : lookupIncomplete ? 'page-lookup-incomplete' : grantInspectionFailed ? 'grant-inspection-failed' : pages.size ? 'no-linked-instagram' : 'no-pages',
  };
}

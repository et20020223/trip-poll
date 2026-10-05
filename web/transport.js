const PROTOCOL = 'trip-poll-v2';

export function createTransport(endpoint) {
  const url = new URL(endpoint);
  if (url.origin !== 'https://script.google.com' || !/^\/(?:macros\/s|a\/macros\/[a-zA-Z0-9.-]+\/s)\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) {
    throw new Error('Apps Script 網址格式錯誤，請使用部署後的 /exec 網址。');
  }
  const channel = [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
  const pending = new Map();
  let target, targetOrigin, resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // A rejected readiness promise may precede the first user request.
  ready.catch(() => {});
  const readinessTimeout = setTimeout(() => rejectReady(new Error('無法連接調查服務。請重新整理；若仍失敗，請聯絡負責人檢查 Apps Script 部署網址及存取設定。')), 25000);
  window.addEventListener('message', event => {
    const m = event.data;
    const trustedOrigin = /^https:\/\/(?:script|[a-z0-9-]+-script)\.googleusercontent\.com$/.test(event.origin);
    if (!trustedOrigin || !m || m.protocol !== PROTOCOL || m.channel !== channel) return;
    if (m.type === 'ready' && !target) {
      target = event.source; targetOrigin = event.origin; clearTimeout(readinessTimeout); resolveReady(); return;
    }
    if (event.source !== target || event.origin !== targetOrigin || m.type !== 'response' || !pending.has(m.id)) return;
    const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer);
    if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
  });
  const iframe = document.createElement('iframe');
  iframe.title = '調查資料連線'; iframe.hidden = true; iframe.referrerPolicy = 'no-referrer';
  url.searchParams.set('channel', channel); iframe.src = url.href; document.body.append(iframe);
  return async request => {
    await ready;
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(!['load','bootstrap','loginBegin','login','logout'].includes(request.action) ? '尚未收到儲存確認。請按「重新讀取」確認結果，避免重複新增資料。' : '讀取逾時，請重新整理或稍後重試。'));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      target.postMessage({ protocol: PROTOCOL, channel, type: 'request', id, request }, targetOrigin);
    });
  };
}

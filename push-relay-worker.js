// 蹦蹦車 推播中轉站 (Cloudflare Worker)
// 作用：讓網頁可以安全地發 Expo 推播（瀏覽器不能直接呼叫 exp.host，會被 CORS 擋）。
// 部署後會得到一個網址，例如 https://bbc-push.你的帳號.workers.dev
// 把那個網址填到 config.js 的 window.BBC_PUSH_RELAY。
export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('ok', { headers: cors });
    const url = new URL(request.url);
    // /send -> exp.host/--/api/v2/push/send ; /getReceipts -> .../getReceipts
    const path = url.pathname === '/' ? '/send' : url.pathname;
    const target = 'https://exp.host/--/api/v2/push' + path;
    const body = await request.text();
    let resp;
    try {
      resp = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body,
      });
    } catch (e) {
      return new Response(JSON.stringify({ errors: [String(e)] }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const text = await resp.text();
    return new Response(text, { status: resp.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};

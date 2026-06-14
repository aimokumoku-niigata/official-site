const NOTE_RSS   = 'https://note.com/aimokumoku/rss';
const PEATIX_RE  = /https?:\/\/(?:[\w-]+\.)?peatix\.com\/event\/(\d+)[^\s"'<>]*/gi;
const FETCH_OPTS = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; site-fetcher/1.0)' } };

async function parseRss(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? '';
    if (link) items.push(link);
  }
  return items;
}

async function fetchText(url) {
  try {
    const res = await fetch(url, FETCH_OPTS);
    if (!res.ok) return '';
    // URLは属性値(href/data-src等)に埋まっているので生HTMLのまま返す
    return await res.text();
  } catch {
    return '';
  }
}

async function fetchEventData(eventId) {
  try {
    const res = await fetch(
      `https://peatix.com/event/${eventId}/get_view_data`,
      FETCH_OPTS
    );
    if (!res.ok) return null;
    const body = await res.json();
    // レスポンスは { json_data: { event: {...} } } の形
    return body?.json_data?.event ?? body;
  } catch {
    return null;
  }
}

export async function onRequest() {
  try {
    // 1. note RSS から直近5件の記事URLを取得
    const rssRes = await fetch(NOTE_RSS, FETCH_OPTS);
    if (!rssRes.ok) throw new Error('rss fetch failed');
    const articleUrls = await parseRss(await rssRes.text());

    // 2. 各記事の本文からPeatixのイベントIDを抽出
    const seenIds = new Set();
    const eventIds = [];

    for (const url of articleUrls.slice(0, 5)) {
      const text = await fetchText(url);
      let match;
      PEATIX_RE.lastIndex = 0;
      while ((match = PEATIX_RE.exec(text)) !== null) {
        const id = match[1];
        if (!seenIds.has(id)) {
          seenIds.add(id);
          eventIds.push(id);
        }
      }
    }

    // 3. 各イベントのデータを /get_view_data で取得
    const events = await Promise.all(
      eventIds.map(async id => {
        const d = await fetchEventData(id);
        if (!d) return null;
        return {
          id,
          title:    d.name ?? '',
          date:     d.datetime ? d.datetime.split(' ')[0] : null,
          timeStart: d.timeStart ?? null,
          timeEnd:   d.timeEnd  ?? null,
          url:      `https://peatix.com/event/${id}`,
          isOpen:   d.isOpen   ?? false,
          isFinished: d.isFinished ?? false,
          status:   d.status   ?? '',
        };
      })
    );

    // 4. 開催日で過去/今後を分類
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const valid    = events.filter(Boolean);
    const upcoming = valid.filter(e => !e.date || new Date(e.date) >= now);
    const past     = valid.filter(e =>  e.date && new Date(e.date) <  now);

    return new Response(JSON.stringify({ upcoming, past }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=21600, s-maxage=21600',
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, upcoming: [], past: [] }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

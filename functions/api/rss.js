export async function onRequest() {
  const upstream = 'https://note.com/aimokumoku/rss';

  let res;
  try {
    res = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; site-fetcher/1.0)' },
    });
  } catch {
    return new Response('fetch failed', { status: 502 });
  }

  if (!res.ok) {
    return new Response('upstream error', { status: res.status });
  }

  const body = await res.text();

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      // 30分キャッシュ — note の更新頻度に対して十分短い
      'Cache-Control': 'public, max-age=21600, s-maxage=21600',
    },
  });
}

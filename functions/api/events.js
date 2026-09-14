const PEATIX_API = 'https://peatix-api.com/v4/groups';
const GROUP_IDS  = [16543330, 16521341];
const FETCH_OPTS = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; site-fetcher/1.0)' } };

const jstDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
const jstTime = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });

async function fetchGroupEvents(groupId, kind) {
  const res = await fetch(`${PEATIX_API}/${groupId}/${kind}?limit=100`, FETCH_OPTS);
  if (!res.ok) throw new Error(`peatix ${kind} fetch failed: ${res.status}`);
  const body = await res.json();
  return body.data ?? [];
}

function toEvent(e) {
  const start = e.start?.utc ? new Date(e.start.utc) : null;
  const end   = e.end?.utc ? new Date(e.end.utc) : null;
  const no    = e.name?.match(/#(\d+)/)?.[1];
  return {
    id:        e.id,
    no:        no != null ? Number(no) : null,
    title:     e.name ?? '',
    date:      start ? jstDate.format(start) : null,
    timeStart: start ? jstTime.format(start) : null,
    timeEnd:   end ? jstTime.format(end) : null,
    url:       e.details?.shortUrl ?? `https://peatix.com/event/${e.id}`,
    isOpen:    e.status === 'open',
    status:    e.status ?? '',
    startUtc:  e.start?.utc ?? '',
  };
}

async function collect(kind) {
  const lists = await Promise.all(GROUP_IDS.map(id => fetchGroupEvents(id, kind)));
  const seen = new Set();
  return lists.flat()
    .filter(e => !seen.has(e.id) && seen.add(e.id))
    .map(toEvent);
}

export async function onRequest() {
  try {
    const [upcoming, past] = await Promise.all([collect('upcoming-events'), collect('past-events')]);
    upcoming.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    past.sort((a, b) => b.startUtc.localeCompare(a.startUtc));

    return new Response(JSON.stringify({ upcoming, past }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
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

// functions/lib/kst.mjs
export function toKstDay(date = new Date()) {
  // 'YYYY-MM-DD' 형식, 한국 시간(서울) 기준
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // e.g. "2025-09-23"
}

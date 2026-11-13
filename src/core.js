const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function unescapeIcsText(value) {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseProperty(line) {
  const colon = line.indexOf(':');
  if (colon < 1) return null;

  const [name, ...parameters] = line.slice(0, colon).split(';');
  const params = {};
  for (const parameter of parameters) {
    const equals = parameter.indexOf('=');
    if (equals > 0) {
      params[parameter.slice(0, equals).toUpperCase()] = parameter.slice(equals + 1).replace(/^"|"$/g, '');
    }
  }

  return {
    name: name.toUpperCase(),
    params,
    value: line.slice(colon + 1),
  };
}

function dateInTimeZone(year, month, day, hour, minute, second, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = target;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    guess += target - represented;
  }

  return new Date(guess);
}

function parseIcsDate(property, isEndDate) {
  const value = property.value.trim();
  const dateOnly = property.params.VALUE === 'DATE' || /^\d{8}$/.test(value);

  if (dateOnly) {
    const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) return null;

    let year = Number(match[1]);
    let month = Number(match[2]);
    let day = Number(match[3]);
    if (isEndDate) {
      const previousDay = new Date(Date.UTC(year, month - 1, day - 1));
      year = previousDay.getUTCFullYear();
      month = previousDay.getUTCMonth() + 1;
      day = previousDay.getUTCDate();
    }

    return dateInTimeZone(year, month, day, 23, 59, 59, DEFAULT_TIME_ZONE);
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, utc] = match;
  if (utc) {
    return new Date(Date.UTC(
      Number(year), Number(month) - 1, Number(day),
      Number(hour), Number(minute), Number(second),
    ));
  }

  return dateInTimeZone(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    property.params.TZID || DEFAULT_TIME_ZONE,
  );
}

export function parseICS(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split(/BEGIN:VEVENT\s*/i).slice(1);
  const events = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.split(/END:VEVENT/i, 1)[0];
    const properties = new Map();
    for (const line of block.split(/\r?\n/)) {
      const property = parseProperty(line);
      if (!property) continue;
      const values = properties.get(property.name) || [];
      values.push(property);
      properties.set(property.name, values);
    }

    const first = (name) => properties.get(name)?.[0];
    const uid = first('UID')?.value.trim();
    const title = first('SUMMARY')?.value;
    const end = first('DTEND');
    const start = first('DTSTART');
    const due = end ? parseIcsDate(end, true) : start ? parseIcsDate(start, false) : null;
    if (!uid || !title || !due || Number.isNaN(due.getTime())) continue;

    const category = first('CATEGORIES')?.value || '';
    const eventUrl = first('URL')?.value.trim();
    let url = 'https://elearning.citd.edu.vn/my/';
    if (eventUrl) {
      try {
        const parsedUrl = new URL(eventUrl);
        if (parsedUrl.protocol === 'https:') url = parsedUrl.href;
      } catch {
        url = 'https://elearning.citd.edu.vn/my/';
      }
    }

    events.push({
      id: `citd_${uid}`,
      source: 'CITD',
      group: unescapeIcsText(category) || 'Môn học CITD',
      title: unescapeIcsText(title),
      due_at: due.toISOString(),
      submitted_at: null,
      url,
    });
  }

  return events;
}

export function classifyItem(item) {
  if (!item.submitted_at) return 'UNSUBMITTED';
  return new Date(item.submitted_at).getTime() <= new Date(item.due_at).getTime()
    ? 'SUBMITTED_ON_TIME'
    : 'SUBMITTED_LATE';
}

export function dueDateToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error(`Jira trả về ngày hạn không hợp lệ: ${value}`);
  }
  const [year, month, day] = value.split('-').map(Number);
  return dateInTimeZone(year, month, day, 23, 59, 59, DEFAULT_TIME_ZONE).toISOString();
}

export function unescapeText(value) {
  return unescapeIcsText(value || '');
}

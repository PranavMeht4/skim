// In-memory stand-in for a SQL database, so the service has no dependencies.
// It understands only the statements the service uses. Rows are lost on restart.

const rows = [];
let nextId = 1;

// Every statement is recorded here, which tests use to inspect what was run.
export const queryLog = [];

export function reset() {
  rows.length = 0;
  nextId = 1;
  queryLog.length = 0;
}

const matcher = (cond, params, state) => {
  const m = cond.trim().match(/^(\w+)\s*(=|LIKE)\s*(\?|'(.*)'|(\d+))$/is);
  if (!m) throw new Error(`unsupported condition: ${cond}`);
  const [, col, op, rhs, quoted, bare] = m;
  const value = rhs === '?' ? params[state.next++] : (quoted ?? bare);
  if (op === '=') return (row) => String(row[col]) === String(value);
  const re = new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
  return (row) => re.test(String(row[col]));
};

function where(sql, params, state) {
  const idx = sql.search(/\bWHERE\b/i);
  if (idx === -1) return () => true;
  const conds = sql.slice(idx + 5).split(/\s+AND\s+/i).map((c) => matcher(c, params, state));
  return (row) => conds.every((c) => c(row));
}

export function query(sql, params = []) {
  queryLog.push({ sql, params });
  const state = { next: 0 };

  if (/^\s*INSERT INTO reminders/i.test(sql)) {
    const row = {
      id: nextId++,
      user_id: params[0],
      text: params[1],
      at: params[2],
      tz_offset_min: params[3],
      due_ms: params[4],
      sent: 0,
    };
    rows.push(row);
    return [row];
  }
  if (/^\s*SELECT \* FROM reminders/i.test(sql)) {
    return rows.filter(where(sql, params, state)).map((r) => ({ ...r }));
  }
  if (/^\s*UPDATE reminders SET sent = 1/i.test(sql)) {
    const hit = rows.filter(where(sql, params, state));
    hit.forEach((r) => { r.sent = 1; });
    return hit.length;
  }
  if (/^\s*DELETE FROM reminders/i.test(sql)) {
    const hit = where(sql, params, state);
    const keep = rows.filter((r) => !hit(r));
    const removed = rows.length - keep.length;
    rows.length = 0;
    rows.push(...keep);
    return removed;
  }
  throw new Error(`unsupported statement: ${sql}`);
}

// Formats and delivers one reminder. The formatter is chosen by name, so the
// message format can be switched from config.json without a code change.

const formatters = new Map();

async function getFormatter(name) {
  if (!formatters.has(name)) {
    const mod = await import(`./${name}.js`);
    formatters.set(name, mod.default);
  }
  return formatters.get(name);
}

export async function send(reminder, { formatter = 'legacy', out = console.log } = {}) {
  const format = await getFormatter(formatter);
  out(format(reminder));
}

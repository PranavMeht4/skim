// pair.mjs <id> <rows> <out.html>: plain Claude Code vs skim, the same prompt. <rows> = 0 shows each whole reply,
// so the difference in length is visible without saying it.
import { readFileSync, writeFileSync } from 'node:fs'
import xtermHeadless from '@xterm/headless'
import serialize from '@xterm/addon-serialize'
const [, , id, rowsArg = '34', out] = process.argv
const N = +rowsArg > 0 ? +rowsArg : Infinity
const prompt = readFileSync(new URL('./prompts.tsv', import.meta.url), 'utf8').split('\n').map(l => l.split('\t')).find(([k]) => k === id)[1]

function grab(arm) {
  return new Promise(done => {
    const term = new xtermHeadless.Terminal({ cols: 88, rows: 150, scrollback: 5000, allowProposedApi: true })
    const ser = new serialize.SerializeAddon()
    term.loadAddon(ser)
    term.write(readFileSync(new URL(`./rec-${id}-${arm}.log`, import.meta.url)), () => {
      const b = term.buffer.active
      const text = i => b.getLine(i)?.translateToString(true) ?? ''
      let start = -1, end = b.length - 1
      for (let i = 0; i < b.length; i++) {
        if (start < 0 && text(i).startsWith('❯ ') && text(i).includes(prompt.slice(0, 20))) start = i
        if (start >= 0 && i > start && /^\s*[✻✳✶✽✢·*] \S+ for /.test(text(i))) { end = i - 1; break }
      }
      // Drop blank rows at the end of the reply.
      while (end > start && !text(end).trim()) end--
      const html = ser.serializeAsHTML({ includeGlobalBackground: true })
      const body = html.slice(html.indexOf('<div><span'), html.lastIndexOf('</div></pre>'))
      const rows = body.split('<div><span').slice(1).map(r => '<div><span' + r)
      const total = end - start + 1
      // Browsers leave gaps between lines of block glyphs that a terminal fills; paint them solid.
      const solid = rows.slice(start, Math.min(end + 1, start + N)).join('').replace(/█+/g, m => `<b class="f">${m}</b>`)
      done({ rows: solid, total })
    })
  })
}

const [a, b] = await Promise.all([grab('default'), grab('skim')])
const pane = (cls, label, g) => `<div class="${cls}"><div class="label"><span class="t">${label}</span></div>
<div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>&nbsp; claude</div><pre>${g.rows}</pre></div></div>`
writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
.wrap{display:flex;gap:22px;padding:16px 18px;align-items:flex-start}
.label{display:flex;justify-content:space-between;align-items:baseline;margin:0 4px 8px;font-size:17px;color:#848d97}
.label .t{font-weight:700;font-size:19px;color:#848d97}
.after .label .t{color:#388bfd}
.win{border-radius:12px;overflow:hidden;background:#15161a;box-shadow:0 10px 30px rgba(0,0,0,.18),0 0 0 1px rgba(255,255,255,.06)}
.after .win{box-shadow:0 10px 30px rgba(0,0,0,.18),0 0 0 2px #2f6fdd}
.bar{height:30px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#1e1f24;color:#8b8f98;font:12px ui-monospace,Menlo,monospace}
.dot{width:11px;height:11px;border-radius:50%;display:inline-block}
pre{margin:0;padding:12px 14px;font:13px/1.22 ui-monospace,SFMono-Regular,Menlo,monospace;color:#d4d4d0;width:88ch}
pre span{background-color:transparent}
.f{font-weight:inherit;background:currentColor}
</style></head><body><div class="wrap">${pane('before', 'Before · Claude Code', a)}${pane('after', 'After · skim', b)}</div></body></html>`)
// The window height that fits the taller pane, for the screenshot.
console.log(Math.ceil(Math.min(N, Math.max(a.total, b.total)) * 15.9 + 128))

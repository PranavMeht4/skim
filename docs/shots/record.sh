#!/bin/sh
# Records every prompt in prompts.tsv twice (plain Claude Code, then skim) and
# renders each pair to ../before-after-<id>.png. Needs expect, node, Chrome.
#   cd docs/shots && npm install && ./record.sh [id ...]
set -e
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ids=${*:-$(cut -f1 "$here/prompts.tsv")}
one() {
  p=$(awk -F'\t' -v k="$1" '$1==k{print $2}' "$here/prompts.tsv")
  w=$(mktemp -d) && cp -R "$repo/evals/fixture/." "$w/"
  [ "$1" = charts ] && cp "$here/demo.md" "$w/"
  expect "$here/record.exp" "$repo" "$w" "$p" "$here/rec-$1-$2.log" opus "$2" >/dev/null 2>&1
  rm -rf "$w"
}
for id in $ids; do
  one "$id" default & one "$id" skim & wait
  h=$(node "$here/pair.mjs" "$id" 0 "$here/pair-$id.html")
  "$chrome" --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=1560,"$h" \
    --default-background-color=00000000 --screenshot="$repo/docs/before-after-$id.png" "file://$here/pair-$id.html" 2>/dev/null
done

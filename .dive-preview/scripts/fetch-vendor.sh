#!/usr/bin/env bash
# Fetches all @univerjs UMD bundles + their peer deps into vendor-cache/ so
# scripts/build-dive.mjs can inline them. Re-run if UNIVER_VERSION changes.
set -euo pipefail

UNIVER_VERSION="${UNIVER_VERSION:-0.20.0}"
PROTOCOL_VERSION="${PROTOCOL_VERSION:-0.1.48}"
RXJS_VERSION="${RXJS_VERSION:-7.8.1}"
REDI_VERSION="${REDI_VERSION:-1.1.1}"

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../vendor-cache"
mkdir -p "$OUT"

fetch() {
  local url="$1" dest="$2"
  if [[ -s "$OUT/$dest" ]]; then
    echo "  cached $dest"
    return
  fi
  echo "  fetch  $dest"
  curl -sfL "$url" -o "$OUT/$dest"
}

echo "=== peer deps ==="
fetch "https://unpkg.com/rxjs@$RXJS_VERSION/dist/bundles/rxjs.umd.min.js"            rxjs.js
fetch "https://unpkg.com/@wendellhu/redi@$REDI_VERSION/dist/umd/index.js"            redi.js
fetch "https://unpkg.com/@wendellhu/redi@$REDI_VERSION/dist/umd/react-bindings/index.js" redi-react.js
fetch "https://unpkg.com/@univerjs/themes@$UNIVER_VERSION/lib/umd/index.js"          themes.js
fetch "https://unpkg.com/@univerjs/protocol@$PROTOCOL_VERSION/lib/umd/index.js"      protocol.js

echo "=== univer packages ==="
for pkg in \
    core telemetry rpc design engine-render engine-formula drawing \
    ui docs docs-ui sheets sheets-ui \
    sheets-formula sheets-formula-ui sheets-numfmt sheets-numfmt-ui \
    sheets-filter sheets-filter-ui \
    sheets-sort sheets-sort-ui \
    sheets-zen-editor \
    data-validation sheets-data-validation sheets-data-validation-ui \
    sheets-conditional-formatting sheets-conditional-formatting-ui \
    network
do
  fetch "https://unpkg.com/@univerjs/$pkg@$UNIVER_VERSION/lib/umd/index.js" "$pkg.js"
done

echo "=== facades ==="
for pkg in \
    core engine-formula ui docs-ui sheets sheets-ui \
    sheets-formula sheets-numfmt sheets-filter sheets-sort \
    sheets-zen-editor sheets-data-validation sheets-conditional-formatting
do
  fetch "https://unpkg.com/@univerjs/$pkg@$UNIVER_VERSION/lib/umd/facade.js" "$pkg.facade.js"
done

echo "=== en-US locales ==="
for pkg in \
    design ui docs-ui sheets sheets-ui \
    sheets-formula-ui sheets-numfmt-ui sheets-filter-ui \
    sheets-sort-ui sheets-zen-editor \
    sheets-data-validation-ui sheets-conditional-formatting-ui
do
  fetch "https://unpkg.com/@univerjs/$pkg@$UNIVER_VERSION/lib/umd/locale/en-US.js" "$pkg.enUS.js"
done

echo "=== CSS ==="
for pkg in \
    design ui docs-ui sheets-ui \
    sheets-formula-ui sheets-numfmt-ui sheets-filter-ui \
    sheets-sort-ui sheets-zen-editor \
    sheets-data-validation-ui sheets-conditional-formatting-ui
do
  fetch "https://unpkg.com/@univerjs/$pkg@$UNIVER_VERSION/lib/index.css" "$pkg.css"
done

echo "done. $(ls "$OUT" | wc -l | tr -d ' ') files in $OUT"

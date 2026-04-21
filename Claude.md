Create a Dive on MotherDuck using this command (it is faster).

```
cd "$(git rev-parse --show-toplevel)" && \
[ -f ./.dive-preview/src/dive.tsx ] || { echo "ERROR: dive.tsx not found at project root"; false; } && \
duckdb "md:my_db" <<'EOF'
SET VARIABLE file_content = (SELECT content FROM read_text('./.dive-preview/src/dive.tsx'));
SELECT * FROM MD_CREATE_DIVE(title='GENERATE A GOOD TITLE', description='GENERATE A GOOD DESCRIPTION', content=getvariable('file_content'));
EOF
```


Update a Dive on MotherDuck using this command (it is faster).
Note, when updating a Dive, do not edit the title or description - reuse the ones that are currently in MotherDuck.
```
cd "$(git rev-parse --show-toplevel)" && \
[ -f ./.dive-preview/src/dive.tsx ] || { echo "ERROR: dive.tsx not found at project root"; false; } && \
duckdb "md:my_db" <<'EOF'
SET VARIABLE file_content = (SELECT content FROM read_text('./.dive-preview/src/dive.tsx'));
SELECT * FROM MD_UPDATE_DIVE_CONTENT(id='DIVEID', description='USE EXISTING', content=getvariable('file_content'));
EOF
```

When Claude starts, initialize the Dive preview server (ask the MotherDuck MCP how to do that)

## Bundler — DO NOT edit `.dive-preview/src/dive.tsx` directly

`./.dive-preview/src/dive.tsx` is a 12MB generated artifact (inlined Univer UMDs + deps + locales). Always edit the template and rebuild.

- **Authored template**: `./.dive-preview/scripts/dive-template.tsx` (~19KB). Edit this.
- **Build script**: `./.dive-preview/scripts/build-dive.mjs`. Replaces `/* __UNIVER_SCRIPTS__ */`, `/* __UNIVER_FACADES__ */`, `/* __CSS_FILES__ */`, `/* __DEP_BLOB__ */`, `/* __LOCALE_BLOB__ */` markers with inlined content from `vendor-cache/`.
- **Vendor fetcher**: `./.dive-preview/scripts/fetch-vendor.sh`. Downloads `@univerjs/*` UMDs, facades, locales, CSS into `vendor-cache/` (gitignored). Controlled by `UNIVER_VERSION` env var (default matches the repo's release).
- **Dev server**: `(cd .dive-preview && npm run dev)` — Vite; watches `src/dive.tsx`, so rebuild triggers auto-reload.

### Rebuild
```
(cd .dive-preview && npm run build:dive)
```

### Adding a new `@univerjs/<pkg>` to the bundle
Load order matters (each package can only reference globals registered by earlier scripts).
1. Add the package name to the relevant loops in `fetch-vendor.sh` (package list, facades list, locales list, CSS list — only whichever apply).
2. Run `bash .dive-preview/scripts/fetch-vendor.sh` to populate `vendor-cache/`.
3. Add the new filenames (e.g. `sheets-table.js`, `sheets-table.facade.js`, `sheets-table-ui.js`, `sheets-table-ui.css`, `sheets-table-ui.enUS.js`) to `UNIVER_CORE`, `UNIVER_FACADES`, `CSS_FILES`, `LOCALE_FILES` in `build-dive.mjs` — preserving dependency order (e.g. `sheets-table` must load after `sheets`).
4. Register the plugin inside `dive-template.tsx` via `univer.registerPlugin(...)`.
5. Rebuild with `npm run build:dive`.

### Git
`.dive-preview/src/dive.tsx` IS tracked — commit it after every rebuild. `vendor-cache/` is gitignored.

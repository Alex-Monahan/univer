/**
 * Univer as a MotherDuck Dive.
 *
 * Build-time markers (replaced by scripts/build-dive.mjs — do NOT remove):
 *   /* __UNIVER_SCRIPTS__ *\/    replaced with readable UMD JS strings
 *   /* __UNIVER_FACADES__ *\/    replaced with facade JS strings
 *   /* __CSS_FILES__ *\/         replaced with CSS strings
 *   /* __DEP_BLOB__ *\/          replaced with gzip+base64 dep blob
 *   /* __LOCALE_BLOB__ *\/       replaced with gzip+base64 locale blob
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSQLQuery } from "@motherduck/react-sql-query";
import { Loader2, AlertCircle } from "lucide-react";

// Imperative SQL runner wrapping useSQLQuery. The production MotherDuck Dive
// runtime only exposes useSQLQuery (no useConnection / safeEvaluateQuery), so
// we flip state-driven hook calls into an awaitable function. One query in
// flight at a time — enough for our serial probe / fetch / refresh flows.
function useImperativeSql(): {
  run: (sql: string) => Promise<any[]>;
  inFlight: boolean;
} {
  const [sql, setSql] = useState<string | null>(null);
  const resolverRef = useRef<((rows: any[]) => void) | null>(null);
  const rejecterRef = useRef<((err: Error) => void) | null>(null);

  const result = useSQLQuery(sql ?? "SELECT 1", { enabled: sql != null });

  useEffect(() => {
    if (sql == null) return;
    if (result.isSuccess && result.data !== undefined) {
      const resolve = resolverRef.current;
      resolverRef.current = null;
      rejecterRef.current = null;
      setSql(null);
      resolve?.(result.data as any[]);
    } else if (result.isError) {
      const reject = rejecterRef.current;
      resolverRef.current = null;
      rejecterRef.current = null;
      setSql(null);
      reject?.(result.error ?? new Error("SQL query failed"));
    }
  }, [sql, result.isSuccess, result.isError, result.data, result.error]);

  const run = useCallback(
    (nextSql: string) =>
      new Promise<any[]>((resolve, reject) => {
        if (resolverRef.current) {
          reject(new Error("A previous SQL query is still in flight"));
          return;
        }
        resolverRef.current = resolve;
        rejecterRef.current = reject;
        setSql(nextSql);
      }),
    [],
  );

  return { run, inFlight: sql != null };
}

type RunSql = (sql: string) => Promise<any[]>;

// ---------- inlined univer code (readable) ----------
const UNIVER_SCRIPTS: string[] = /* __UNIVER_SCRIPTS__ */ [];
const UNIVER_FACADES: string[] = /* __UNIVER_FACADES__ */ [];
const CSS_FILES: string[] = /* __CSS_FILES__ */ [];

// ---------- inlined deps & locales (gzip+base64) ----------
const DEP_BLOB: string = /* __DEP_BLOB__ */ "";
const LOCALE_BLOB: string = /* __LOCALE_BLOB__ */ "";

// ---------- dive config ----------
const STORAGE_KEY = "univer-dive-workbook-v1";
const SOURCES_KEY = "univer-dive-sources";
const EDITS_KEY_PREFIX = "univer-dive-edits:";

// ---------- source/edit types ----------
type DirectSource = {
  mode: "direct";
  database: string;
  schema: string;
  table: string;
  pkColumns: string[];
  storageKey: string;
};
type QuerySource = {
  mode: "query";
  sql: string;
  name: string;
  pkColumns: string[];
  storageKey: string;
};
type SourceMeta = DirectSource | QuerySource;
type SourcesRegistry = Record<string /* tableId */, SourceMeta>;

type OverlayValue = { value: unknown; original: unknown; editedAt: string };
type EditStore = {
  overlays: Record<string /* pkKey */, Record<string /* column */, OverlayValue>>;
  newRows: Array<{
    localId: string;
    pk: Record<string, unknown>;
    values: Record<string, unknown>;
    pending: Record<string, unknown>;
    editedAt: string;
  }>;
  staleOverlays: EditStore["overlays"];
};

// ---------- SQL helpers ----------
function quoteIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function sqlLiteral(v: unknown): string {
  if (v == null) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

function buildSourceSql(source: SourceMeta): string {
  return source.mode === "direct"
    ? `SELECT * FROM ${quoteIdent(source.database)}.${quoteIdent(
        source.schema,
      )}.${quoteIdent(source.table)}`
    : source.sql;
}

function buildUpdateSql(
  source: DirectSource,
  column: string,
  value: unknown,
  pk: Record<string, unknown>,
): string {
  const where = source.pkColumns
    .map((c) => `${quoteIdent(c)} = ${sqlLiteral(pk[c])}`)
    .join(" AND ");
  return `UPDATE ${quoteIdent(source.database)}.${quoteIdent(
    source.schema,
  )}.${quoteIdent(source.table)} SET ${quoteIdent(column)} = ${sqlLiteral(
    value,
  )} WHERE ${where};`;
}

function buildInsertSql(
  source: DirectSource,
  row: Record<string, unknown>,
): string {
  const cols = Object.keys(row);
  return `INSERT INTO ${quoteIdent(source.database)}.${quoteIdent(
    source.schema,
  )}.${quoteIdent(source.table)} (${cols
    .map(quoteIdent)
    .join(", ")}) VALUES (${cols.map((c) => sqlLiteral(row[c])).join(", ")});`;
}

// ---------- localStorage helpers ----------
function readSourcesRegistry(): SourcesRegistry {
  try {
    const raw = localStorage.getItem(SOURCES_KEY);
    return raw ? (JSON.parse(raw) as SourcesRegistry) : {};
  } catch {
    return {};
  }
}

function writeSourcesRegistry(reg: SourcesRegistry): void {
  try {
    localStorage.setItem(SOURCES_KEY, JSON.stringify(reg));
  } catch (e) {
    console.warn("[UniverDive] sources registry write failed", e);
  }
}

function emptyEditStore(): EditStore {
  return { overlays: {}, newRows: [], staleOverlays: {} };
}

function readEditStore(storageKey: string): EditStore {
  try {
    const raw = localStorage.getItem(EDITS_KEY_PREFIX + storageKey);
    if (!raw) return emptyEditStore();
    const parsed = JSON.parse(raw) as Partial<EditStore>;
    return {
      overlays: parsed.overlays ?? {},
      newRows: parsed.newRows ?? [],
      staleOverlays: parsed.staleOverlays ?? {},
    };
  } catch {
    return emptyEditStore();
  }
}

function writeEditStore(storageKey: string, store: EditStore): void {
  try {
    localStorage.setItem(
      EDITS_KEY_PREFIX + storageKey,
      JSON.stringify(store),
    );
  } catch (e) {
    console.warn("[UniverDive] edit store write failed", e);
  }
}

function pkKeyOf(pkColumns: string[], row: Record<string, unknown>): string {
  return JSON.stringify(pkColumns.map((c) => row[c] ?? null));
}

// ---------- MotherDuck imperative helpers (via useImperativeSql) ----------
async function probeSource(
  runSql: RunSql,
  spec: SourceMeta,
): Promise<{ columns: string[]; ndv: Record<string, number> }> {
  const sub = `(${buildSourceSql(spec)})`;
  const descRows = await runSql(`DESCRIBE ${sub}`);
  const columns: string[] = descRows
    .map((r: any) => String(r.column_name ?? r.Column ?? ""))
    .filter(Boolean);
  if (columns.length === 0) return { columns: [], ndv: {} };
  const selectList = columns
    .map(
      (c) =>
        `approx_count_distinct(${quoteIdent(c)}) AS ${quoteIdent("ndv_" + c)}`,
    )
    .join(", ");
  const ndvRows = await runSql(`SELECT ${selectList} FROM ${sub}`);
  const row = ndvRows[0] ?? {};
  const ndv: Record<string, number> = {};
  for (const c of columns) {
    const v = row["ndv_" + c];
    ndv[c] = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  }
  return { columns, ndv };
}

function pickDefaultPk(ndv: Record<string, number>): string[] {
  const entries = Object.entries(ndv);
  if (entries.length === 0) return [];
  entries.sort((a, b) => b[1] - a[1]);
  return [entries[0][0]];
}

async function fetchSource(
  runSql: RunSql,
  spec: SourceMeta,
): Promise<{ columns: string[]; rows: Row[] }> {
  const rows = (await runSql(buildSourceSql(spec))) as Row[];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows };
}

function genTableId(): string {
  return "tbl-" + Math.random().toString(36).slice(2, 10);
}

// `by` is a DuckDB reserved keyword, so double-quote the identifier. All other
// column names here are safe bare words.
const DEFAULT_QUERY = `
  SELECT
    title,
    "by" AS author,
    score,
    descendants AS comments,
    strftime(timestamp, '%Y-%m-%d') AS posted,
    url
  FROM "sample_data"."hn"."hacker_news"
  WHERE type = 'story' AND score IS NOT NULL
  ORDER BY score DESC
  LIMIT 100
`;

// Order of columns in the grid. Matches the SELECT clause above.
const COLUMNS: { key: string; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "score", label: "Score" },
  { key: "comments", label: "Comments" },
  { key: "posted", label: "Posted" },
  { key: "url", label: "URL" },
];

// ---------- runtime helpers ----------
async function decompressBlob(b64: string): Promise<{ name: string; code: string }[]> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new (window as any).DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

// Exec a raw JS string in global scope. Dive hosts enforce different CSPs, so
// we probe three strategies with a canary and pick whichever actually executes.
type ExecFn = (code: string, sourceUrl?: string) => void;
let _execStrategy: ExecFn | null = null;

function pickExecStrategy(): ExecFn {
  if (_execStrategy) return _execStrategy;
  const annotated = (c: string, s?: string) =>
    c + (s ? `\n//# sourceURL=${s}` : "");
  const tryScriptTag: ExecFn = (c, s) => {
    const el = document.createElement("script");
    el.textContent = annotated(c, s);
    document.head.appendChild(el);
    document.head.removeChild(el);
  };
  const tryIndirectEval: ExecFn = (c, s) => {
    (0, eval)(annotated(c, s));
  };
  const tryNewFunction: ExecFn = (c, s) => {
    // eslint-disable-next-line no-new-func
    new Function(annotated(c, s))();
  };

  // Ordering: probe the strategies the current CSP is likely to accept first
  // so we don't emit useless CSP-violation errors to the console. Most hosts
  // ship 'unsafe-eval' (needed for WASM + DuckDB WASM client init), so start
  // with eval; fall back to script-tag only for hosts that block eval but
  // allow inline.
  const anyProbe: any = (window as any).__UNIVER_PROBE_FIRST__;
  const evalFirst = anyProbe !== "script-tag";
  const strategies: Array<[string, ExecFn]> = evalFirst
    ? [
        ["indirect-eval", tryIndirectEval],
        ["new-function", tryNewFunction],
        ["script-tag", tryScriptTag],
      ]
    : [
        ["script-tag", tryScriptTag],
        ["indirect-eval", tryIndirectEval],
        ["new-function", tryNewFunction],
      ];

  const g: any = window;
  const probeCode =
    "globalThis.__UNIVER_EXEC_PROBE__ = (globalThis.__UNIVER_EXEC_PROBE__ || 0) + 1;";
  let lastErr: any = null;
  for (const [name, fn] of strategies) {
    g.__UNIVER_EXEC_PROBE__ = 0;
    try {
      fn(probeCode, "univer-exec-probe");
    } catch (e) {
      lastErr = e;
      console.info(`[UniverDive] exec "${name}" unavailable (${(e as any)?.message ?? e}), trying next`);
      continue;
    }
    if (g.__UNIVER_EXEC_PROBE__ === 1) {
      console.info(`[UniverDive] exec strategy: ${name}`);
      _execStrategy = fn;
      return fn;
    }
    console.info(
      `[UniverDive] exec "${name}" silently CSP-blocked, trying next`,
    );
  }
  throw new Error(
    "[UniverDive] no exec strategy worked. Last error: " +
      (lastErr?.message ?? String(lastErr)),
  );
}

function execInGlobalScope(code: string, sourceUrl?: string) {
  return pickExecStrategy()(code, sourceUrl);
}

function injectStyle(css: string) {
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
}

let _univerLoadPromise: Promise<any> | null = null;
async function loadUniverRuntime() {
  if (_univerLoadPromise) return _univerLoadPromise;
  _univerLoadPromise = (async () => {
    const g: any = window;

    // The dive sandbox only exposes {react, react-dom, react-dom/client} — it
    // does NOT expose react/jsx-runtime. Univer's UMDs ask for globalThis.React
    // for both "react" and "react/jsx-runtime", so we synthesize jsx/jsxs from
    // React.createElement. jsxs needs synthetic keys for keyless array children.
    const ReactNS: any = await import("react");
    const ReactDOMNS: any = await import("react-dom");
    const ReactDOMClientNS: any = await import("react-dom/client");
    const React = ReactNS.default ?? ReactNS;
    const ReactDOM = ReactDOMNS.default ?? ReactDOMNS;
    const ReactDOMClient = ReactDOMClientNS.default ?? ReactDOMClientNS;
    const createElement = React.createElement;
    const shimJsx = (type: any, config: any, maybeKey?: any) => {
      const props = { ...(config || {}) };
      if (maybeKey !== undefined) props.key = maybeKey;
      return createElement(type, props);
    };
    const shimJsxs = (type: any, config: any, maybeKey?: any) => {
      const props = { ...(config || {}) };
      if (maybeKey !== undefined) props.key = maybeKey;
      if (Array.isArray(props.children)) {
        props.children = props.children.map((c: any, i: number) => {
          if (c && typeof c === "object" && c.$$typeof && c.key == null) {
            return { ...c, key: `.${i}` };
          }
          return c;
        });
      }
      return createElement(type, props);
    };
    g.React = Object.assign({}, React, {
      jsx: shimJsx,
      jsxs: shimJsxs,
      jsxDEV: shimJsx,
      Fragment: React.Fragment,
    });
    g.ReactDOM = Object.assign({}, ReactDOM, ReactDOMClient);

    const deps = await decompressBlob(DEP_BLOB);
    for (const { name, code } of deps) execInGlobalScope(code, `univer-dep/${name}`);

    for (let i = 0; i < UNIVER_SCRIPTS.length; i++) {
      execInGlobalScope(UNIVER_SCRIPTS[i], `univer-pkg/${i}.js`);
    }

    for (let i = 0; i < UNIVER_FACADES.length; i++) {
      execInGlobalScope(UNIVER_FACADES[i], `univer-facade/${i}.js`);
    }

    const locales = await decompressBlob(LOCALE_BLOB);
    for (const { name, code } of locales)
      execInGlobalScope(code, `univer-locale/${name}`);

    for (const css of CSS_FILES) injectStyle(css);

    return g;
  })();
  return _univerLoadPromise;
}

// ---------- data → workbook snapshot ----------
type Row = Record<string, any>;

function coerceCell(v: any): string | number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
    return typeof v === "boolean" ? String(v) : v;
  }
  // DuckDB wraps some types (Date, Decimal, etc.) in objects — stringify them
  // so they render instead of blank-screening the grid.
  try {
    return String(v);
  } catch {
    return null;
  }
}

function buildSnapshot(rows: Row[]): any {
  const cellData: Record<number, Record<number, { v: any; s?: string }>> = {};
  cellData[0] = {};
  COLUMNS.forEach((c, i) => {
    cellData[0][i] = { v: c.label, s: "header" };
  });
  rows.forEach((r, ri) => {
    cellData[ri + 1] = {};
    COLUMNS.forEach((c, ci) => {
      const v = coerceCell(r?.[c.key]);
      if (v == null || v === "") return;
      cellData[ri + 1][ci] = { v };
    });
  });
  return {
    id: "univer-dive-wb",
    name: "MotherDuck Dive",
    appVersion: "0.20.0",
    locale: "enUS",
    styles: {
      header: { bl: 1, bg: { rgb: "#e9edff" }, fs: 11 },
    },
    sheetOrder: ["sheet-01"],
    sheets: {
      "sheet-01": {
        id: "sheet-01",
        name: "Sheet1",
        rowCount: Math.max(rows.length + 20, 100),
        columnCount: Math.max(COLUMNS.length + 5, 26),
        cellData,
        defaultColumnWidth: 120,
        defaultRowHeight: 22,
        columnData: {
          0: { w: 320 }, // title
          1: { w: 120 }, // author
          2: { w: 70 }, // score
          3: { w: 90 }, // comments
          4: { w: 100 }, // posted
          5: { w: 360 }, // url
        },
        freeze: { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 },
      },
    },
  };
}

// ---------- pre-mutation veto (PK completeness) ----------
// Returns true if this mutation must be cancelled because it edits a non-PK
// cell on a row whose primary key is incomplete.
function vetoIfPkIncomplete(api: any, params: any): string | null {
  const cellValue = params?.cellValue;
  if (!cellValue || typeof cellValue !== "object") return null;
  const wb = api.getActiveWorkbook?.();
  const ws = wb?.getActiveSheet?.();
  if (!ws) return null;
  const reg = readSourcesRegistry();
  if (Object.keys(reg).length === 0) return null;

  const headerCache: Record<string, string[]> = {};

  for (const rowStr of Object.keys(cellValue)) {
    const row = Number(rowStr);
    if (!Number.isFinite(row)) continue;
    const cols = cellValue[rowStr] ?? {};
    for (const colStr of Object.keys(cols)) {
      const col = Number(colStr);
      if (!Number.isFinite(col)) continue;
      const info =
        ws.getTableByCell?.(row, col) ??
        (ws.getSubTableInfos?.() ?? []).find(
          (t: any) =>
            row >= t.range.startRow &&
            row <= t.range.endRow &&
            col >= t.range.startColumn &&
            col <= t.range.endColumn,
        );
      if (!info) continue;
      const meta = reg[info.id];
      if (!meta) continue;
      if (row === info.range.startRow) continue;

      let headers = headerCache[info.id];
      if (!headers) {
        const hv =
          ws
            .getRange(
              info.range.startRow,
              info.range.startColumn,
              1,
              info.range.endColumn - info.range.startColumn + 1,
            )
            .getValues?.()?.[0] ?? [];
        headers = hv.map((v: any) => (v == null ? "" : String(v)));
        headerCache[info.id] = headers;
      }

      const columnName = headers[col - info.range.startColumn];
      if (!columnName) continue;
      // PK-column edits can't be rejected (they may be the thing completing
      // the PK).
      if (meta.pkColumns.includes(columnName)) continue;

      // Compute the row's PK state AFTER applying any PK-column edits from
      // this same mutation batch.
      const rowValues =
        ws
          .getRange(
            row,
            info.range.startColumn,
            1,
            info.range.endColumn - info.range.startColumn + 1,
          )
          .getValues?.()?.[0] ?? [];
      const rowRecord: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        rowRecord[headers[i]] = rowValues[i];
      }
      for (const sameColStr of Object.keys(cols)) {
        const sameCol = Number(sameColStr);
        const sameName = headers[sameCol - info.range.startColumn];
        if (sameName && meta.pkColumns.includes(sameName)) {
          rowRecord[sameName] = extractNewValue(cols[sameColStr]);
        }
      }
      const incomplete = meta.pkColumns.some((c) => {
        const v = rowRecord[c];
        return v == null || v === "";
      });
      if (incomplete) {
        return `Fill primary-key column(s) (${meta.pkColumns.join(", ")}) before editing other cells on this row.`;
      }
    }
  }
  return null;
}

// ---------- edit interception ----------
// Extract the new value a mutation wrote into cellData[row][col], handling
// both `{ v: ... }` and scalar shapes Univer may emit.
function extractNewValue(cell: any): unknown {
  if (cell == null) return null;
  if (typeof cell === "object" && "v" in cell) return cell.v;
  return cell;
}

function handleCellMutation(api: any, params: any): void {
  const cellValue = params?.cellValue;
  if (!cellValue || typeof cellValue !== "object") return;
  const wb = api.getActiveWorkbook?.();
  const ws = wb?.getActiveSheet?.();
  if (!ws) return;
  const reg = readSourcesRegistry();
  if (Object.keys(reg).length === 0) return;

  // Cache headers per table for this batch.
  const headerCache: Record<string, string[]> = {};

  for (const rowStr of Object.keys(cellValue)) {
    const row = Number(rowStr);
    if (!Number.isFinite(row)) continue;
    const cols = cellValue[rowStr] ?? {};
    for (const colStr of Object.keys(cols)) {
      const col = Number(colStr);
      if (!Number.isFinite(col)) continue;
      const info =
        ws.getTableByCell?.(row, col) ??
        // fallback: linear scan over getSubTableInfos
        (ws.getSubTableInfos?.() ?? []).find(
          (t: any) =>
            row >= t.range.startRow &&
            row <= t.range.endRow &&
            col >= t.range.startColumn &&
            col <= t.range.endColumn,
        );
      if (!info) continue;
      const meta = reg[info.id];
      if (!meta) continue;
      // Skip edits to the header row itself.
      if (row === info.range.startRow) continue;

      let headers = headerCache[info.id];
      if (!headers) {
        const headerRange = ws.getRange(
          info.range.startRow,
          info.range.startColumn,
          1,
          info.range.endColumn - info.range.startColumn + 1,
        );
        const hv = headerRange.getValues?.()?.[0] ?? [];
        headers = hv.map((v: any) => (v == null ? "" : String(v)));
        headerCache[info.id] = headers;
      }
      const columnName = headers[col - info.range.startColumn];
      if (!columnName) continue;

      const newValue = extractNewValue(cols[colStr]);

      // Read current row values (post-mutation) for PK lookup.
      const rowRange = ws.getRange(
        row,
        info.range.startColumn,
        1,
        info.range.endColumn - info.range.startColumn + 1,
      );
      const rowValues: any[] = rowRange.getValues?.()?.[0] ?? [];
      const rowRecord: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        rowRecord[headers[i]] = rowValues[i];
      }

      // PK completeness check. If any PK column is blank, treat as incomplete
      // and skip overlay write — new-row gating lands in a later phase.
      const pkIncomplete = meta.pkColumns.some((c) => {
        const v = rowRecord[c];
        return v == null || v === "";
      });
      if (pkIncomplete) {
        console.warn(
          "[dive:edit] skipping edit — primary-key columns incomplete on row",
          { row, pkColumns: meta.pkColumns, rowRecord },
        );
        continue;
      }

      const pk: Record<string, unknown> = {};
      for (const c of meta.pkColumns) pk[c] = rowRecord[c];
      const pkKey = pkKeyOf(meta.pkColumns, rowRecord);

      const store = readEditStore(meta.storageKey);
      const prev = store.overlays[pkKey]?.[columnName];
      const originalValue = prev?.original ?? newValue;
      store.overlays[pkKey] = store.overlays[pkKey] ?? {};
      store.overlays[pkKey][columnName] = {
        value: newValue,
        original: originalValue,
        editedAt: new Date().toISOString(),
      };
      writeEditStore(meta.storageKey, store);

      if (meta.mode === "direct") {
        console.log(
          "[dive:would-update]",
          buildUpdateSql(meta as DirectSource, columnName, newValue, pk),
        );
      } else {
        console.log("[dive:query-overlay]", {
          storageKey: meta.storageKey,
          pkKey,
          column: columnName,
          value: newValue,
        });
      }
    }
  }
}

// ---------- bind source → sheet ----------
async function addTableToSheet(
  api: any,
  runSql: RunSql,
  meta: SourceMeta,
): Promise<string> {
  const { columns, rows } = await fetchSource(runSql, meta);
  if (columns.length === 0) {
    throw new Error("Source returned no columns");
  }
  const wb = api.getActiveWorkbook();
  const ws = wb.getActiveSheet();

  const existing: any[] = ws.getSubTableInfos?.() ?? [];
  const startRow =
    existing.length === 0
      ? 0
      : Math.max(...existing.map((t: any) => t.range?.endRow ?? 0)) + 3;
  const startCol = 0;

  const values: any[][] = [columns.slice()];
  for (const r of rows) {
    values.push(columns.map((c) => coerceCell(r?.[c])));
  }

  const range = ws.getRange(startRow, startCol, values.length, columns.length);
  range.setValues(values);

  const endRow = startRow + values.length - 1;
  const endCol = startCol + columns.length - 1;

  const tableId = genTableId();
  const tableName =
    meta.mode === "direct"
      ? `${meta.database}_${meta.schema}_${meta.table}`.replace(
          /[^a-zA-Z0-9_]/g,
          "_",
        )
      : meta.name.replace(/[^a-zA-Z0-9_]/g, "_") || "query";

  await ws.addTable(
    tableName,
    { startRow, startColumn: startCol, endRow, endColumn: endCol },
    tableId,
  );
  return tableId;
}

// ---------- refresh a bound table ----------
async function refreshSource(
  api: any,
  runSql: RunSql,
  tableId: string,
  meta: SourceMeta,
): Promise<{ stale: number }> {
  const wb = api.getActiveWorkbook?.();
  const ws = wb?.getActiveSheet?.();
  if (!ws) throw new Error("No active worksheet");
  const info =
    wb.getTableInfo?.(tableId) ??
    (ws.getSubTableInfos?.() ?? []).find((t: any) => t.id === tableId);
  if (!info) throw new Error(`Table ${tableId} not found`);

  const { columns, rows } = await fetchSource(runSql, meta);
  if (columns.length === 0) throw new Error("Source returned no columns");

  const startRow = info.range.startRow;
  const startCol = info.range.startColumn;
  const oldEndRow = info.range.endRow;
  const oldEndCol = info.range.endColumn;

  // Preserve the existing column order if it matches the newly returned set;
  // otherwise adopt the new columns.
  const existingHeaders: string[] = (
    ws
      .getRange(startRow, startCol, 1, oldEndCol - startCol + 1)
      .getValues?.()?.[0] ?? []
  ).map((v: any) => (v == null ? "" : String(v)));
  const sameCols =
    existingHeaders.length === columns.length &&
    existingHeaders.every((h) => columns.includes(h));
  const colsToUse = sameCols ? existingHeaders : columns;

  const newValues: any[][] = [colsToUse.slice()];
  for (const r of rows) {
    newValues.push(colsToUse.map((c) => coerceCell(r?.[c])));
  }

  const store = readEditStore(meta.storageKey);
  const liveKeys = new Set<string>();
  for (let i = 1; i < newValues.length; i++) {
    const rowRecord: Record<string, unknown> = {};
    for (let j = 0; j < colsToUse.length; j++) {
      rowRecord[colsToUse[j]] = newValues[i][j];
    }
    const pkKey = pkKeyOf(meta.pkColumns, rowRecord);
    liveKeys.add(pkKey);
    const overlay = store.overlays[pkKey];
    if (overlay) {
      for (const [colName, ov] of Object.entries(overlay)) {
        const ci = colsToUse.indexOf(colName);
        if (ci >= 0) newValues[i][ci] = ov.value as any;
      }
    }
  }

  // Move overlays whose PK no longer exists to staleOverlays.
  let staleCount = 0;
  for (const pkKey of Object.keys(store.overlays)) {
    if (!liveKeys.has(pkKey)) {
      store.staleOverlays[pkKey] = store.overlays[pkKey];
      delete store.overlays[pkKey];
      staleCount++;
    }
  }
  writeEditStore(meta.storageKey, store);

  // Clear the old (possibly larger) range before writing new values so rows
  // that disappeared don't linger.
  const clearRange = ws.getRange(
    startRow,
    startCol,
    oldEndRow - startRow + 1,
    oldEndCol - startCol + 1,
  );
  const blank: any[][] = Array.from(
    { length: oldEndRow - startRow + 1 },
    () => Array(oldEndCol - startCol + 1).fill(null),
  );
  clearRange.setValues?.(blank);

  ws.getRange(startRow, startCol, newValues.length, colsToUse.length).setValues(
    newValues,
  );

  const newEndRow = startRow + newValues.length - 1;
  const newEndCol = startCol + colsToUse.length - 1;
  if (newEndRow !== oldEndRow || newEndCol !== oldEndCol) {
    await ws.setTableRange?.(tableId, {
      startRow,
      startColumn: startCol,
      endRow: newEndRow,
      endColumn: newEndCol,
    });
  }
  return { stale: staleCount };
}

async function refreshAllSources(api: any, runSql: RunSql): Promise<void> {
  const reg = readSourcesRegistry();
  for (const [tableId, meta] of Object.entries(reg)) {
    try {
      await refreshSource(api, runSql, tableId, meta);
    } catch (e) {
      console.warn(`[dive:refresh] ${tableId} failed`, e);
    }
  }
}

// ---------- Add Source modal ----------
function AddSourceModal(props: {
  open: boolean;
  onClose: () => void;
  onCreate: (meta: SourceMeta) => Promise<void>;
  runSql: RunSql;
  canQuery: boolean;
}) {
  const { open, onClose, onCreate, runSql, canQuery } = props;
  const [mode, setMode] = useState<"direct" | "query">("direct");
  const [tableRef, setTableRef] = useState("sample_data.hn.hacker_news");
  const [sqlText, setSqlText] = useState(
    "SELECT title, score FROM sample_data.hn.hacker_news LIMIT 20",
  );
  const [name, setName] = useState("");
  const [probing, setProbing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [probeErr, setProbeErr] = useState<string>("");
  const [columns, setColumns] = useState<string[]>([]);
  const [ndv, setNdv] = useState<Record<string, number>>({});
  const [pkColumns, setPkColumns] = useState<string[]>([]);

  if (!open) return null;

  const buildSpec = (): SourceMeta => {
    if (mode === "direct") {
      const parts = tableRef.trim().split(".");
      if (parts.length !== 3) {
        throw new Error("Table reference must be in form db.schema.table");
      }
      const [database, schema, table] = parts;
      return {
        mode: "direct",
        database,
        schema,
        table,
        pkColumns,
        storageKey: `${database}.${schema}.${table}`,
      };
    }
    const n = name.trim() || "query-" + Math.random().toString(36).slice(2, 7);
    return {
      mode: "query",
      sql: sqlText,
      name: n,
      pkColumns,
      storageKey: `query:${n}`,
    };
  };

  const handleProbe = async () => {
    if (!canQuery) {
      setProbeErr("MotherDuck connection not ready");
      return;
    }
    setProbing(true);
    setProbeErr("");
    setColumns([]);
    setNdv({});
    setPkColumns([]);
    try {
      const spec = buildSpec();
      const { columns, ndv } = await probeSource(runSql, spec);
      setColumns(columns);
      setNdv(ndv);
      setPkColumns(pickDefaultPk(ndv));
    } catch (e: any) {
      setProbeErr(String(e?.message ?? e));
    } finally {
      setProbing(false);
    }
  };

  const handleCreate = async () => {
    if (columns.length === 0) {
      setProbeErr("Probe the source first");
      return;
    }
    if (pkColumns.length === 0) {
      setProbeErr("Select at least one primary-key column");
      return;
    }
    setCreating(true);
    setProbeErr("");
    try {
      await onCreate(buildSpec());
      onClose();
    } catch (e: any) {
      setProbeErr(String(e?.message ?? e));
    } finally {
      setCreating(false);
    }
  };

  const overlay: any = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const panel: any = {
    background: "white",
    padding: 20,
    width: 540,
    maxHeight: "80vh",
    overflow: "auto",
    borderRadius: 8,
    fontFamily: "inherit",
    boxShadow: "0 6px 24px rgba(0,0,0,0.2)",
  };
  const inputStyle: any = {
    width: "100%",
    marginBottom: 8,
    padding: 6,
    boxSizing: "border-box",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontFamily: "inherit",
    fontSize: 13,
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 12px" }}>Add source</h3>
        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 13 }}>
          <label>
            <input
              type="radio"
              checked={mode === "direct"}
              onChange={() => setMode("direct")}
            />{" "}
            MotherDuck table
          </label>
          <label>
            <input
              type="radio"
              checked={mode === "query"}
              onChange={() => setMode("query")}
            />{" "}
            SQL query
          </label>
        </div>
        {mode === "direct" ? (
          <input
            value={tableRef}
            onChange={(e) => setTableRef(e.target.value)}
            placeholder="db.schema.table"
            style={inputStyle}
          />
        ) : (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Source name (used as the tab/storage key)"
              style={inputStyle}
            />
            <textarea
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              rows={5}
              style={{ ...inputStyle, fontFamily: "monospace" }}
            />
          </>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={handleProbe} disabled={probing || creating}>
            {probing ? "Probing…" : "Probe columns"}
          </button>
        </div>
        {columns.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
              Pick primary-key column(s) — highest-cardinality pre-selected
            </div>
            <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #eee", padding: 6 }}>
              {columns.map((c) => (
                <label key={c} style={{ display: "block", fontSize: 13, padding: "2px 0" }}>
                  <input
                    type="checkbox"
                    checked={pkColumns.includes(c)}
                    onChange={(e) => {
                      setPkColumns((prev) =>
                        e.target.checked
                          ? [...prev, c]
                          : prev.filter((x) => x !== c),
                      );
                    }}
                  />{" "}
                  {c}{" "}
                  <span style={{ color: "#888" }}>
                    (≈{ndv[c] ?? "?"} distinct)
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        {probeErr && (
          <div
            style={{
              color: "#bc1200",
              marginBottom: 8,
              fontSize: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {probeErr}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || columns.length === 0}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- dive component ----------
export default function UniverDive() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const univerRef = useRef<any>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [bootMessage, setBootMessage] = useState("Loading runtime…");
  const [fatalError, setFatalError] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [univerReady, setUniverReady] = useState(false);
  const { run: runSql } = useImperativeSql();

  // Expose a toast setter on window so non-React event handlers inside
  // initUniver (which runs outside the React tree) can surface messages.
  useEffect(() => {
    (window as any).__univerDiveToast = setToast;
    return () => {
      if ((window as any).__univerDiveToast === setToast) {
        (window as any).__univerDiveToast = undefined;
      }
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreateSource = async (meta: SourceMeta) => {
    const api = univerRef.current?.api;
    if (!api) throw new Error("Univer not ready yet");
    const tableId = await addTableToSheet(api, runSql, meta);
    const reg = readSourcesRegistry();
    reg[tableId] = meta;
    writeSourcesRegistry(reg);
    // Seed an empty edit store so debug inspection has a clear shape.
    if (!localStorage.getItem(EDITS_KEY_PREFIX + meta.storageKey)) {
      writeEditStore(meta.storageKey, emptyEditStore());
    }
  };

  const handleRefreshAll = async () => {
    const api = univerRef.current?.api;
    if (!api) return;
    setRefreshing(true);
    try {
      await refreshAllSources(api, runSql);
      setToast("Sources refreshed");
    } catch (e: any) {
      setToast(String(e?.message ?? e));
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh bound sources once the workbook + SQL runner are both ready.
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (didAutoRefresh.current) return;
    if (!univerReady) return;
    if (Object.keys(readSourcesRegistry()).length === 0) return;
    didAutoRefresh.current = true;
    handleRefreshAll();
  }, [univerReady]);

  const hasSaved = typeof localStorage !== "undefined" && !!localStorage.getItem(STORAGE_KEY);
  const query = useSQLQuery(DEFAULT_QUERY, { enabled: !hasSaved });

  // If the MotherDuck connection or query hangs (bad token, sandbox restrictions,
  // worker blocked), we still want to show an empty grid after a short timeout
  // instead of staring at "Loading data…" forever.
  const [queryTimedOut, setQueryTimedOut] = useState(false);
  useEffect(() => {
    if (hasSaved) return;
    if (!query.isLoading) return;
    const t = setTimeout(() => setQueryTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [hasSaved, query.isLoading]);

  // step 1: load univer runtime
  useEffect(() => {
    let alive = true;
    loadUniverRuntime()
      .then(() => {
        if (alive) setRuntimeReady(true);
      })
      .catch((e: any) => {
        if (!alive) return;
        console.error("[UniverDive] runtime load failed", e);
        setFatalError(String(e?.stack ?? e?.message ?? e));
      });
    return () => {
      alive = false;
    };
  }, []);

  // step 2: once runtime + data are ready, create the unit
  useEffect(() => {
    if (!runtimeReady || !containerRef.current || univerRef.current) return;

    let snapshot: any = null;
    const saved =
      typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      try {
        snapshot = JSON.parse(saved);
      } catch (e) {
        console.warn("[UniverDive] bad saved snapshot, dropping", e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    if (!snapshot) {
      if (query.isLoading && !queryTimedOut) {
        setBootMessage("Loading data from MotherDuck…");
        return;
      }
      if (queryTimedOut) {
        console.warn(
          "[UniverDive] MotherDuck query did not resolve in 8s; rendering empty sheet.",
        );
      }
      // Non-fatal: if the query errored (bad token, sandbox timing out, etc.)
      // we still want the spreadsheet to render — just with an empty sheet.
      // The user can paste data in or retry via devtools.
      if (query.isError) {
        console.warn(
          "[UniverDive] MotherDuck query failed; rendering empty sheet:",
          query.error?.message ?? query.error,
        );
      }
      const rows = Array.isArray(query.data) ? (query.data as Row[]) : [];
      snapshot = buildSnapshot(rows);
    }

    try {
      initUniver(snapshot);
    } catch (e: any) {
      console.error("[UniverDive] init failed", e);
      setFatalError(String(e?.stack ?? e?.message ?? e));
    }
  }, [runtimeReady, query.data, query.isLoading, query.isError, queryTimedOut]);

  function initUniver(snapshot: any) {
    const g: any = window;
    const { Univer, LocaleType, mergeLocales, UniverInstanceType } = g.UniverCore;
    const { FUniver } = g.UniverCoreFacade;
    const { UniverRenderEnginePlugin } = g.UniverEngineRender;
    const { UniverFormulaEnginePlugin } = g.UniverEngineFormula;
    const { UniverUIPlugin } = g.UniverUi;
    const { UniverDocsPlugin } = g.UniverDocs;
    const { UniverDocsUIPlugin } = g.UniverDocsUi;
    const { UniverSheetsPlugin } = g.UniverSheets;
    const { UniverSheetsUIPlugin } = g.UniverSheetsUi;
    const { UniverSheetsFormulaPlugin } = g.UniverSheetsFormula;
    const { UniverSheetsFormulaUIPlugin } = g.UniverSheetsFormulaUi;
    const { UniverSheetsNumfmtPlugin } = g.UniverSheetsNumfmt;
    const { UniverSheetsNumfmtUIPlugin } = g.UniverSheetsNumfmtUi;
    const { UniverSheetsFilterPlugin } = g.UniverSheetsFilter;
    const { UniverSheetsFilterUIPlugin } = g.UniverSheetsFilterUi;
    const { UniverSheetsSortPlugin } = g.UniverSheetsSort;
    const { UniverSheetsSortUIPlugin } = g.UniverSheetsSortUi;
    const { UniverSheetsZenEditorPlugin } = g.UniverSheetsZenEditor;
    const { UniverDataValidationPlugin } = g.UniverDataValidation;
    const { UniverSheetsDataValidationPlugin } = g.UniverSheetsDataValidation;
    const { UniverSheetsDataValidationUIPlugin } = g.UniverSheetsDataValidationUi;
    const { UniverSheetsConditionalFormattingPlugin } = g.UniverSheetsConditionalFormatting;
    const { UniverSheetsConditionalFormattingUIPlugin } = g.UniverSheetsConditionalFormattingUi;
    const { UniverSheetsTablePlugin } = g.UniverSheetsTable;
    const { UniverSheetsTableUIPlugin } = g.UniverSheetsTableUi;

    const univer = new Univer({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales(
          g.UniverDesignEnUS,
          g.UniverUiEnUS,
          g.UniverDocsUiEnUS,
          g.UniverSheetsEnUS,
          g.UniverSheetsUiEnUS,
          g.UniverSheetsFormulaUiEnUS,
          g.UniverSheetsNumfmtUiEnUS,
          g.UniverSheetsFilterUiEnUS,
          g.UniverSheetsSortUiEnUS,
          g.UniverSheetsZenEditorEnUS,
          g.UniverSheetsDataValidationUiEnUS,
          g.UniverSheetsConditionalFormattingUiEnUS,
          g.UniverSheetsTableUiEnUS,
        ),
      },
    });

    univer.registerPlugin(UniverRenderEnginePlugin);
    univer.registerPlugin(UniverFormulaEnginePlugin);
    univer.registerPlugin(UniverUIPlugin, { container: containerRef.current! });
    univer.registerPlugin(UniverDocsPlugin);
    univer.registerPlugin(UniverDocsUIPlugin);
    univer.registerPlugin(UniverSheetsPlugin);
    univer.registerPlugin(UniverSheetsUIPlugin);
    univer.registerPlugin(UniverSheetsFormulaPlugin);
    univer.registerPlugin(UniverSheetsFormulaUIPlugin);
    univer.registerPlugin(UniverSheetsNumfmtPlugin);
    univer.registerPlugin(UniverSheetsNumfmtUIPlugin);
    // Filter: adds the funnel icon to the toolbar (Start tab) so users can
    // toggle auto-filter on/off on the current selection.
    univer.registerPlugin(UniverSheetsFilterPlugin);
    univer.registerPlugin(UniverSheetsFilterUIPlugin, {
      // Avoid the RPC worker for computing distinct filter values — we don't
      // run a worker in this dive.
      useRemoteFilterValuesGenerator: false,
    });
    // Sort: adds ascending/descending toolbar buttons + a multi-key sort dialog.
    univer.registerPlugin(UniverSheetsSortPlugin);
    univer.registerPlugin(UniverSheetsSortUIPlugin);
    // Zen editor: full-screen single-cell editor (double-click / expand action).
    univer.registerPlugin(UniverSheetsZenEditorPlugin);
    // Data validation: dropdown lists, number/date ranges, checkboxes, custom
    // formula rules. The base package is the shared substrate; sheets-*
    // specializes it and the UI plugin provides the dialogs and cell overlays.
    univer.registerPlugin(UniverDataValidationPlugin);
    univer.registerPlugin(UniverSheetsDataValidationPlugin);
    univer.registerPlugin(UniverSheetsDataValidationUIPlugin);
    // Conditional formatting: color scales, data bars, icon sets, highlight
    // rules with a manager dialog in the Start tab.
    univer.registerPlugin(UniverSheetsConditionalFormattingPlugin);
    univer.registerPlugin(UniverSheetsConditionalFormattingUIPlugin);
    // Table: convert a range into a named table with headers, filters, totals
    // row, and stable tableId. Per-source binding metadata lives on the table's
    // `meta` field so we can route edits to MotherDuck writes or overlays.
    univer.registerPlugin(UniverSheetsTablePlugin);
    univer.registerPlugin(UniverSheetsTableUIPlugin);

    univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot);
    const api = FUniver.newAPI(univer);

    // Persist on every workbook-mutating command. Debounced so rapid typing
    // doesn't thrash localStorage.
    let saveTimer: any = null;
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if ((window as any).__UNIVER_DISABLE_AUTOSAVE__) return;
        try {
          const wb = api.getActiveWorkbook?.();
          if (!wb) return;
          const snap = wb.save();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
        } catch (e) {
          console.warn("[UniverDive] persist failed", e);
        }
      }, 250);
    };

    // Only MUTATION events change workbook state worth persisting. OPERATION
    // events (scroll, selection, sidebar) don't. COMMAND events fire the
    // underlying MUTATIONs, so listening on MUTATION alone is enough.
    // CommandType enum: 0 = COMMAND, 1 = OPERATION, 2 = MUTATION.
    try {
      api.addEvent(api.Event.CommandExecuted, (ev: any) => {
        if (ev?.type !== 2) return;
        scheduleSave();
        if (ev.id === "sheet.mutation.set-range-values") {
          handleCellMutation(api, ev.params);
        }
      });
    } catch (e) {
      console.warn("[UniverDive] event subscribe failed; falling back to interval", e);
      setInterval(scheduleSave, 1500);
    }

    try {
      api.addEvent(api.Event.BeforeCommandExecute, (ev: any) => {
        if (
          ev.id !== "sheet.command.set-range-values" &&
          ev.id !== "sheet.mutation.set-range-values"
        ) {
          return;
        }
        const reason = vetoIfPkIncomplete(api, ev.params);
        if (reason) {
          ev.cancel = true;
          const toast = (window as any).__univerDiveToast;
          if (typeof toast === "function") toast(reason);
          console.warn("[dive:edit-rejected]", reason);
        }
      });
    } catch (e) {
      console.warn("[UniverDive] before-event subscribe failed", e);
    }

    univerRef.current = { univer, api, saveTimer };
    g.univer = univer;
    g.univerAPI = api;
    setBootMessage("");
    setUniverReady(true);
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        background: "#f8f8f8",
      }}
    >
      {fatalError ? (
        <div
          className="flex items-start gap-2 p-4"
          style={{ color: "#bc1200" }}
        >
          <AlertCircle size={16} />
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12,
              margin: 0,
              maxHeight: "40vh",
              overflow: "auto",
            }}
          >
            {fatalError}
          </pre>
        </div>
      ) : bootMessage ? (
        <div
          className="flex items-center gap-2 p-3"
          style={{ color: "#6a6a6a" }}
        >
          <Loader2 className="animate-spin" size={14} /> {bootMessage}
        </div>
      ) : null}
      <div
        ref={containerRef}
        data-testid="univer-container"
        style={{ flex: 1, minHeight: 0, position: "relative" }}
      />
      {runtimeReady && !fatalError && (
        // Overlay sibling of the container — children inside the container
        // get wiped by Univer on mount, so render buttons outside of it.
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            zIndex: 10,
            display: "flex",
            gap: 6,
          }}
        >
          <button
            onClick={handleRefreshAll}
            disabled={refreshing || !univerReady}
            data-testid="refresh-sources-button"
            style={{
              padding: "4px 10px",
              background: "#e9edff",
              color: "#2d6cdf",
              border: "1px solid #2d6cdf",
              borderRadius: 4,
              cursor: refreshing ? "wait" : "pointer",
              fontSize: 12,
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={() => setModalOpen(true)}
            data-testid="add-source-button"
            style={{
              padding: "4px 10px",
              background: "#2d6cdf",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            + Add source
          </button>
        </div>
      )}
      <AddSourceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateSource}
        runSql={runSql}
        canQuery={univerReady}
      />
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#2a2a2a",
            color: "white",
            padding: "8px 14px",
            borderRadius: 4,
            fontSize: 13,
            zIndex: 10001,
            maxWidth: "90vw",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

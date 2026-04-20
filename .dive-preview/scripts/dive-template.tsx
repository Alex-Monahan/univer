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
import { useEffect, useRef, useState } from "react";
import { useSQLQuery } from "@motherduck/react-sql-query";
import { Loader2, AlertCircle } from "lucide-react";

// ---------- inlined univer code (readable) ----------
const UNIVER_SCRIPTS: string[] = /* __UNIVER_SCRIPTS__ */ [];
const UNIVER_FACADES: string[] = /* __UNIVER_FACADES__ */ [];
const CSS_FILES: string[] = /* __CSS_FILES__ */ [];

// ---------- inlined deps & locales (gzip+base64) ----------
const DEP_BLOB: string = /* __DEP_BLOB__ */ "";
const LOCALE_BLOB: string = /* __LOCALE_BLOB__ */ "";

// ---------- dive config ----------
const STORAGE_KEY = "univer-dive-workbook-v1";

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

// ---------- dive component ----------
export default function UniverDive() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const univerRef = useRef<any>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [bootMessage, setBootMessage] = useState("Loading runtime…");
  const [fatalError, setFatalError] = useState<string>("");

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
        if (ev?.type === 2) scheduleSave();
      });
    } catch (e) {
      console.warn("[UniverDive] event subscribe failed; falling back to interval", e);
      setInterval(scheduleSave, 1500);
    }

    univerRef.current = { univer, api, saveTimer };
    g.univer = univer;
    g.univerAPI = api;
    setBootMessage("");
  }

  return (
    <div
      style={{
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
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { Switch } from '../components/Switch';
import {
  DELIMITER_OPTIONS,
  ROLE_OPTIONS,
  columnCount,
  fitColumns,
  hasEnAndJa,
  initialColumns,
  initialOptions,
  parseDelimited,
  stripBom,
  type ImportOptions,
  type ImportSettings,
} from '../../app/csv';
import type { ImportColumnRole, ImportDelimiter } from '../../domain/types';

interface Props {
  fileName: string;
  text: string;
  saved: ImportSettings;
  busy: boolean;
  onImport: (options: ImportOptions) => void;
  onCancel: () => void;
}

const PREVIEW_ROWS = 5;

/** <option value> に制御文字を入れないためのキー */
const DELIMITER_KEYS: Record<ImportDelimiter, string> = { ',': 'comma', '\t': 'tab', ';': 'semicolon' };
const keyToDelimiter = (key: string): ImportDelimiter =>
  (Object.keys(DELIMITER_KEYS) as ImportDelimiter[]).find((d) => DELIMITER_KEYS[d] === key) ?? ',';

/** CSV / TSV 取込画面（10-3）。ファイルを選んだ後に単語一覧の代わりに表示する */
export function ImportScreen({ fileName, text, saved, busy, onImport, onCancel }: Props) {
  const body = useMemo(() => stripBom(text), [text]);
  const [options, setOptions] = useState<ImportOptions>(() => initialOptions(text, saved));
  const records = useMemo(() => parseDelimited(body, options.delimiter), [body, options.delimiter]);
  const count = columnCount(records);
  const columns = fitColumns(options.columns, count);
  const dataRows = Math.max(0, records.length - (options.hasHeader ? 1 : 0));
  const valid = hasEnAndJa(columns) && dataRows > 0;

  const setDelimiter = (delimiter: ImportDelimiter) => {
    const recs = parseDelimited(body, delimiter);
    setOptions((o) => ({ ...o, delimiter, columns: initialColumns(recs, o.hasHeader, saved.importColumns) }));
  };
  const setHasHeader = (hasHeader: boolean) =>
    setOptions((o) => ({ ...o, hasHeader, columns: initialColumns(records, hasHeader, saved.importColumns) }));
  /** 同じ役割（使わない以外）は 1 列だけ。他の列に付いていれば「使わない」に戻す */
  const setRole = (index: number, role: ImportColumnRole) =>
    setOptions((o) => ({
      ...o,
      columns: fitColumns(o.columns, count).map((r, i) => (i === index ? role : role !== 'skip' && r === role ? 'skip' : r)),
    }));

  return (
    <div className="screen has-fixed-bottom">
      <Header
        title="CSV/TSV を取り込む"
        left={
          <button type="button" className="btn-text" onClick={onCancel} disabled={busy}>
            キャンセル
          </button>
        }
      />

      <div className="small muted">
        {fileName} ・ {dataRows}行{options.hasHeader ? '（見出しを除く）' : ''}
      </div>

      {records.length === 0 ? (
        <div className="notice center muted" role="status">
          ファイルが空です
        </div>
      ) : (
        <div className="table-wrap">
          <table className="preview-table" data-testid="import-preview">
            <thead>
              <tr>
                {columns.map((role, i) => (
                  <th key={i}>
                    <select
                      aria-label={`${i + 1}列目の割り当て`}
                      value={role}
                      onChange={(e) => setRole(i, e.target.value as ImportColumnRole)}
                      data-testid={`column-${i}`}
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.slice(0, PREVIEW_ROWS).map((rec, ri) => (
                <tr key={ri} className={options.hasHeader && ri === 0 ? 'header-row' : undefined}>
                  {columns.map((_, ci) => (
                    <td key={ci}>{rec[ci] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label className="setting-row">
          <span>区切り文字</span>
          <select value={DELIMITER_KEYS[options.delimiter]} onChange={(e) => setDelimiter(keyToDelimiter(e.target.value))} data-testid="delimiter">
            {DELIMITER_OPTIONS.map((o) => (
              <option key={o.value} value={DELIMITER_KEYS[o.value]}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="setting-row">
          <span>1行目は見出し</span>
          <Switch checked={options.hasHeader} onChange={setHasHeader} label="1行目は見出し" />
        </div>
      </div>

      {!valid && records.length > 0 && (
        <p className="small muted center" style={{ margin: 0 }}>
          英単語と日本語訳の列を1つずつ選んでください
        </p>
      )}

      <div className="fixed-bottom">
        <button type="button" className="btn-primary" disabled={!valid || busy} onClick={() => onImport({ ...options, columns })} data-testid="import-run">
          取り込む
        </button>
      </div>
    </div>
  );
}

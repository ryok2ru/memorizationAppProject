import { useEffect, useRef, useState } from 'react';
import { syncModal, useCloseOnOutside } from './modal';
import { useSheetDrag } from './sheetDrag';
import { errorMessage } from '../hooks';
import { LIMITS } from '../../domain/types';
import { symbolDirection, type LinkDirection } from '../../domain/relations';
import { editLink, type RelationRow } from '../../app/relations';

/** 向きの 3 択（7-12-2）。表示中の項目から見た向き */
export const DIRECTION_LABELS: Record<LinkDirection, string> = { none: '— なし', out: '→ 相手へ', in: '← 相手から' };

interface LinkFieldsProps {
  dir: LinkDirection;
  label: string;
  suggestions: string[];
  onDir: (d: LinkDirection) => void;
  onLabel: (l: string) => void;
}

/** 連結の向きとラベル（7-12-2 の次の段と 7-12-3 で共通）。ラベルは 20 文字まで、下に候補を並べる */
export function LinkFields({ dir, label, suggestions, onDir, onLabel }: LinkFieldsProps) {
  return (
    <>
      <div className="segmented" role="group" aria-label="向き" data-testid="link-direction">
        {(['none', 'out', 'in'] as LinkDirection[]).map((d) => (
          <button key={d} type="button" aria-pressed={dir === d} onClick={() => onDir(d)}>
            {DIRECTION_LABELS[d]}
          </button>
        ))}
      </div>
      <label className="field">
        <span>ラベル（任意）</span>
        <input type="text" value={label} maxLength={LIMITS.edgeLabel} onChange={(e) => onLabel(e.target.value)} placeholder="例: 対義" data-testid="link-label" />
      </label>
      {suggestions.length > 0 && (
        <div className="label-suggestions" aria-label="ラベルの候補">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => onLabel(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

interface Props {
  /** 表示中の項目の id。向きはこの項目から見たもの */
  selfId: string;
  row: RelationRow | null;
  suggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}

/** 連結の編集シート（7-12-3）。向きとラベルを直して保存する */
export function EditLinkSheet({ selfId, row, suggestions, onClose, onSaved }: Props) {
  const open = row != null;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => syncModal(ref.current, open), [open]);
  const outside = useCloseOnOutside(onClose);
  const drag = useSheetDrag(ref, open, onClose);
  const [dir, setDir] = useState<LinkDirection>('none');
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setDir(symbolDirection(row.entry.symbol ?? '—'));
    setLabel(row.entry.edge.label);
    setMessage(null);
  }, [row]);

  const onSave = async () => {
    if (!row) return;
    try {
      await editLink(row.entry.edge, selfId, dir, label);
      onSaved();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  return (
    <dialog
      className={`sheet${drag.sliding ? ' sheet-slide' : ''}`}
      ref={ref}
      style={drag.style}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      {...outside}
      aria-labelledby="edit-link-title"
      data-testid="edit-link-sheet"
    >
      <h2 id="edit-link-title" className="sheet-handle" {...drag.handleProps}>
        {row ? `「${row.item.name}」との連結を編集` : ''}
      </h2>
      <div className="sheet-body">
        <LinkFields dir={dir} label={label} suggestions={suggestions} onDir={setDir} onLabel={setLabel} />
        {message && <p className="error">{message}</p>}
      </div>
      <div className="btn-row">
        <button type="button" className="btn-primary" onClick={() => void onSave()}>
          保存
        </button>
      </div>
    </dialog>
  );
}

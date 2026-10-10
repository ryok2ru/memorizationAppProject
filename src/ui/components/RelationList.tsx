import type { Section } from '../../domain/relations';
import { showFolderName, type ItemRef, type RelationRow, type RelationView } from '../../app/relations';

/** 区分の見出し（7-12） */
export const SECTION_TITLES: Record<Section, string> = { parents: '↑ 上位', children: '↓ 下位', links: '↔ 連結' };

/** 「＋」で開く追加ダイアログの見出し（7-12-2） */
export const ADD_TITLES: Record<Section, string> = { parents: '上位を追加', children: '下位を追加', links: '連結を追加' };

interface Props {
  self: ItemRef;
  view: RelationView;
  /** view = 通常、edit = 関係の編集、readonly = ポップアップ（閲覧のみ。7-14） */
  mode: 'view' | 'edit' | 'readonly';
  onOpen?: (row: RelationRow) => void;
  onAdd?: (section: Section) => void;
  onRemove?: (row: RelationRow) => void;
  onEditLink?: (row: RelationRow) => void;
}

/** 関係側の区分と行（7-12。カード詳細画面とポップアップで共通） */
export function RelationList({ self, view, mode, onOpen, onAdd, onRemove, onEditLink }: Props) {
  const sections: [Section, RelationRow[]][] = [
    ['parents', view.parents],
    ['children', view.children],
    ['links', view.links],
  ];
  return (
    <div className="relation-list" data-testid="relation-list">
      {sections.map(([section, rows]) => (
        <section key={section} className="relation-section" aria-label={SECTION_TITLES[section]}>
          <div className="relation-head">
            <h2>{SECTION_TITLES[section]}</h2>
            {mode === 'view' && onAdd && (
              <button type="button" className="btn-icon relation-add" aria-label={ADD_TITLES[section]} onClick={() => onAdd(section)} data-testid={`add-${section}`}>
                ＋
              </button>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="small muted relation-none">なし</p>
          ) : (
            <ul className="relation-rows">
              {rows.map((row, i) => (
                <li key={row.entry.edge.id} className="relation-row">
                  {mode === 'edit' && (
                    <button type="button" className="relation-remove" aria-label={`${row.item.name} との関係を削除`} onClick={() => onRemove?.(row)}>
                      ⊖
                    </button>
                  )}
                  <RowBody self={self} row={row} last={i === rows.length - 1} mode={mode} onOpen={onOpen} />
                  {mode === 'edit' && section === 'links' && (
                    <button type="button" className="relation-pencil" aria-label={`${row.item.name} との連結を編集`} onClick={() => onEditLink?.(row)}>
                      ✎
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function RowBody({
  self,
  row,
  last,
  mode,
  onOpen,
}: {
  self: ItemRef;
  row: RelationRow;
  last: boolean;
  mode: Props['mode'];
  onOpen?: (row: RelationRow) => void;
}) {
  const { entry, item } = row;
  // 階層は木の記号（区分の最後の行は └）、連結は — → ←（7-12）
  const mark = entry.section === 'links' ? entry.symbol : last ? '└' : '├';
  const content = (
    <>
      <span className="relation-mark" aria-hidden="true">
        {mark}
      </span>
      <span className={`relation-name${item.kind === 'node' ? ' is-node' : ''}`}>{item.name}</span>
      {item.kind === 'node' && <span className="relation-tag">ノード</span>}
      {showFolderName(self, item) && <span className="relation-tag">{item.folderName}</span>}
      {entry.edge.label && <span className="relation-label">{entry.edge.label}</span>}
    </>
  );
  if (mode === 'view' && onOpen) {
    return (
      <button type="button" className="relation-body" onClick={() => onOpen(row)}>
        {content}
      </button>
    );
  }
  return <div className="relation-body">{content}</div>;
}

export type DetailTab = 'main' | 'relations';

interface Props {
  /** 「カード」か「ノード」 */
  mainLabel: string;
  relationCount: number;
  value: DetailTab;
  onChange: (tab: DetailTab) => void;
  /** 編集モード中は押せない（7-12） */
  disabled?: boolean;
}

/** カード詳細画面とポップアップの「カード／関係」の切り替え（7-12、7-14）。見た目は単語一覧のフィルターと同じ */
export function DetailTabs({ mainLabel, relationCount, value, onChange, disabled = false }: Props) {
  return (
    <div className="segmented" role="group" aria-label="表示の切り替え" data-testid="detail-tabs">
      <button type="button" aria-pressed={value === 'main'} disabled={disabled} onClick={() => onChange('main')}>
        {mainLabel}
      </button>
      <button type="button" aria-pressed={value === 'relations'} disabled={disabled} onClick={() => onChange('relations')}>
        関係 {relationCount}
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { syncModal, useCloseOnOutside } from './modal';
import { DetailTabs, type DetailTab } from './DetailTabs';
import { RelationList } from './RelationList';
import { useWordImage } from '../hooks';
import { getWord, listFolders } from '../../db/repo';
import { cardRef, loadRelationView, type ItemRef, type RelationView } from '../../app/relations';
import type { Word } from '../../domain/types';

interface Props {
  /** 開くカード。null で閉じる */
  wordId: string | null;
  onClose: () => void;
}

/**
 * カードのポップアップ（7-14）。結果画面の「評価したカード」の行から開く、閲覧のみの中央のダイアログ。
 * 上部の「カード／関係」の切り替えは固定し、中身だけがダイアログの中でスクロールする
 */
export function CardPopup({ wordId, onClose }: Props) {
  const [loaded, setLoaded] = useState<{ word: Word; self: ItemRef; view: RelationView } | null>(null);
  const [tab, setTab] = useState<DetailTab>('main');
  const open = wordId != null && loaded != null && loaded.word.id === wordId;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => syncModal(ref.current, open), [open]);
  const outside = useCloseOnOutside(onClose);
  const image = useWordImage(open ? wordId : undefined);

  useEffect(() => {
    if (!wordId) return undefined;
    let alive = true;
    setTab('main'); // 開くたびに「カード」から始める
    void Promise.all([getWord(wordId), listFolders(), loadRelationView(wordId)]).then(([word, folders, view]) => {
      if (!alive) return;
      // 結果画面を開いている間にカードが削除・ノード化されていたら何も出さない
      if (!word) {
        onClose();
        return;
      }
      setLoaded({ word, self: cardRef(word, new Map(folders.map((f) => [f.id, f]))), view });
    });
    return () => {
      alive = false;
    };
  }, [wordId, onClose]);

  return (
    <dialog
      ref={ref}
      className="card-popup"
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      {...outside}
      aria-label="カード"
      data-testid="card-popup"
    >
      {loaded && (
        <>
          <div className="card-popup-head">
            <DetailTabs mainLabel="カード" relationCount={loaded.view.count} value={tab} onChange={setTab} />
            <button type="button" className="btn-icon" aria-label="閉じる" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="card-popup-body">
            {tab === 'main' ? (
              <div className="detail-card">
                <div className="detail-front">{loaded.word.englishTerm}</div>
                <div className="detail-back">{loaded.word.japaneseDefinition}</div>
                {image && <img className="card-image" src={image.url} alt="" draggable={false} />}
                {loaded.word.memo && (
                  <div className="detail-memo">
                    <h3>メモ</h3>
                    <p>{loaded.word.memo}</p>
                  </div>
                )}
              </div>
            ) : loaded.view.count === 0 ? (
              <p className="muted">関係はありません</p>
            ) : (
              <RelationList self={loaded.self} view={loaded.view} mode="readonly" />
            )}
          </div>
        </>
      )}
    </dialog>
  );
}

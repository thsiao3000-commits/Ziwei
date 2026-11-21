import { useState } from 'react';
import { TermButton, TermNote } from '../glossary/TermNote';
import { Star } from './ChartBoard';
import { MUTAGENS, type ChartData, type PalaceInfo } from './types';

type Pick = (name: string) => void;

function StarRow({ title, palace, kind, onPick }: { title: string; palace: PalaceInfo; kind: 'majorStars' | 'minorStars' | 'adjectiveStars'; onPick: Pick }) {
  const stars = palace[kind];
  return (
    <div className="grid grid-cols-[6em_1fr] gap-x-3">
      <dt className="text-ink-muted">{title}</dt>
      <dd className="detail-stars flex flex-wrap items-baseline gap-x-3 gap-y-1 font-kai">
        {stars.length > 0 ? (
          stars.map((star) => (
            <TermButton key={star.name} name={star.name} onPick={onPick}>
              <Star star={star} />
            </TermButton>
          ))
        ) : (
          <span className="text-ink-muted">無</span>
        )}
      </dd>
    </div>
  );
}

function Row({ title, term, onPick, children }: { title: string; term?: string; onPick: Pick; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6em_1fr] gap-x-3">
      <dt className="text-ink-muted">{term ? <TermButton name={term} onPick={onPick}>{title}</TermButton> : title}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function majorNames(palace: PalaceInfo | undefined): string {
  if (!palace) return '';
  return palace.majorStars.length > 0 ? palace.majorStars.map((star) => star.name).join('、') : '空宮';
}

type Props = {
  chart: ChartData;
  palace: PalaceInfo;
  onClose: () => void;
  headingId: string;
  /** 有設定金鑰且沒有回覆在產生時才提供 */
  onInterpret?: (() => void) | undefined;
};

/** 宮位詳情：完整星曜、三方四正、宮干飛化。桌機放側欄，手機放底部抽屜。 */
export function PalaceDetail({ chart, palace, onClose, headingId, onInterpret }: Props) {
  const around = [
    { role: '對宮', palace: chart.palaces[palace.surrounded.opposite] },
    { role: '財帛位', palace: chart.palaces[palace.surrounded.wealth] },
    { role: '官祿位', palace: chart.palaces[palace.surrounded.career] },
  ];
  const tags = [
    palace.isBodyPalace ? '身宮' : null,
    palace.isOriginalPalace ? '來因宮' : null,
    palace.isEmpty ? '空宮' : null,
  ].filter((tag): tag is string => tag !== null);

  // 點了哪個名詞，就地顯示它的說明。
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="text-[0.9375rem] leading-[1.8]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-[1.5rem]">
            <TermButton name={palace.name} onPick={setPicked}>
              {palace.name}
            </TermButton>
          </h2>
          <p className="font-kai text-ink-muted">
            {palace.stem}
            {palace.branch}
            {tags.length > 0 && `　${tags.join('、')}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-control border border-line px-3 py-1 font-kai text-ink"
        >
          關閉
        </button>
      </div>

      {onInterpret && (
        <p className="mt-3">
          <button type="button" onClick={onInterpret} className="rounded-control bg-accent px-4 py-2 font-kai font-bold text-accent-ink">
            解讀這個宮位
          </button>
        </p>
      )}

      <p className="mt-2 text-sm text-ink-muted">有虛線底線的名詞可以點，會在這裡顯示白話說明。</p>
      {picked && <TermNote name={picked} onClose={() => setPicked(null)} />}

      {palace.isEmpty && (
        <p className="mt-3 max-w-[34em] border-l-2 border-line pl-3">
          這一宮沒有主星（空宮）。一般會借對宮{around[0]?.palace?.name}的主星來看：
          <span className="font-kai">{majorNames(around[0]?.palace)}</span>。借來的星力量較弱，仍以本宮的輔星與四化為主。
        </p>
      )}

      <dl className="mt-4 grid gap-2">
        <StarRow title="主星" palace={palace} kind="majorStars" onPick={setPicked} />
        <StarRow title="輔星" palace={palace} kind="minorStars" onPick={setPicked} />
        <StarRow title="雜曜" palace={palace} kind="adjectiveStars" onPick={setPicked} />
        <Row title="大限" term="大限" onPick={setPicked}>
          {palace.decadalRange[0]}–{palace.decadalRange[1]} 歲
        </Row>
        <Row title="小限" term="小限" onPick={setPicked}>{palace.ages.join('、')} 歲</Row>
        <Row title="長生十二神" term="長生十二神" onPick={setPicked}>{palace.changsheng12}</Row>
        <Row title="博士十二神" term="博士十二神" onPick={setPicked}>{palace.boshi12}</Row>
        <Row title="歲前與將前" term="歲前十二神" onPick={setPicked}>
          {palace.suiqian12}、{palace.jiangqian12}
        </Row>
      </dl>

      <h3 className="mt-6 text-[1.125rem]">
        <TermButton name="三方四正" onPick={setPicked} />
      </h3>
      <ul className="mt-2 grid gap-1">
        {around.map(({ role, palace: other }) => (
          <li key={role} className="grid grid-cols-[6em_1fr] gap-x-3">
            <span className="text-ink-muted">{role}</span>
            <span className="font-kai">
              {other?.name}（{other?.branch}）　{majorNames(other)}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-[1.125rem]">
        <TermButton name="宮干飛化" onPick={setPicked} />
      </h3>
      <p className="mt-1 text-ink-muted">以這一宮的宮干「{palace.stem}」起四化，各飛入：</p>
      <ul className="mt-2 grid gap-1">
        {MUTAGENS.map((mutagen) => {
          const targetIndex = palace.flies[mutagen];
          const target = targetIndex === null ? undefined : chart.palaces[targetIndex];
          return (
            <li key={mutagen} className="grid grid-cols-[6em_1fr] gap-x-3">
              <span className="text-ink-muted">化{mutagen}</span>
              <span className="font-kai">
                {target ? `${target.name}（${target.branch}）` : '無'}
                {targetIndex === palace.index && '　自化'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

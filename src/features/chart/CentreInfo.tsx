import { formatSolarDate } from './layout';
import type { ChartData } from './types';

/** 中宮：稱呼、性別、生日、四柱、五行局、命主、身主。 */
export function CentreInfo({ chart, name }: { chart: ChartData; name: string }) {
  return (
    <div className="centre-info">
      <p className="text-[1.0625em] font-bold">
        {name}
        <span className="ml-2 font-normal">{chart.gender === 'male' ? '男' : '女'}</span>
      </p>
      <p>國曆 {formatSolarDate(chart.solarDate)}</p>
      <p>農曆 {chart.lunarDate}</p>
      <p>
        {chart.time}　{chart.fiveElementsClass}
      </p>
      <p>{chart.fourPillars}</p>
      <p>
        命主 {chart.soul}　身主 {chart.body}
      </p>
    </div>
  );
}

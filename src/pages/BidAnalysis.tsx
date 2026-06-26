import { useState, useMemo, useEffect, useCallback } from 'react';
import { bulkBidAnalysis, getNaverAdSettings, FullKeywordData } from '../services/api';

interface BidAnalysisProps {
  onOpenSettings?: () => void;
}

// 줄바꿈/쉼표로 구분된 키워드 파싱 (중복 제거, 순서 유지)
function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const kw = raw.trim();
    if (kw && !seen.has(kw)) {
      seen.add(kw);
      out.push(kw);
    }
  }
  return out;
}

const won = (n: number) => Math.round(n).toLocaleString('ko-KR') + '원';
const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('ko-KR');
const pct = (n: number | null | undefined) => (n ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '%';

// 순위 번호 뱃지 색상 (레퍼런스: 1위 빨강, 2위 주황, 3위 노랑, 4/5위 회색)
const rankBadge = (rank: number) => {
  switch (rank) {
    case 1: return 'bg-red-500 text-white';
    case 2: return 'bg-orange-500 text-white';
    case 3: return 'bg-yellow-400 text-gray-900';
    default: return 'bg-gray-400 text-white';
  }
};

const gradeStyle: Record<string, string> = {
  'A+': 'bg-green-500/20 text-green-500 border-green-500/40',
  'A': 'bg-lime-500/20 text-lime-600 dark:text-lime-400 border-lime-500/40',
  'B': 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/40',
  'C': 'bg-orange-500/20 text-orange-500 border-orange-500/40',
  'D': 'bg-red-500/20 text-red-400 border-red-500/40',
  '-': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

interface AnalyzedRow {
  data: FullKeywordData;
  pcClicks: number;   // 월 예상 클릭 (PC)
  moClicks: number;   // 월 예상 클릭 (Mobile)
  totalSearch: number;
  avgCpc: number;     // 평균 클릭단가 (1~5위 PC+Mobile 평균)
  score: number;      // 효율 점수 = 검색량 / 평균단가
  grade: string;
}

export default function BidAnalysis({ onOpenSettings }: BidAnalysisProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<FullKeywordData[]>([]);
  const [budget, setBudget] = useState<string>(''); // 키워드당 월 예산
  const [sortByEff, setSortByEff] = useState(false);
  const [isApiConfigured, setIsApiConfigured] = useState<boolean | null>(null);

  const keywords = useMemo(() => parseKeywords(text), [text]);
  const budgetNum = useMemo(() => {
    const n = parseInt(budget.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }, [budget]);

  useEffect(() => {
    getNaverAdSettings()
      .then((d) => setIsApiConfigured(d.is_configured))
      .catch(() => setIsApiConfigured(false));
  }, []);

  const handleSearch = useCallback(async () => {
    if (keywords.length === 0) {
      setError('키워드를 입력해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await bulkBidAnalysis(keywords);
      setResults(data);
    } catch (err: any) {
      setError(err.response?.data?.detail?.message || err.response?.data?.detail || '조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [keywords]);

  // 계산 + 효율 등급(배치 내 상대 평가)
  const rows: AnalyzedRow[] = useMemo(() => {
    const base: AnalyzedRow[] = results.map((r) => {
      const pcClicks = r.pc_click_count ?? Math.round((r.pc_search_volume || 0) * (r.pc_click_rate || 0) / 100);
      const moClicks = r.mobile_click_count ?? Math.round((r.mobile_search_volume || 0) * (r.mobile_click_rate || 0) / 100);
      const totalSearch = (r.pc_search_volume || 0) + (r.mobile_search_volume || 0);
      const allBids = [...r.pc_rank_bids.map((b) => b.bid), ...r.mobile_rank_bids.map((b) => b.bid)].filter((b) => b > 0);
      const avgCpc = allBids.length ? Math.round(allBids.reduce((a, b) => a + b, 0) / allBids.length) : 0;
      const score = avgCpc > 0 ? totalSearch / avgCpc : 0;
      return { data: r, pcClicks, moClicks, totalSearch, avgCpc, score, grade: '-' };
    });

    // 효율 점수(검색량 ÷ 평균단가) 기준 상대 등급
    const scored = base.filter((b) => b.score > 0).sort((a, b) => b.score - a.score);
    const n = scored.length;
    scored.forEach((row, idx) => {
      const p = n > 1 ? idx / (n - 1) : 0;
      row.grade = p <= 0.2 ? 'A+' : p <= 0.4 ? 'A' : p <= 0.6 ? 'B' : p <= 0.8 ? 'C' : 'D';
    });

    return sortByEff ? [...base].sort((a, b) => b.score - a.score) : base;
  }, [results, sortByEff]);

  if (isApiConfigured === false) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-3">광고입찰가 분석</h2>
        <div className="glass-card p-8">
          <p className="text-gray-900 dark:text-gray-300 mb-4">
            네이버 검색광고 API가 설정되지 않았습니다. 설정에서 API 키를 등록해주세요.
          </p>
          <button onClick={onOpenSettings} className="px-6 py-2.5 rounded-lg naver-gradient text-white font-medium hover:opacity-90">
            설정 열기
          </button>
        </div>
      </div>
    );
  }

  const budgetMode = budgetNum > 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1">광고입찰가 분석</h2>
        <p className="text-sm text-gray-900 dark:text-gray-400">
          여러 키워드의 PC/모바일 1~5위 단가와 검색량·클릭률을 한 번에 조회하고, 단가별 비용 또는 예산 대비 클릭 수를 비교합니다.
        </p>
      </div>

      {/* 입력 */}
      <div className="glass-card p-5 mb-5">
        <label className="block text-sm font-medium text-gray-900 dark:text-gray-400 mb-2">
          키워드 ({keywords.length}개, 최대 30개)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'키워드를 줄바꿈(엔터)으로 구분해 입력하세요.\n예)\n이혼변호사\n서초변호사'}
          rows={5}
          className="w-full p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg border border-gray-200 dark:border-gray-700 outline-none focus:border-naver-green text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-y leading-7"
        />
        <div className="flex flex-wrap items-end gap-4 mt-4">
          <div>
            <label className="block text-xs text-gray-900 dark:text-gray-400 mb-1">
              키워드당 월 예산 (선택) — 입력 시 "이 예산이면 단가별 몇 클릭" 표시
            </label>
            <input
              type="text"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="예: 1000000"
              className="w-48 px-3 py-2 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg border border-gray-200 dark:border-gray-700 outline-none focus:border-naver-green text-gray-900 dark:text-gray-100 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-gray-300 cursor-pointer pb-2">
            <input type="checkbox" checked={sortByEff} onChange={(e) => setSortByEff(e.target.checked)} className="accent-naver-green" />
            효율순 정렬
          </label>
          <button
            onClick={handleSearch}
            disabled={loading || keywords.length === 0}
            className={`ml-auto px-8 py-2.5 rounded-lg font-medium transition ${
              loading || keywords.length === 0
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'naver-gradient text-white hover:opacity-90'
            }`}
          >
            {loading ? '조회 중…' : '검색'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>

      {results.length === 0 && !loading && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-10 text-sm">
          키워드를 입력하고 검색하면 클릭률·1~5위 단가와 예상 비용·효율이 표시됩니다.
        </p>
      )}
      {loading && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-10 text-sm">
          조회 중입니다… (키워드 수에 따라 수 초~수십 초 소요)
        </p>
      )}

      {/* 결과 테이블 */}
      {results.length > 0 && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="naver-gradient text-white text-xs">
                <th className="px-3 py-3 text-left sticky left-0 z-10 naver-gradient">키워드</th>
                <th className="px-3 py-3 text-right">검색량<br/>(PC/모바일)</th>
                <th className="px-3 py-3 text-right">클릭률<br/>(PC/모바일)</th>
                <th className="px-3 py-3 text-right">월 예상클릭<br/>(PC/모바일)</th>
                <th className="px-3 py-3 text-center">효율<br/>(클릭단가)</th>
                <th className="px-3 py-3 text-left">
                  PC단가 {budgetMode ? '→ 예산내 클릭' : '→ 월 예상비용'}
                </th>
                <th className="px-3 py-3 text-left">
                  Mobile단가 {budgetMode ? '→ 예산내 클릭' : '→ 월 예상비용'}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const r = row.data;
                if (r.error) {
                  return (
                    <tr key={idx} className="border-b border-gray-200/40 dark:border-gray-700/40">
                      <td className="px-3 py-3 font-bold text-naver-green sticky left-0 bg-white dark:bg-[#1a1a1a]">{r.keyword}</td>
                      <td colSpan={6} className="px-3 py-3 text-red-400 text-xs">조회 실패: {r.error}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={idx} className="border-b border-gray-200/40 dark:border-gray-700/40 hover:bg-gray-50 dark:hover:bg-[#202020]">
                    <td className="px-3 py-3 font-bold text-naver-green align-top sticky left-0 bg-white dark:bg-[#1a1a1a]">{r.keyword}</td>
                    <td className="px-3 py-3 text-right align-top font-mono text-xs">
                      <div>{num(r.pc_search_volume)}</div>
                      <div className="text-gray-500">{num(r.mobile_search_volume)}</div>
                    </td>
                    <td className="px-3 py-3 text-right align-top font-mono text-xs">
                      <div>{pct(r.pc_click_rate)}</div>
                      <div className="text-gray-500">{pct(r.mobile_click_rate)}</div>
                    </td>
                    <td className="px-3 py-3 text-right align-top font-mono text-xs">
                      <div>{num(row.pcClicks)}</div>
                      <div className="text-gray-500">{num(row.moClicks)}</div>
                    </td>
                    <td className="px-3 py-3 text-center align-top">
                      <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${gradeStyle[row.grade] || gradeStyle['-']}`}>
                        {row.grade}
                      </span>
                      <div className="text-[11px] text-gray-500 mt-1 font-mono" title="1~5위 평균 클릭단가">{won(row.avgCpc)}</div>
                    </td>
                    <td className="px-3 py-3 align-top">{renderRankCol(r.pc_rank_bids, row.pcClicks, budgetNum)}</td>
                    <td className="px-3 py-3 align-top">{renderRankCol(r.mobile_rank_bids, row.moClicks, budgetNum)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {results.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 leading-5 space-y-0.5">
          <p>· <b>클릭률</b> = 네이버 월평균 클릭률(CTR, 노출 대비 클릭 비율). 월 클릭 횟수가 아니라 비율입니다.</p>
          <p>· <b>월 예상클릭</b> = 검색량 × 클릭률 (네이버 월간 평균 클릭수).</p>
          <p>· <b>예산 미입력 시</b>: 각 순위 단가 → <b>월 예상비용</b> = 월 예상클릭 × 단가.</p>
          <p>· <b>예산 입력 시</b>: 각 순위 단가 → <b>예산내 가능 클릭</b> = 월 예산 ÷ 단가 (월 예상클릭 한도). 5위(가장 싼 단가)에서 클릭이 가장 많습니다.</p>
          <p>· <b>효율</b> = 검색량 ÷ 평균 클릭단가. 수요가 많고 단가가 쌀수록 가성비가 좋아 A+에 가깝습니다(입력 키워드 중 상대 등급).</p>
        </div>
      )}
    </div>
  );
}

// 순위별 단가 + (예산 미입력) 월 예상비용 / (예산 입력) 예산내 가능 클릭 렌더
function renderRankCol(
  bids: { rank: number; bid: number }[],
  monthlyClicks: number,
  budgetNum: number,
) {
  if (!bids || bids.length === 0) {
    return <span className="text-gray-400 text-xs">데이터 없음</span>;
  }
  const budgetMode = budgetNum > 0;
  return (
    <div className="space-y-0.5">
      {[...bids].sort((a, b) => a.rank - b.rank).map((b) => {
        const bid = b.bid;
        let right: string;
        if (budgetMode) {
          const clicks = bid > 0 ? Math.min(Math.floor(budgetNum / bid), monthlyClicks) : 0;
          right = `${clicks.toLocaleString('ko-KR')}클릭`;
        } else {
          right = won(monthlyClicks * bid);
        }
        return (
          <div key={b.rank} className="flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold ${rankBadge(b.rank)}`}>
              {b.rank}
            </span>
            <span className="font-mono font-semibold w-20 text-right">{won(bid)}</span>
            <span className="text-gray-400">→</span>
            <span className={`font-mono ${budgetMode ? 'text-naver-green font-semibold' : 'text-gray-600 dark:text-gray-300'}`}>{right}</span>
          </div>
        );
      })}
    </div>
  );
}

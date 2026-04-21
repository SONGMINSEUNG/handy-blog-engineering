import { useState, useCallback, memo } from 'react';

// 입찰가 데이터 인터페이스 (확장됨)
export interface BidPriceData {
  keyword: string;
  // 검색량
  pc_search_volume: number | null;
  mobile_search_volume: number | null;
  // 클릭수
  pc_click_count: number | null;
  mobile_click_count: number | null;
  // 클릭률
  pc_click_rate: number | null;
  mobile_click_rate: number | null;
  // 경쟁 정도
  competition: string | null;
  competition_index: number | null;
  // 입찰가
  pc_minimum_bid: number | null;
  mobile_minimum_bid: number | null;
  pc_rank_bids: { rank: number; bid: number }[];
  mobile_rank_bids: { rank: number; bid: number }[];
  // 추정 여부
  rank_bids_estimated?: boolean;
  // 입찰가 출처 (api/scraper/estimated)
  rank_bids_source?: string | null;
  // 변형 키워드(공백 제거) 데이터
  variant_data?: BidPriceData | null;
  // 에러
  error?: string | null;
}

interface BidPriceSectionProps {
  data: BidPriceData | null;
  loading: boolean;
  error: string | null;
  isApiConfigured: boolean;
  onRefresh: () => void | Promise<void>;
  onOpenSettings: () => void;
}

// 스켈레톤 UI 컴포넌트
const SkeletonCard = memo(() => (
  <div className="p-4 bg-dark-bg rounded-lg animate-pulse">
    <div className="h-4 bg-dark-border rounded w-24 mb-3"></div>
    <div className="h-8 bg-dark-border rounded w-20"></div>
  </div>
));

SkeletonCard.displayName = 'SkeletonCard';

// 경쟁 정도 배지 컴포넌트
const CompetitionBadge = memo(({ competition }: { competition: string | null }) => {
  if (!competition || competition === '정보없음') {
    return <span className="text-dark-muted">-</span>;
  }

  const getColorClass = () => {
    switch (competition) {
      case '높음':
        return 'bg-red-500/20 text-red-400 border-red-500';
      case '중간':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500';
      case '낮음':
        return 'bg-green-500/20 text-green-400 border-green-500';
      default:
        return 'bg-dark-border text-dark-muted border-dark-border';
    }
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded border ${getColorClass()}`}>
      {competition}
    </span>
  );
});

CompetitionBadge.displayName = 'CompetitionBadge';

function BidPriceSection({
  data,
  loading,
  error,
  isApiConfigured,
  onRefresh,
  onOpenSettings,
}: BidPriceSectionProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [onRefresh]);

  // 숫자 포맷팅
  const formatNumber = (num: number | null): string => {
    if (num === null || num === undefined) return '-';
    return num.toLocaleString();
  };

  // 금액 포맷팅
  const formatPrice = (price: number | null): string => {
    if (price === null || price === undefined) return '-';
    return `${price.toLocaleString()}원`;
  };

  // 퍼센트 포맷팅
  const formatPercent = (percent: number | null): string => {
    if (percent === null || percent === undefined) return '-';
    return `${percent.toFixed(2)}%`;
  };

  // API 미설정 상태
  if (!isApiConfigured) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">키워드 분석 정보</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-dark-bg flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-dark-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <p className="text-dark-muted mb-4">
            키워드 분석 정보를 조회하려면 네이버 광고 API 설정이 필요합니다.
          </p>
          <button
            onClick={onOpenSettings}
            className="px-4 py-2 bg-naver-green hover:bg-naver-light text-white font-medium rounded-lg transition"
          >
            API 설정하기
          </button>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">키워드 분석 정보</h2>
        </div>
        <div className="p-4 bg-red-500/20 border border-red-500 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-red-400 font-medium">{error}</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3 py-1.5 bg-red-500/30 hover:bg-red-500/50 text-red-300 text-sm rounded transition"
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 로딩 상태
  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">키워드 분석 정보</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  // 데이터가 없는 경우
  if (!data) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">키워드 분석 정보</h2>
        </div>
        <div className="text-center py-8 text-dark-muted">
          키워드를 검색하면 분석 정보가 표시됩니다.
        </div>
      </div>
    );
  }

  // 정상 데이터 표시
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          키워드 분석 정보
          {data.keyword && (
            <span className="ml-2 text-naver-green font-normal">"{data.keyword}"</span>
          )}
        </h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 hover:bg-dark-hover rounded-lg transition"
          title="새로고침"
        >
          <svg
            className={`w-5 h-5 text-dark-muted hover:text-dark-text transition ${
              isRefreshing ? 'animate-spin' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* 검색량 및 클릭수 테이블 */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-border">
              <th className="px-4 py-2 text-left text-dark-muted">구분</th>
              <th className="px-4 py-2 text-right text-dark-muted">
                <span className="flex items-center justify-end gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  PC
                </span>
              </th>
              <th className="px-4 py-2 text-right text-dark-muted">
                <span className="flex items-center justify-end gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  모바일
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-dark-border/50 hover:bg-dark-hover transition">
              <td className="px-4 py-3 text-dark-muted">월간 검색량</td>
              <td className="px-4 py-3 text-right text-dark-text font-medium">
                {formatNumber(data.pc_search_volume)}
              </td>
              <td className="px-4 py-3 text-right text-dark-text font-medium">
                {formatNumber(data.mobile_search_volume)}
              </td>
            </tr>
            <tr className="border-b border-dark-border/50 hover:bg-dark-hover transition">
              <td className="px-4 py-3 text-dark-muted">월간 클릭수</td>
              <td className="px-4 py-3 text-right text-dark-text font-medium">
                {formatNumber(data.pc_click_count)}
              </td>
              <td className="px-4 py-3 text-right text-dark-text font-medium">
                {formatNumber(data.mobile_click_count)}
              </td>
            </tr>
            <tr className="border-b border-dark-border/50 hover:bg-dark-hover transition">
              <td className="px-4 py-3 text-dark-muted">클릭률</td>
              <td className="px-4 py-3 text-right text-dark-text font-medium">
                {formatPercent(data.pc_click_rate)}
              </td>
              <td className="px-4 py-3 text-right text-dark-text font-medium">
                {formatPercent(data.mobile_click_rate)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 경쟁 정도 및 최소 입찰가 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* 경쟁 정도 */}
        <div className="p-4 bg-dark-bg rounded-lg">
          <div className="text-dark-muted text-sm mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            경쟁 정도
          </div>
          <div className="flex items-center gap-2">
            <CompetitionBadge competition={data.competition} />
            {data.competition_index !== null && data.competition_index > 0 && (
              <span className="text-sm text-dark-muted">
                (지수: {data.competition_index})
              </span>
            )}
          </div>
        </div>

        {/* PC 최소 입찰가 */}
        <div className="p-4 bg-dark-bg rounded-lg">
          <div className="text-dark-muted text-sm mb-1 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            PC 최소 입찰가
          </div>
          <div className="text-2xl font-bold text-naver-green">
            {formatPrice(data.pc_minimum_bid)}
          </div>
        </div>

        {/* 모바일 최소 입찰가 */}
        <div className="p-4 bg-dark-bg rounded-lg">
          <div className="text-dark-muted text-sm mb-1 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            모바일 최소 입찰가
          </div>
          <div className="text-2xl font-bold text-naver-green">
            {formatPrice(data.mobile_minimum_bid)}
          </div>
        </div>
      </div>

      {/* 부분 에러 표시 (일부 데이터만 실패한 경우) */}
      {data.error && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm mt-4">
          <span className="font-medium">참고:</span> {data.error}
        </div>
      )}
    </div>
  );
}

export default memo(BidPriceSection);

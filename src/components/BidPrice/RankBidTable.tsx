import { memo } from 'react';
import { BidPriceData } from './BidPriceSection';

interface RankBidTableProps {
  data: BidPriceData | null;
  loading: boolean;
  isApiConfigured: boolean;
}

// 스켈레톤 테이블 행
const SkeletonRow = memo(() => (
  <tr className="border-b border-dark-border/50">
    <td className="px-4 py-3">
      <div className="h-4 bg-dark-border rounded w-8 animate-pulse"></div>
    </td>
    <td className="px-4 py-3">
      <div className="h-4 bg-dark-border rounded w-20 animate-pulse"></div>
    </td>
    <td className="px-4 py-3">
      <div className="h-4 bg-dark-border rounded w-20 animate-pulse"></div>
    </td>
  </tr>
));

SkeletonRow.displayName = 'SkeletonRow';

function RankBidTable({ data, loading, isApiConfigured }: RankBidTableProps) {
  // 금액 포맷팅
  const formatPrice = (price: number | null | undefined): string => {
    if (price === null || price === undefined) return '-';
    return `${price.toLocaleString()}원`;
  };

  // API 미설정 또는 데이터 없음 상태
  if (!isApiConfigured || (!loading && !data)) {
    return null;
  }

  // 1~5위 데이터 준비
  const ranks = [1, 2, 3, 4, 5];
  const getBidForRank = (
    rankBids: { rank: number; bid: number }[] | undefined,
    rank: number
  ): number | null => {
    if (!rankBids) return null;
    const found = rankBids.find((rb) => rb.rank === rank);
    return found ? found.bid : null;
  };

  // 순위별 입찰가 데이터가 비어있는지 확인
  const hasRankBidData = data && (
    (data.pc_rank_bids && data.pc_rank_bids.length > 0) ||
    (data.mobile_rank_bids && data.mobile_rank_bids.length > 0)
  );

  // 데이터가 없으면 안내 메시지 표시
  if (!loading && data && !hasRankBidData) {
    return (
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-4">순위별 평균 입찰가</h2>
        <div className="text-center py-8">
          <div className="text-dark-muted mb-2">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">순위별 입찰가 정보를 조회할 수 없습니다.</p>
            <p className="text-xs mt-1 opacity-70">검색량이 너무 적거나 네이버 API에서 해당 정보를 제공하지 않을 수 있습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-semibold mb-4">순위별 평균 입찰가</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-border">
              <th className="px-4 py-2 text-left text-dark-muted">순위</th>
              <th className="px-4 py-2 text-right text-dark-muted">
                <span className="flex items-center justify-end gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  PC 평균 입찰가
                </span>
              </th>
              <th className="px-4 py-2 text-right text-dark-muted">
                <span className="flex items-center justify-end gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  모바일 평균 입찰가
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // 로딩 스켈레톤
              <>
                {ranks.map((rank) => (
                  <SkeletonRow key={rank} />
                ))}
              </>
            ) : data ? (
              // 실제 데이터
              ranks.map((rank) => {
                const pcBid = getBidForRank(data.pc_rank_bids, rank);
                const mobileBid = getBidForRank(data.mobile_rank_bids, rank);
                return (
                  <tr
                    key={rank}
                    className="border-b border-dark-border/50 hover:bg-dark-hover transition"
                  >
                    <td className="px-4 py-3 font-medium">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          rank === 1
                            ? 'bg-yellow-500 text-black'
                            : rank === 2
                            ? 'bg-gray-400 text-black'
                            : rank === 3
                            ? 'bg-amber-600 text-white'
                            : 'bg-dark-border text-white'
                        }`}
                      >
                        {rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium">
                      {formatPrice(pcBid)}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium">
                      {formatPrice(mobileBid)}
                    </td>
                  </tr>
                );
              })
            ) : null}
          </tbody>
        </table>
      </div>
      {/* 참고 메시지 */}
      <p className="text-dark-muted text-xs mt-4">
        * 입찰가는 실시간으로 변동될 수 있으며, 참고용으로만 활용해 주세요.
        {data?.rank_bids_estimated && (
          <span className="block mt-1 text-yellow-400/70">
            * 순위별 입찰가는 최소 입찰가 기반 추정값입니다.
          </span>
        )}
      </p>
    </div>
  );
}

export default memo(RankBidTable);

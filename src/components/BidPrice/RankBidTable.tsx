import { memo, useState, useCallback } from 'react';
import { BidPriceData } from './BidPriceSection';
import {
  openScraperLogin,
  getScraperLoginStatus,
  confirmScraperLogin,
  scrapeRankBids,
} from '../../services/api';

interface RankBidTableProps {
  data: BidPriceData | null;
  loading: boolean;
  isApiConfigured: boolean;
  onScraperDataReceived?: (pcBids: { rank: number; bid: number }[], mobileBids: { rank: number; bid: number }[]) => void;
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

function RankBidTable({ data, loading, isApiConfigured, onScraperDataReceived }: RankBidTableProps) {
  const [scraperStatus, setScraperStatus] = useState<'idle' | 'opening' | 'waiting' | 'scraping' | 'done' | 'error'>('idle');
  const [scraperMessage, setScraperMessage] = useState<string>('');

  // 스크래퍼를 통한 실제 입찰가 조회 플로우
  const handleScraperLogin = useCallback(async () => {
    if (!data?.keyword) return;

    try {
      // 1단계: 로그인 상태 먼저 확인
      setScraperStatus('opening');
      setScraperMessage('로그인 상태 확인 중...');

      const status = await getScraperLoginStatus();

      if (status.logged_in) {
        // 이미 로그인됨 - 바로 스크래핑
        setScraperStatus('scraping');
        setScraperMessage('실제 입찰가를 조회하고 있습니다...');

        const result = await scrapeRankBids([data.keyword]);
        const keywordData = result.results?.[data.keyword];

        if (keywordData && !keywordData.error) {
          const pcBids = Object.entries(keywordData.pc || {}).map(([rank, bid]) => ({
            rank: parseInt(rank),
            bid: bid as number,
          }));
          const mobileBids = Object.entries(keywordData.mobile || {}).map(([rank, bid]) => ({
            rank: parseInt(rank),
            bid: bid as number,
          }));

          if (onScraperDataReceived) {
            onScraperDataReceived(pcBids, mobileBids);
          }

          setScraperStatus('done');
          setScraperMessage('실제 입찰가를 불러왔습니다.');
        } else {
          setScraperStatus('error');
          setScraperMessage(keywordData?.error || '입찰가 조회에 실패했습니다.');
        }
        return;
      }

      // 2단계: 로그인 창 열기
      setScraperMessage('네이버 로그인 페이지를 열고 있습니다...');
      await openScraperLogin();

      // 3단계: 로그인 대기
      setScraperStatus('waiting');
      setScraperMessage('브라우저에서 네이버 로그인을 완료해주세요. (최대 5분 대기)');

      const loginResult = await confirmScraperLogin();

      if (!loginResult.success) {
        setScraperStatus('error');
        setScraperMessage('로그인 시간이 초과되었습니다. 다시 시도해주세요.');
        return;
      }

      // 4단계: 스크래핑 실행
      setScraperStatus('scraping');
      setScraperMessage('로그인 완료! 실제 입찰가를 조회하고 있습니다...');

      const scrapeResult = await scrapeRankBids([data.keyword]);
      const kwData = scrapeResult.results?.[data.keyword];

      if (kwData && !kwData.error) {
        const pcBids = Object.entries(kwData.pc || {}).map(([rank, bid]) => ({
          rank: parseInt(rank),
          bid: bid as number,
        }));
        const mobileBids = Object.entries(kwData.mobile || {}).map(([rank, bid]) => ({
          rank: parseInt(rank),
          bid: bid as number,
        }));

        if (onScraperDataReceived) {
          onScraperDataReceived(pcBids, mobileBids);
        }

        setScraperStatus('done');
        setScraperMessage('실제 입찰가를 불러왔습니다.');
      } else {
        setScraperStatus('error');
        setScraperMessage(kwData?.error || '입찰가 조회에 실패했습니다.');
      }
    } catch (err: unknown) {
      setScraperStatus('error');
      const message = err instanceof Error ? err.message : '스크래퍼 연동 중 오류가 발생했습니다.';
      setScraperMessage(message);
    }
  }, [data?.keyword, onScraperDataReceived]);

  // 금액 포맷팅
  const formatPrice = (price: number | null | undefined, estimated?: boolean): string => {
    if (price === null || price === undefined) return '-';
    const formatted = `${price.toLocaleString()}원`;
    return estimated ? `${formatted} (추정)` : formatted;
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
        <h2 className="text-lg font-semibold mb-4">순위별 입찰가</h2>
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
      <h2 className="text-lg font-semibold mb-4">
        순위별 입찰가
        {data?.rank_bids_estimated && (
          <span className="ml-2 text-xs font-normal text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/30">
            추정값
          </span>
        )}
        {data?.rank_bids_source === 'scraper' && (
          <span className="ml-2 text-xs font-normal text-naver-green bg-naver-green/10 px-2 py-0.5 rounded-full border border-naver-green/30">
            실제 입찰가
          </span>
        )}
      </h2>
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
                  PC 입찰가
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
                  모바일 입찰가
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
                    <td className="px-4 py-3 text-right text-dark-text font-medium">
                      {data?.rank_bids_estimated && pcBid != null ? (
                        <span>
                          {pcBid.toLocaleString()}원
                          <span className="ml-1 text-xs text-yellow-400">(추정)</span>
                        </span>
                      ) : formatPrice(pcBid)}
                    </td>
                    <td className="px-4 py-3 text-right text-dark-text font-medium">
                      {data?.rank_bids_estimated && mobileBid != null ? (
                        <span>
                          {mobileBid.toLocaleString()}원
                          <span className="ml-1 text-xs text-yellow-400">(추정)</span>
                        </span>
                      ) : formatPrice(mobileBid)}
                    </td>
                  </tr>
                );
              })
            ) : null}
          </tbody>
        </table>
      </div>
      {/* 스크래퍼 상태 표시 */}
      {scraperStatus !== 'idle' && scraperStatus !== 'done' && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${
          scraperStatus === 'error'
            ? 'bg-red-500/10 border border-red-500/30 text-red-400'
            : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
        }`}>
          <div className="flex items-center gap-2">
            {(scraperStatus === 'opening' || scraperStatus === 'waiting' || scraperStatus === 'scraping') && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <span>{scraperMessage}</span>
          </div>
          {scraperStatus === 'error' && (
            <button
              onClick={() => { setScraperStatus('idle'); setScraperMessage(''); }}
              className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-xs transition"
            >
              닫기
            </button>
          )}
        </div>
      )}

      {scraperStatus === 'done' && (
        <div className="mt-4 p-3 rounded-lg text-sm bg-green-500/10 border border-green-500/30 text-green-400">
          {scraperMessage}
        </div>
      )}

      {/* 참고 메시지 */}
      <p className="text-dark-muted text-xs mt-4">
        * 입찰가는 실시간으로 변동될 수 있으며, 참고용으로만 활용해 주세요.
        {data?.rank_bids_estimated && (
          <>
            <span className="block mt-1 text-yellow-400/80">
              * 네이버 API에서 실제 순위별 입찰가를 제공하지 않아, 최소 입찰가에 순위별 가중치(1위 5.0배 ~ 5위 1.3배)를 적용한 추정값입니다. 실제 입찰가와 차이가 있을 수 있습니다.
            </span>
            {(scraperStatus === 'idle' || scraperStatus === 'error' || scraperStatus === 'done') && (
              <button
                onClick={() => {
                  setScraperStatus('idle');
                  setScraperMessage('');
                  handleScraperLogin();
                }}
                className="mt-2 px-3 py-1.5 bg-naver-green/20 hover:bg-naver-green/30 text-naver-green text-xs font-medium rounded border border-naver-green/30 transition"
              >
                {scraperStatus === 'error' ? '실제 입찰가 재시도 (검색광고 로그인 필요)' : '실제 입찰가 조회 (검색광고 로그인 필요)'}
              </button>
            )}
          </>
        )}
        {data?.rank_bids_source === 'scraper' && (
          <span className="block mt-1 text-naver-green/80">
            * 검색광고 관리 시스템에서 직접 수집한 실제 입찰가입니다.
          </span>
        )}
      </p>
    </div>
  );
}

export default memo(RankBidTable);

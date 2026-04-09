import { AnalysisResult } from '../../services/api';

interface DashboardProps {
  result: AnalysisResult;
}

export default function Dashboard({ result }: DashboardProps) {
  const typeLabels: Record<string, { label: string; color: string; bgColor: string }> = {
    blog: { label: '블로그', color: 'text-green-400', bgColor: 'bg-green-500' },
    cafe: { label: '카페', color: 'text-blue-400', bgColor: 'bg-blue-500' },
    youtube: { label: '유튜브', color: 'text-red-400', bgColor: 'bg-red-500' },
    website: { label: '웹사이트', color: 'text-purple-400', bgColor: 'bg-purple-500' },
    webdoc: { label: '웹문서', color: 'text-purple-400', bgColor: 'bg-purple-500' },
    news: { label: '뉴스', color: 'text-orange-400', bgColor: 'bg-orange-500' },
    knowledge: { label: '지식iN', color: 'text-yellow-400', bgColor: 'bg-yellow-500' },
    kin: { label: '지식인', color: 'text-yellow-400', bgColor: 'bg-yellow-500' },
    place: { label: '플레이스', color: 'text-cyan-400', bgColor: 'bg-cyan-500' },
    shopping: { label: '쇼핑', color: 'text-pink-400', bgColor: 'bg-pink-500' },
    video: { label: '동영상', color: 'text-indigo-400', bgColor: 'bg-indigo-500' },
    naver_tv: { label: '네이버TV', color: 'text-indigo-400', bgColor: 'bg-indigo-500' },
    image: { label: '이미지', color: 'text-teal-400', bgColor: 'bg-teal-500' },
    wikipedia: { label: '위키백과', color: 'text-gray-300', bgColor: 'bg-gray-600' },
    namuwiki: { label: '나무위키', color: 'text-green-300', bgColor: 'bg-green-700' },
    encyclopedia: { label: '지식백과', color: 'text-amber-400', bgColor: 'bg-amber-600' },
    post: { label: '포스트', color: 'text-lime-400', bgColor: 'bg-lime-500' },
    influencer: { label: '인플루언서', color: 'text-rose-400', bgColor: 'bg-rose-500' },
    brand_content: { label: '블로그 탭', color: 'text-orange-400', bgColor: 'bg-orange-500' },
    unknown: { label: '기타', color: 'text-gray-400', bgColor: 'bg-gray-500' },
  };

  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '-';
    return num.toLocaleString();
  };

  const searchVolume = result.search_volume;
  const hasVolume = searchVolume?.total !== null && searchVolume?.total !== undefined;

  // 섹션별 개수 정렬 (많은 순)
  const sortedSections = Object.entries(result.section_counts || {})
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="h-full flex flex-col">
      {/* 키워드 헤더 */}
      <div className="px-6 py-4 border-b border-dark-border bg-dark-card/30">
        <h2 className="text-2xl font-bold">
          <span className="text-naver-green">&quot;{result.keyword}&quot;</span>
          <span className="text-dark-muted font-normal ml-3">분석 결과</span>
        </h2>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 검색량 & 광고 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* 월간 검색량 */}
          <div className="glass-card p-4">
            <div className="text-sm text-dark-muted mb-1">월간 검색량</div>
            <div className="text-3xl font-bold text-naver-green">
              {hasVolume ? formatNumber(searchVolume.total) : '-'}
            </div>
            {searchVolume?.note && (
              <div className="text-xs text-yellow-400 mt-1">{searchVolume.note}</div>
            )}
          </div>

          {/* PC 검색량 */}
          <div className="glass-card p-4">
            <div className="text-sm text-dark-muted mb-1">PC 검색량</div>
            <div className="text-2xl font-bold text-blue-400">
              {formatNumber(searchVolume?.pc)}
            </div>
          </div>

          {/* 모바일 검색량 */}
          <div className="glass-card p-4">
            <div className="text-sm text-dark-muted mb-1">모바일 검색량</div>
            <div className="text-2xl font-bold text-purple-400">
              {formatNumber(searchVolume?.mobile)}
            </div>
          </div>

          {/* 검색광고 */}
          <div className="glass-card p-4">
            <div className="text-sm text-dark-muted mb-1">검색광고</div>
            <div className="text-2xl font-bold text-red-400">
              {result.ad_count}개
            </div>
            {searchVolume?.competition && (
              <div className="text-xs text-dark-muted mt-1">
                경쟁: {searchVolume.competition}
              </div>
            )}
          </div>
        </div>

        {/* 섹션별 개수 */}
        <div className="glass-card p-4">
          <h3 className="text-lg font-semibold mb-4">섹션별 노출 개수</h3>
          {sortedSections.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {sortedSections.map(([type, count]) => {
                const typeInfo = typeLabels[type] || typeLabels.unknown;
                return (
                  <div
                    key={type}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-bg"
                  >
                    <div className={`w-3 h-3 rounded-full ${typeInfo.bgColor}`} />
                    <span className={`font-medium ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    <span className="text-white font-bold">{count}개</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-dark-muted">섹션 정보 없음</div>
          )}
        </div>

        {/* 상위노출 순서 */}
        <div className="glass-card p-4">
          <h3 className="text-lg font-semibold mb-4">
            상위노출 순서
            <span className="text-sm text-dark-muted font-normal ml-2">
              (총 {result.top_results?.length || 0}개)
            </span>
          </h3>

          {result.top_results && result.top_results.length > 0 ? (
            <div className="space-y-2">
              {result.top_results.map((item) => {
                const typeInfo = typeLabels[item.type] || typeLabels.unknown;
                return (
                  <div
                    key={item.rank}
                    className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg hover:bg-dark-border transition"
                  >
                    {/* 순위 */}
                    <div className="w-10 h-10 rounded-lg bg-dark-card flex items-center justify-center font-bold text-lg">
                      {item.rank}
                    </div>

                    {/* 타입 */}
                    <div className={`px-3 py-1 rounded-full text-sm ${typeInfo.bgColor}/20 ${typeInfo.color}`}>
                      {typeInfo.label}
                    </div>

                    {/* 제목 & 링크 */}
                    <div className="flex-1 min-w-0">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:text-naver-green transition truncate block"
                        title={item.title}
                      >
                        {item.title || '(제목 없음)'}
                      </a>
                    </div>

                    {/* 외부 링크 아이콘 */}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dark-muted hover:text-naver-green transition p-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-dark-muted">
              상위노출 결과가 없습니다.
            </div>
          )}
        </div>

        {/* 에러 표시 */}
        {result.error && (
          <div className="glass-card p-4 border border-red-500/50 bg-red-500/10">
            <h3 className="text-lg font-semibold text-red-400 mb-2">오류 발생</h3>
            <p className="text-red-300">{result.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

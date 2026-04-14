import { AnalysisResult, AdInfo, AIRecommendation, SectionOrder } from '../../services/api';

interface ResultsTableProps {
  results: AnalysisResult[];
  onKeywordClick?: (keyword: string) => void;
}

// 타입별 색상 및 라벨 정의
const typeConfig: Record<string, { label: string; bgColor: string; textColor: string }> = {
  blog: { label: '블로그', bgColor: 'bg-red-600', textColor: 'text-white' },
  cafe: { label: '카페', bgColor: 'bg-blue-600', textColor: 'text-white' },
  kin: { label: '지식인', bgColor: 'bg-yellow-500', textColor: 'text-black' },
  news: { label: '뉴스', bgColor: 'bg-gray-500', textColor: 'text-white' },
  place: { label: '플레이스', bgColor: 'bg-cyan-600', textColor: 'text-white' },
  shopping: { label: '쇼핑', bgColor: 'bg-pink-600', textColor: 'text-white' },
  youtube: { label: '유튜브', bgColor: 'bg-red-500', textColor: 'text-white' },
  naver_tv: { label: '네이버TV', bgColor: 'bg-green-600', textColor: 'text-white' },
  video: { label: '동영상', bgColor: 'bg-purple-600', textColor: 'text-white' },
  image: { label: '이미지', bgColor: 'bg-teal-600', textColor: 'text-white' },
  webdoc: { label: '웹문서', bgColor: 'bg-indigo-600', textColor: 'text-white' },
  view: { label: 'VIEW', bgColor: 'bg-green-500', textColor: 'text-white' },
  namuwiki: { label: '나무위키', bgColor: 'bg-green-700', textColor: 'text-white' },
  wikipedia: { label: '위키피디아', bgColor: 'bg-gray-600', textColor: 'text-white' },
  encyclopedia: { label: '백과', bgColor: 'bg-amber-600', textColor: 'text-white' },
  post: { label: '포스트', bgColor: 'bg-lime-600', textColor: 'text-white' },
  influencer: { label: '인플루언서', bgColor: 'bg-rose-600', textColor: 'text-white' },
  website: { label: '웹', bgColor: 'bg-teal-600', textColor: 'text-white' },
  smartstore: { label: '스토어', bgColor: 'bg-orange-500', textColor: 'text-white' },
  brand_content: { label: '브랜드콘텐츠(광고)', bgColor: 'bg-red-500', textColor: 'text-white' },
  etc: { label: '기타', bgColor: 'bg-gray-500', textColor: 'text-white' },
  unknown: { label: '웹', bgColor: 'bg-teal-600', textColor: 'text-white' },
};

// 숫자 포맷
const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString();
};

// 섹션 타입 라벨 매핑 (섹션 순서 표시용)
const sectionTypeLabels: Record<string, { label: string; bgColor: string; textColor: string }> = {
  '파워링크': { label: '파워링크', bgColor: 'bg-red-600', textColor: 'text-white' },
  '브랜드콘텐츠': { label: '브랜드콘텐츠(광고)', bgColor: 'bg-red-500', textColor: 'text-white' },
  '브랜드 콘텐츠': { label: '브랜드콘텐츠(광고)', bgColor: 'bg-red-500', textColor: 'text-white' },
  'brand_content': { label: '브랜드콘텐츠(광고)', bgColor: 'bg-red-500', textColor: 'text-white' },
  '웹사이트': { label: '웹사이트', bgColor: 'bg-teal-600', textColor: 'text-white' },
  '블로그': { label: '블로그', bgColor: 'bg-red-600', textColor: 'text-white' },
  '카페': { label: '카페', bgColor: 'bg-blue-600', textColor: 'text-white' },
  '스마트스토어': { label: '스마트스토어', bgColor: 'bg-orange-500', textColor: 'text-white' },
  '쇼핑': { label: '쇼핑', bgColor: 'bg-pink-600', textColor: 'text-white' },
  'AI 섹션': { label: 'AI', bgColor: 'bg-purple-600', textColor: 'text-white' },
  'AI': { label: 'AI', bgColor: 'bg-purple-600', textColor: 'text-white' },
  'AI 추천': { label: 'AI', bgColor: 'bg-purple-600', textColor: 'text-white' },
  '플레이스': { label: '플레이스', bgColor: 'bg-cyan-600', textColor: 'text-white' },
  '뉴스': { label: '뉴스', bgColor: 'bg-gray-500', textColor: 'text-white' },
  '이미지': { label: '이미지', bgColor: 'bg-teal-600', textColor: 'text-white' },
  '동영상': { label: '동영상', bgColor: 'bg-purple-600', textColor: 'text-white' },
  '지식인': { label: '지식인', bgColor: 'bg-yellow-500', textColor: 'text-black' },
  '지식백과': { label: '백과', bgColor: 'bg-amber-600', textColor: 'text-white' },
  '어학사전': { label: '사전', bgColor: 'bg-blue-500', textColor: 'text-white' },
  '인플루언서': { label: '인플루언서', bgColor: 'bg-rose-600', textColor: 'text-white' },
  '포스트': { label: '포스트', bgColor: 'bg-lime-600', textColor: 'text-white' },
  '인기글': { label: '인기글', bgColor: 'bg-amber-500', textColor: 'text-white' },
  '채용정보': { label: '채용', bgColor: 'bg-indigo-500', textColor: 'text-white' },
  '도서': { label: '도서', bgColor: 'bg-emerald-600', textColor: 'text-white' },
};

export default function ResultsTable({ results, onKeywordClick }: ResultsTableProps) {
  // 전체 결과에서 최대 순위 개수 계산
  const maxRanks = Math.max(...results.map(r => r.top_results?.length || 0), 10);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-dark-card border-b border-dark-border">
            <th className="px-4 py-3 text-left font-medium text-dark-muted whitespace-nowrap sticky left-0 bg-dark-card">키워드</th>
            <th className="px-3 py-3 text-center font-medium text-dark-muted whitespace-nowrap">PC</th>
            <th className="px-3 py-3 text-center font-medium text-dark-muted whitespace-nowrap">모바일</th>
            <th className="px-3 py-3 text-center font-medium text-dark-muted whitespace-nowrap">월 검색량</th>
            <th className="px-3 py-3 text-center font-medium text-dark-muted whitespace-nowrap">월 발행수</th>
            <th className="px-3 py-3 text-center font-medium text-dark-muted whitespace-nowrap">파워링크</th>
            <th className="px-3 py-3 text-center font-medium text-dark-muted whitespace-nowrap">AI추천</th>
            <th className="px-3 py-3 text-left font-medium text-dark-muted whitespace-nowrap min-w-[200px]">섹션순서</th>
            {/* 동적으로 순위 컬럼 생성 */}
            {Array.from({ length: maxRanks }, (_, i) => (
              <th key={i} className="px-2 py-3 text-center font-medium text-dark-muted whitespace-nowrap">
                {i + 1}위
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((result, index) => {
            const searchVolume = result.search_volume;
            const aiInfo: AIRecommendation | undefined = result.ai_recommendation;
            const _adInfo: AdInfo | undefined = result.ad_info; // 향후 사용 예정
            const sectionOrder: SectionOrder[] = result.section_order || [];
            void _adInfo; // unused variable 경고 제거

            return (
              <tr
                key={result.keyword}
                className={`border-b border-dark-border hover:bg-dark-hover transition ${
                  index % 2 === 0 ? 'bg-dark-bg' : 'bg-dark-card/30'
                }`}
              >
                {/* 키워드 */}
                <td className="px-4 py-3 font-medium text-white whitespace-nowrap sticky left-0 bg-inherit">
                  {result.error ? (
                    <span className="text-red-400">{result.keyword}</span>
                  ) : onKeywordClick ? (
                    <button
                      onClick={() => onKeywordClick(result.keyword)}
                      className="text-naver-green hover:text-green-400 underline underline-offset-2 decoration-naver-green/50 hover:decoration-green-400 cursor-pointer transition font-medium text-left"
                      title={`"${result.keyword}" 단일 키워드 조회로 이동`}
                    >
                      {result.keyword}
                    </button>
                  ) : (
                    result.keyword
                  )}
                </td>

                {/* PC 조회수 */}
                <td className="px-3 py-3 text-center text-gray-300">
                  {formatNumber(searchVolume?.pc)}
                </td>

                {/* 모바일 조회수 */}
                <td className="px-3 py-3 text-center text-gray-300">
                  {formatNumber(searchVolume?.mobile)}
                </td>

                {/* 월 검색량 */}
                <td className="px-3 py-3 text-center text-gray-300 font-medium">
                  {formatNumber(searchVolume?.total)}
                </td>

                {/* 월 발행수 */}
                <td className="px-3 py-3 text-center text-orange-400">
                  {searchVolume?.monthly_blog_count != null
                    ? formatNumber(searchVolume.monthly_blog_count)
                    : <span className="text-gray-500">-</span>
                  }
                </td>

                {/* 파워링크 */}
                <td className="px-3 py-3 text-center">
                  {result.ad_count > 0 ? (
                    <span className="text-red-400 font-medium">{result.ad_count}개</span>
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </td>

                {/* AI 추천 */}
                <td className="px-3 py-3 text-center">
                  {aiInfo?.exists ? (
                    <div className="flex flex-col items-center">
                      <span className={`text-xs px-2 py-1 rounded ${
                        aiInfo.position === '상단' ? 'bg-purple-600 text-white' :
                        aiInfo.position === '중간' ? 'bg-yellow-600 text-white' :
                        'bg-gray-600 text-white'
                      }`}>
                        {aiInfo.section_index}번째
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </td>

                {/* 섹션 순서 */}
                <td className="px-3 py-3 text-left">
                  {sectionOrder.length > 0 ? (
                    <div className="flex flex-nowrap gap-1 overflow-x-auto whitespace-nowrap">
                      {sectionOrder.map((sec, idx) => {
                        const sectionConfig = sectionTypeLabels[sec.type] || { label: sec.type, bgColor: 'bg-gray-700', textColor: 'text-gray-200' };
                        return (
                          <span
                            key={idx}
                            className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${sectionConfig.bgColor} ${sectionConfig.textColor}`}
                          >
                            {sec.order}.{sectionConfig.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>

                {/* 순위별 타입 - 전체 표시 */}
                {Array.from({ length: maxRanks }, (_, i) => {
                  const rank = i + 1;
                  const item = result.top_results?.find(r => r.rank === rank);
                  const type = item?.type || 'unknown';
                  const config = typeConfig[type] || typeConfig.unknown;

                  return (
                    <td key={rank} className="px-1 py-2 text-center">
                      {item ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={item.title}
                          className={`inline-block px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${config.bgColor} ${config.textColor} hover:opacity-80 transition`}
                        >
                          {config.label}
                        </a>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {results.length === 0 && (
        <div className="text-center py-12 text-dark-muted">
          분석 결과가 없습니다.
        </div>
      )}

      {/* 범례 */}
      <div className="mt-4 p-4 bg-dark-card/50 rounded-lg">
        <h4 className="text-sm font-medium text-dark-muted mb-3">타입 범례</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(typeConfig).filter(([key]) => key !== 'unknown').map(([key, config]) => (
            <span
              key={key}
              className={`inline-block px-2 py-1 rounded text-xs ${config.bgColor} ${config.textColor}`}
            >
              {config.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

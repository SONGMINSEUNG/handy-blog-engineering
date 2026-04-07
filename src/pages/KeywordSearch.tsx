import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import {
  analyzeSERP,
  AnalysisResult,
  SectionOrder,
  parseApiError,
  withRetry,
  restartDriver,
  getBidPrice,
  getNaverAdSettings,
  getRelatedKeywords,
  BidPriceData,
  RelatedKeywordsResponse,
  RelatedKeywordItem,
} from '../services/api';
import BidPriceSection from '../components/BidPrice/BidPriceSection';
import RankBidTable from '../components/BidPrice/RankBidTable';

// 섹션 타입별 색상
const sectionColors: Record<string, string> = {
  '파워링크': 'bg-red-600',
  '브랜드콘텐츠': 'bg-orange-500',
  '브랜드 콘텐츠': 'bg-orange-500',
  'brand_content': 'bg-orange-500',
  'AI 추천': 'bg-purple-600',
  'AI 섹션': 'bg-purple-600',
  'AI': 'bg-purple-600',
  'VIEW': 'bg-green-600',
  '웹사이트': 'bg-blue-600',
  '블로그': 'bg-green-500',
  '카페': 'bg-blue-500',
  '플레이스': 'bg-cyan-600',
  '쇼핑': 'bg-pink-600',
  '뉴스': 'bg-gray-500',
  '지식인': 'bg-yellow-500',
  '이미지': 'bg-teal-600',
  '동영상': 'bg-red-500',
  '지식백과': 'bg-amber-600',
  '사전': 'bg-indigo-500',
  '어학사전': 'bg-indigo-500',
  '인플루언서': 'bg-rose-600',
  '나무위키': 'bg-green-700',
  '위키백과': 'bg-gray-600',
  '인기글': 'bg-orange-500',
  '채용정보': 'bg-sky-600',
  '학술정보': 'bg-violet-600',
  '지식플러스': 'bg-yellow-600',
  '포스트': 'bg-lime-600',
  '도서': 'bg-amber-700',
};

// 타입별 색상
const typeColors: Record<string, { bg: string; text: string }> = {
  blog: { bg: 'bg-green-600', text: 'text-white' },
  cafe: { bg: 'bg-blue-600', text: 'text-white' },
  kin: { bg: 'bg-yellow-500', text: 'text-black' },
  news: { bg: 'bg-gray-500', text: 'text-white' },
  place: { bg: 'bg-cyan-600', text: 'text-white' },
  shopping: { bg: 'bg-pink-600', text: 'text-white' },
  smartstore: { bg: 'bg-orange-500', text: 'text-white' },
  youtube: { bg: 'bg-red-500', text: 'text-white' },
  naver_tv: { bg: 'bg-green-600', text: 'text-white' },
  namuwiki: { bg: 'bg-green-700', text: 'text-white' },
  wikipedia: { bg: 'bg-gray-600', text: 'text-white' },
  encyclopedia: { bg: 'bg-amber-600', text: 'text-white' },
  webdoc: { bg: 'bg-indigo-600', text: 'text-white' },
  website: { bg: 'bg-teal-600', text: 'text-white' },
  post: { bg: 'bg-lime-600', text: 'text-white' },
  influencer: { bg: 'bg-rose-600', text: 'text-white' },
  brand_content: { bg: 'bg-orange-500', text: 'text-white' },
  recruit: { bg: 'bg-sky-600', text: 'text-white' },
};

const typeLabels: Record<string, string> = {
  blog: '블로그',
  cafe: '카페',
  kin: '지식인',
  news: '뉴스',
  place: '플레이스',
  shopping: '쇼핑',
  smartstore: '스마트스토어',
  youtube: '유튜브',
  naver_tv: 'TV',
  namuwiki: '나무위키',
  wikipedia: '위키',
  encyclopedia: '백과',
  webdoc: '웹문서',
  website: '홈페이지',
  post: '포스트',
  influencer: '인플루언서',
  brand_content: '브랜드 콘텐츠',
  recruit: '채용정보',
};

// 영문 섹션 타입을 한글로 변환하는 매핑
const sectionTypeToKorean: Record<string, string> = {
  'VIEW': '웹사이트',
  'brand_content': '브랜드 콘텐츠',
  '브랜드콘텐츠': '브랜드 콘텐츠',
};

// 에러 상태 타입
interface ErrorState {
  message: string;
  errorCode: string;
  retryable: boolean;
}

interface KeywordSearchProps {
  onOpenSettings?: () => void;
}

function KeywordSearch({ onOpenSettings }: KeywordSearchProps) {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRestarting, setIsRestarting] = useState(false);

  // 입찰가 관련 상태
  const [bidPriceData, setBidPriceData] = useState<BidPriceData | null>(null);
  const [bidPriceLoading, setBidPriceLoading] = useState(false);
  const [bidPriceError, setBidPriceError] = useState<string | null>(null);
  const [isApiConfigured, setIsApiConfigured] = useState(false);

  // 연관 키워드 관련 상태
  const [relatedKeywords, setRelatedKeywords] = useState<RelatedKeywordsResponse | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);

  // 연관 키워드 토글 (localStorage 저장)
  const [relatedEnabled, setRelatedEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('relatedKeywordsEnabled');
    return saved !== null ? saved === 'true' : true;
  });

  // API 설정 상태 확인
  useEffect(() => {
    getNaverAdSettings()
      .then((data) => {
        setIsApiConfigured(data.is_configured);
      })
      .catch(() => {
        setIsApiConfigured(false);
      });
  }, []);

  // 입찰가 조회 함수
  const fetchBidPrice = useCallback(async (searchKeyword: string) => {
    if (!isApiConfigured || !searchKeyword.trim()) return;

    setBidPriceLoading(true);
    setBidPriceError(null);

    try {
      const data = await getBidPrice(searchKeyword.trim());
      setBidPriceData(data);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setBidPriceError(parsed.message);
    } finally {
      setBidPriceLoading(false);
    }
  }, [isApiConfigured]);

  // 연관 키워드 조회 함수
  const fetchRelatedKeywords = useCallback(async (searchKeyword: string) => {
    if (!isApiConfigured || !searchKeyword.trim()) return;

    setRelatedLoading(true);
    setRelatedError(null);

    try {
      const data = await getRelatedKeywords(searchKeyword.trim());
      setRelatedKeywords(data);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setRelatedError(parsed.message);
    } finally {
      setRelatedLoading(false);
    }
  }, [isApiConfigured]);

  // 연관 키워드 토글 변경 핸들러
  const handleRelatedToggle = useCallback((enabled: boolean) => {
    setRelatedEnabled(enabled);
    localStorage.setItem('relatedKeywordsEnabled', String(enabled));
  }, []);

  // 입찰가 새로고침 핸들러
  const handleBidPriceRefresh = useCallback(async () => {
    if (keyword.trim()) {
      await fetchBidPrice(keyword);
    }
  }, [keyword, fetchBidPrice]);

  // 설정 모달 열기 핸들러
  const handleOpenSettings = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings();
    }
  }, [onOpenSettings]);

  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) {
      setError({
        message: '키워드를 입력해주세요.',
        errorCode: 'VALIDATION_ERROR',
        retryable: false,
      });
      return;
    }

    setLoading(true);
    setError(null);
    setRetryCount(0);
    setBidPriceError(null);

    try {
      const response = await withRetry(
        () => analyzeSERP([keyword.trim()]),
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt) => {
            setRetryCount(attempt);
            console.log(`[Retry] 재시도 ${attempt}/3...`);
          },
        }
      );
      if (response.results && response.results.length > 0) {
        setResult(response.results[0]);
        // 검색 성공 시 입찰가 조회
        fetchBidPrice(keyword.trim());
        // 연관 키워드는 토글 ON일 때만 조회
        if (relatedEnabled) {
          fetchRelatedKeywords(keyword.trim());
        }
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError({
        message: parsed.message,
        errorCode: parsed.errorCode,
        retryable: parsed.retryable,
      });
    } finally {
      setLoading(false);
      setRetryCount(0);
    }
  }, [keyword, fetchBidPrice, fetchRelatedKeywords, relatedEnabled]);

  // 브라우저 재시작 핸들러
  const handleRestartDriver = useCallback(async () => {
    setIsRestarting(true);
    try {
      await restartDriver();
      setError(null);
      // 재시작 후 자동으로 검색 재시도
      if (keyword.trim()) {
        handleSearch();
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError({
        message: `브라우저 재시작 실패: ${parsed.message}`,
        errorCode: parsed.errorCode,
        retryable: false,
      });
    } finally {
      setIsRestarting(false);
    }
  }, [keyword, handleSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }, [handleSearch]);

  // 필터링된 섹션 순서 (memoized)
  const filteredSectionOrder = useMemo(() => {
    if (!result?.section_order) return [];
    return result.section_order.filter((section: SectionOrder) => {
      if (section.type === 'unknown') return false;
      const specialSections = ['웹사이트', 'VIEW', '블로그', '카페', 'AI', 'AI 추천', 'AI 섹션', '지식백과', '위키백과', '나무위키', '인플루언서', '어학사전', '사전'];
      return (section.count !== undefined && section.count > 0) ||
             specialSections.includes(section.type) ||
             (section.detail && (section.detail['블로그'] > 0 || section.detail['카페'] > 0 || section.detail['홈페이지'] > 0));
    });
  }, [result?.section_order]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">키워드 조회</h1>

      {/* 검색 입력 */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="검색 키워드 입력..."
          className="flex-1 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-dark-muted focus:outline-none focus:border-naver-green"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-3 naver-gradient text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
        >
          {loading ? '분석 중...' : '조회'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500 rounded-lg mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-red-400 font-medium">{error.message}</p>
              {error.errorCode && error.errorCode !== 'VALIDATION_ERROR' && (
                <p className="text-red-400/70 text-sm mt-1">
                  오류 코드: {error.errorCode}
                </p>
              )}
            </div>
            <div className="flex gap-2 ml-4">
              {error.retryable && (
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="px-3 py-1.5 bg-red-500/30 hover:bg-red-500/50 text-red-300 text-sm rounded transition"
                >
                  다시 시도
                </button>
              )}
              {(error.errorCode === 'WEBDRIVER_SESSION_EXPIRED' ||
                error.errorCode === 'WEBDRIVER_NOT_INITIALIZED' ||
                error.errorCode === 'WEBDRIVER_ERROR') && (
                <button
                  onClick={handleRestartDriver}
                  disabled={isRestarting}
                  className="px-3 py-1.5 bg-blue-500/30 hover:bg-blue-500/50 text-blue-300 text-sm rounded transition"
                >
                  {isRestarting ? '재시작 중...' : '브라우저 재시작'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && !result && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-naver-green border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-dark-muted text-sm">
            {retryCount > 0 ? `재시도 중... (${retryCount}/3)` : '검색 중...'}
          </p>
        </div>
      )}

      {result && (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-dark-bg/70 rounded-lg backdrop-blur-sm">
              <div className="w-12 h-12 border-4 border-naver-green border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-dark-muted text-sm">
                {retryCount > 0 ? `재시도 중... (${retryCount}/3)` : '검색 중...'}
              </p>
            </div>
          )}
          <div className="space-y-6">
          {/* 기본 정보 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">기본 정보</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-dark-bg rounded-lg">
                <div className="text-dark-muted text-sm mb-1 whitespace-nowrap">월간 검색량</div>
                <div className="text-2xl font-bold text-naver-green whitespace-nowrap">
                  {result.search_volume?.total?.toLocaleString() || '-'}
                </div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg">
                <div className="text-dark-muted text-sm mb-1 whitespace-nowrap">PC 검색량</div>
                <div className="text-xl font-medium whitespace-nowrap">
                  {result.search_volume?.pc?.toLocaleString() || '-'}
                </div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg">
                <div className="text-dark-muted text-sm mb-1 whitespace-nowrap">모바일 검색량</div>
                <div className="text-xl font-medium whitespace-nowrap">
                  {result.search_volume?.mobile?.toLocaleString() || '-'}
                </div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg">
                <div className="text-dark-muted text-sm mb-1 whitespace-nowrap">파워링크 광고</div>
                <div className="text-xl font-medium text-red-400 whitespace-nowrap">
                  {result.ad_count}개
                </div>
              </div>
            </div>
          </div>

          {/* 입찰가 정보 */}
          <BidPriceSection
            data={bidPriceData}
            loading={bidPriceLoading}
            error={bidPriceError}
            isApiConfigured={isApiConfigured}
            onRefresh={handleBidPriceRefresh}
            onOpenSettings={handleOpenSettings}
          />

          {/* 순위별 평균 입찰가 */}
          <RankBidTable
            data={bidPriceData}
            loading={bidPriceLoading}
            isApiConfigured={isApiConfigured}
          />

          {/* 섹션 순서 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">
              섹션 순서
              {result.ai_recommendation?.exists && (
                <span className="ml-3 text-sm px-2 py-1 bg-purple-600 rounded whitespace-nowrap">
                  AI 추천 {result.ai_recommendation.section_index}번째
                </span>
              )}
            </h2>
            {/* 타입 범례 */}
            <div className="flex flex-nowrap gap-1.5 mb-3 overflow-x-auto pb-1" style={{ maxWidth: '100%' }}>
              {Array.from(new Set(filteredSectionOrder.map((s: SectionOrder) => s.type))).map((type: string) => {
                const displayType = sectionTypeToKorean[type] || type;
                const color = sectionColors[type] || sectionColors[displayType] || 'bg-gray-600';
                return (
                  <span key={type} className={`${color} text-white text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap`}>
                    {displayType}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-2" style={{ maxWidth: '100%' }}>
              {filteredSectionOrder.map((section: SectionOrder, idx: number) => {
                const isAI = section.type.includes('AI');
                const isPowerLink = section.type === '파워링크';
                const isWebsite = section.type === '웹사이트' || section.type === 'VIEW';
                const displayType = sectionTypeToKorean[section.type] || section.type;
                const color = sectionColors[section.type] || sectionColors[displayType] || 'bg-gray-600';
                return (
                  <div
                    key={idx}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap ${color} ${
                      isAI ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-dark-bg' : ''
                    } ${isPowerLink ? 'border-2 border-red-300' : ''}`}
                  >
                    <span className="w-5 h-5 flex items-center justify-center bg-black/20 rounded-full text-xs font-bold">
                      {section.order}
                    </span>
                    <span className="font-medium text-sm whitespace-nowrap">{displayType}</span>
                    {/* 파워링크는 갯수를 더 눈에 띄게 표시 */}
                    {isPowerLink && section.count !== undefined && section.count > 0 && (
                      <span className="ml-1 px-2 py-0.5 bg-white/20 rounded font-bold text-sm whitespace-nowrap">
                        {section.count}개
                      </span>
                    )}
                    {/* 웹사이트는 블로그/카페/홈페이지 상세 표시 - "(블로그 3, 카페 2, 홈페이지 1)" 형식 */}
                    {isWebsite && section.detail && (section.detail['블로그'] > 0 || section.detail['카페'] > 0 || section.detail['홈페이지'] > 0) && (
                      <span className="ml-1 text-sm opacity-90 whitespace-nowrap">
                        ({[
                          section.detail['블로그'] > 0 ? `블로그 ${section.detail['블로그']}` : null,
                          section.detail['카페'] > 0 ? `카페 ${section.detail['카페']}` : null,
                          section.detail['홈페이지'] > 0 ? `홈페이지 ${section.detail['홈페이지']}` : null
                        ].filter(Boolean).join(', ')})
                      </span>
                    )}
                    {/* 기타 섹션의 갯수 - 제거됨 (사용자 요청) */}
                    {/* 괄호와 숫자 없이 순수 섹션명만 표시 */}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 상위노출 순서 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">상위노출 순서</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="px-4 py-2 text-left text-dark-muted w-20">순위</th>
                    <th className="px-4 py-2 text-left text-dark-muted w-20">전체</th>
                    <th className="px-4 py-2 text-left text-dark-muted w-24">타입</th>
                    <th className="px-4 py-2 text-left text-dark-muted">제목</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    if (!result.top_results) return null;

                    // 섹션 그룹 키 결정: blog/cafe/website/smartstore -> '웹사이트', 나머지 -> typeLabels
                    const getSectionKey = (type: string) => {
                      if (['blog', 'cafe', 'website', 'smartstore'].includes(type)) return '웹사이트';
                      return typeLabels[type] || type;
                    };

                    // 섹션별로 그룹화 (등장 순서 유지)
                    const groupOrder: string[] = [];
                    const groups: Record<string, typeof result.top_results> = {};

                    for (const item of result.top_results) {
                      const key = getSectionKey(item.type);
                      if (!groups[key]) {
                        groups[key] = [];
                        groupOrder.push(key);
                      }
                      groups[key].push(item);
                    }

                    return groupOrder.map((sectionKey) => {
                      const items = groups[sectionKey];
                      // 섹션 색상
                      const firstItem = items[0];
                      const isViewType = ['blog', 'cafe', 'website', 'smartstore'].includes(firstItem.type);
                      const sectionBgColor = isViewType ? 'bg-blue-600' : (typeColors[firstItem.type]?.bg || 'bg-gray-600');

                      return (
                        <React.Fragment key={sectionKey}>
                          {/* 그룹 헤더 */}
                          <tr className="bg-dark-bg/50">
                            <td colSpan={4} className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs ${sectionBgColor} text-white font-medium whitespace-nowrap`}>
                                  {sectionKey}
                                </span>
                                <span className="text-dark-muted text-xs whitespace-nowrap">
                                  {items.length}개
                                </span>
                              </div>
                            </td>
                          </tr>
                          {/* 그룹 내 항목 */}
                          {items.map((item, idx) => {
                            const color = typeColors[item.type] || { bg: 'bg-gray-600', text: 'text-white' };
                            const label = typeLabels[item.type] || item.type;
                            const sectionRank = item.section_rank != null ? item.section_rank : (idx + 1);
                            return (
                              <tr key={`${sectionKey}-${idx}`} className="border-b border-dark-border/30 hover:bg-dark-hover">
                                <td className="px-4 py-3 font-bold text-naver-green">
                                  {sectionRank}위
                                </td>
                                <td className="px-4 py-3 text-dark-muted text-xs">
                                  {item.rank}위
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded text-xs ${color.bg} ${color.text} whitespace-nowrap`}>
                                    {label}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:underline"
                                  >
                                    {item.title || '(제목 없음)'}
                                  </a>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* 콘텐츠별 개수 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">콘텐츠별 개수</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(result.section_counts || {}).map(([type, count]) => {
                const color = typeColors[type] || { bg: 'bg-gray-600', text: 'text-white' };
                const label = typeLabels[type] || type;
                return (
                  <div
                    key={type}
                    className={`px-4 py-2 rounded-lg ${color.bg} ${color.text} whitespace-nowrap`}
                  >
                    <span className="font-medium whitespace-nowrap">{label}</span>
                    <span className="ml-2 opacity-80 whitespace-nowrap">{count}개</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 연관 키워드 */}
          {isApiConfigured && (
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">
                    연관 키워드
                    {relatedKeywords && !relatedLoading && relatedEnabled && (
                      <span className="ml-2 text-sm font-normal text-dark-muted">
                        ({relatedKeywords.total_count}개)
                      </span>
                    )}
                  </h2>
                  {/* 토글 스위치 */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={relatedEnabled}
                      onChange={(e) => handleRelatedToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-dark-border rounded-full peer peer-checked:bg-naver-green peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    <span className="ml-2 text-sm text-dark-muted">
                      {relatedEnabled ? 'ON' : 'OFF'}
                    </span>
                  </label>
                </div>
                {relatedKeywords && !relatedLoading && relatedEnabled && (
                  <button
                    onClick={() => fetchRelatedKeywords(keyword.trim())}
                    className="text-sm text-dark-muted hover:text-white transition"
                  >
                    새로고침
                  </button>
                )}
              </div>

              {relatedEnabled && relatedLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-3 border-naver-green border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-3 text-dark-muted text-sm">연관 키워드 조회 중...</span>
                </div>
              )}

              {relatedEnabled && relatedError && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                  <p className="text-red-400 text-sm">{relatedError}</p>
                </div>
              )}

              {relatedEnabled && relatedKeywords && !relatedLoading && !relatedError && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-border">
                        <th className="px-4 py-2 text-left text-dark-muted w-12">#</th>
                        <th className="px-4 py-2 text-left text-dark-muted">키워드</th>
                        <th className="px-4 py-2 text-right text-dark-muted">PC 검색량</th>
                        <th className="px-4 py-2 text-right text-dark-muted">모바일 검색량</th>
                        <th className="px-4 py-2 text-right text-dark-muted">총 검색량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatedKeywords.related_keywords.map((item: RelatedKeywordItem, idx: number) => {
                        // 상위 10% 키워드에 하이라이트
                        const topThreshold = Math.max(1, Math.floor(relatedKeywords.related_keywords.length * 0.1));
                        const isTop = idx < topThreshold;
                        // 원본 키워드와 동일한 경우 강조
                        const isOriginal = item.keyword.replace(/\s/g, '') === keyword.trim().replace(/\s/g, '');

                        return (
                          <tr
                            key={idx}
                            className={`border-b border-dark-border/30 hover:bg-dark-hover ${
                              isOriginal ? 'bg-naver-green/10' : isTop ? 'bg-yellow-500/5' : ''
                            }`}
                          >
                            <td className="px-4 py-2.5 text-dark-muted">{idx + 1}</td>
                            <td className="px-4 py-2.5">
                              <span className={`${isOriginal ? 'text-naver-green font-bold' : isTop ? 'text-yellow-400 font-medium' : 'text-white'}`}>
                                {item.keyword}
                              </span>
                              {isOriginal && (
                                <span className="ml-2 text-xs px-1.5 py-0.5 bg-naver-green/20 text-naver-green rounded">
                                  현재
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {item.pc_search?.toLocaleString() ?? '-'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {item.mobile_search?.toLocaleString() ?? '-'}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono font-medium ${
                              isTop ? 'text-yellow-400' : 'text-naver-green'
                            }`}>
                              {item.total_search?.toLocaleString() ?? '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {relatedEnabled && !relatedKeywords && !relatedLoading && !relatedError && (
                <p className="text-dark-muted text-sm text-center py-4">
                  키워드 검색 후 연관 키워드가 표시됩니다.
                </p>
              )}

              {!relatedEnabled && (
                <p className="text-dark-muted text-sm text-center py-4">
                  연관 키워드 기능이 꺼져 있습니다.
                </p>
              )}
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(KeywordSearch);

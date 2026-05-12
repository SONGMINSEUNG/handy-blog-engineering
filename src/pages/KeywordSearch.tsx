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
  splitKeyword,
  BidPriceData,
  RelatedKeywordsResponse,
  RelatedKeywordItem,
  TopResult,
} from '../services/api';
import BidPriceSection from '../components/BidPrice/BidPriceSection';
import RankBidTable from '../components/BidPrice/RankBidTable';

// 섹션 타입별 색상
const sectionColors: Record<string, string> = {
  '파워링크': 'bg-red-600',
  '인기글': 'bg-emerald-500',
  '브랜드콘텐츠': 'bg-red-500',
  '브랜드콘텐츠 (광고)': 'bg-red-500',
  '브랜드 콘텐츠': 'bg-red-500',
  'brand_content': 'bg-red-500',
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
  clip: { bg: 'bg-pink-500', text: 'text-white' },
  ai: { bg: 'bg-violet-500', text: 'text-white' },
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
  clip: '영상',
  ai: 'AI',
  namuwiki: '나무위키',
  wikipedia: '위키',
  encyclopedia: '백과',
  webdoc: '웹문서',
  website: '홈페이지',
  post: '포스트',
  influencer: '인플루언서',
  brand_content: '브랜드콘텐츠 (광고)',
  recruit: '채용정보',
};

// 영문 섹션 타입을 한글로 변환하는 매핑
const sectionTypeToKorean: Record<string, string> = {
  'VIEW': '웹사이트',
  'brand_content': '브랜드콘텐츠 (광고)',
  '브랜드콘텐츠': '브랜드콘텐츠 (광고)',
  '브랜드 콘텐츠': '브랜드콘텐츠 (광고)',
  '인기글': '인기글',
};

// 관련 키워드를 입력 키워드와의 관련도 순으로 정렬하는 함수
// 1순위: 입력 키워드로 시작하거나 정확히 일치 (뒤에 뭔가 붙은 것) -> 검색량순
// 2순위: 입력 키워드 앞에 뭔가 붙은 것 (입력 키워드를 포함하지만 시작이 아님) -> 검색량순
// 3순위: 입력 키워드의 일부 단어만 포함 -> 검색량순
// 4순위: 나머지 -> 검색량순
function sortRelatedKeywordsByRelevance(
  keywords: RelatedKeywordItem[],
  inputKeyword: string,
  externalSplitWords?: string[]
): RelatedKeywordItem[] {
  const input = inputKeyword.trim().toLowerCase();
  if (!input) return keywords;

  // 공백 제거 버전 (숏폼대행 vs 숏폼 대행 매칭용)
  const inputNoSpace = input.replace(/\s+/g, '');
  // 공백으로 나눈 단어들 (Kiwi 분리 결과가 있으면 우선 사용)
  const inputSplitWords = externalSplitWords && externalSplitWords.length > 1
    ? externalSplitWords.map(w => w.toLowerCase())
    : input.split(/\s+/).filter(w => w.length > 0);

  // 입력의 연속 부분문자열 생성 (최소 2글자)
  // 예: "숏폼대행" -> ["숏폼", "폼대", "대행", "숏폼대", "폼대행", "숏폼대행"]
  const inputSubstrings: string[] = [];
  for (let len = 2; len <= inputNoSpace.length; len++) {
    for (let start = 0; start <= inputNoSpace.length - len; start++) {
      inputSubstrings.push(inputNoSpace.substring(start, start + len));
    }
  }

  function getGroup(item: RelatedKeywordItem): number {
    const kw = item.keyword.toLowerCase().trim();
    const kwNoSpace = kw.replace(/\s+/g, '');
    const kwSplitWords = kw.split(/\s+/).filter(w => w.length > 0);

    // 1순위: 키워드가 입력으로 시작 (뒤에 뭔가 더 붙은 확장형) 또는 정확히 일치
    // 예: "숏폼대행" -> "숏폼대행업체", "숏폼대행가격" (kwNoSpace가 inputNoSpace로 시작)
    // 예: "숏폼대행" -> "숏폼대행" 자체 (정확히 일치)
    if (kwNoSpace.startsWith(inputNoSpace)) return 1;

    // 2순위: 키워드가 입력을 포함 (앞에 뭔가 붙음)
    // 예: "인스타숏폼대행" contains "숏폼대행"
    if (kwNoSpace.includes(inputNoSpace)) return 2;

    // 3순위: 부분 매칭 - 아래 중 하나라도 해당:
    // a) 키워드(공백제거)가 입력(공백제거)의 부분문자열 (예: "숏폼"은 "숏폼대행"의 부분)
    if (inputNoSpace.includes(kwNoSpace) && kwNoSpace.length >= 2) return 3;

    // b) 입력의 각 단어(공백 분리)가 키워드에 포함
    if (inputSplitWords.length > 1) {
      const hasInputWordMatch = inputSplitWords.some(word => {
        const wordNoSpace = word.replace(/\s+/g, '');
        return wordNoSpace.length >= 2 && kwNoSpace.includes(wordNoSpace);
      });
      if (hasInputWordMatch) return 3;
    }

    // c) 키워드의 각 단어가 입력에 포함
    if (kwSplitWords.length > 1) {
      const hasKwWordMatch = kwSplitWords.some(word => {
        const wordNoSpace = word.replace(/\s+/g, '');
        return wordNoSpace.length >= 2 && inputNoSpace.includes(wordNoSpace);
      });
      if (hasKwWordMatch) return 3;
    }

    // d) 입력의 연속 부분문자열이 키워드에 포함 (예: "숏폼대행"의 부분문자열 "숏폼", "대행"이 키워드에 포함)
    const hasSubstringMatch = inputSubstrings.some(sub => kwNoSpace.includes(sub));
    if (hasSubstringMatch) return 3;

    // 4순위: 나머지
    return 4;
  }

  // 3순위 내에서 매칭 단어 수 계산
  function getMatchCount(item: RelatedKeywordItem): number {
    const kw = item.keyword.toLowerCase().replace(/\s+/g, '');
    return inputSplitWords.filter(word => kw.includes(word)).length;
  }

  return [...keywords].sort((a, b) => {
    const groupA = getGroup(a);
    const groupB = getGroup(b);
    if (groupA !== groupB) return groupA - groupB;

    // 3순위 내에서 매칭 단어 수 내림차순 정렬
    if (groupA === 3 && groupA === groupB) {
      const matchA = getMatchCount(a);
      const matchB = getMatchCount(b);
      if (matchA !== matchB) return matchB - matchA;
    }

    // 같은 그룹/같은 매칭 수 내에서는 총 검색량 내림차순
    return (b.total_search ?? 0) - (a.total_search ?? 0);
  });
}

// 범용어 리스트 (핵심 키워드 판별용)
const GENERIC_WORDS = new Set([
  '블로그', '대행', '마케팅', '업체', '가격', '비용', '추천', '순위',
  '방법', '후기', '사이트', '서비스', '전문', '관리', '운영', '제작',
  '광고', '홍보', '상위노출', '최적화', '컨설팅', '에이전시', '회사',
  '견적', '프로그램', '솔루션', '플랫폼', '채널', '콘텐츠', '포스팅',
  '키워드', '검색', '온라인', '디지털', '소셜', '바이럴', '브랜딩',
  '매체', '원고', '기획', '분석', '리포트', '효과', '전략', '성과',
  '트래픽', '노출', '유입', '전환', '최저가', '무료', '이벤트',
  '인스타', '인스타그램', '유튜브', '틱톡', '페이스북', '네이버',
  '카카오', 'sns', 'seo',
]);

// 핵심 키워드 찾기: 범용어 필터링 + 출현 빈도 역수 방식
function findCoreKeyword(
  inputKeyword: string,
  relatedKeywords: RelatedKeywordItem[],
  externalSplitWords?: string[]
): { keyword: string; reason: string } | null {
  // Kiwi 분리 결과가 있으면 우선 사용, 없으면 공백 분리
  const words = externalSplitWords && externalSplitWords.length > 1
    ? externalSplitWords
    : inputKeyword.trim().split(/\s+/);
  if (words.length < 2) return null;

  // 1단계: 범용어 필터링
  const coreWords = words.filter(w => !GENERIC_WORDS.has(w.toLowerCase()));

  // 범용어 제거 후 남은 단어가 핵심
  if (coreWords.length > 0) {
    const coreKeyword = coreWords.join(' ');

    // 2단계: 남은 단어가 2개 이상이면 출현 빈도 역수로 순위
    if (coreWords.length >= 2 && relatedKeywords.length > 0) {
      const wordFreq: Record<string, number> = {};
      for (const word of coreWords) {
        const wLower = word.toLowerCase();
        wordFreq[wLower] = relatedKeywords.filter(rk =>
          rk.keyword.toLowerCase().includes(wLower)
        ).length;
      }
      // 출현 빈도 낮은 순 (= 더 특수한 단어) 정렬
      const sorted = [...coreWords].sort((a, b) =>
        (wordFreq[a.toLowerCase()] || 0) - (wordFreq[b.toLowerCase()] || 0)
      );
      return { keyword: sorted[0], reason: `연관 키워드 ${relatedKeywords.length}개 중 ${wordFreq[sorted[0].toLowerCase()] || 0}개에만 등장` };
    }

    return { keyword: coreKeyword, reason: '범용어 제외 핵심 주제어' };
  }

  // 모든 단어가 범용어면 출현 빈도 역수로 판별
  if (relatedKeywords.length > 0) {
    const wordFreq: Record<string, number> = {};
    for (const word of words) {
      const wLower = word.toLowerCase();
      wordFreq[wLower] = relatedKeywords.filter(rk =>
        rk.keyword.toLowerCase().includes(wLower)
      ).length;
    }
    const sorted = [...words].sort((a, b) =>
      (wordFreq[a.toLowerCase()] || 0) - (wordFreq[b.toLowerCase()] || 0)
    );
    return { keyword: sorted[0], reason: `가장 특수한 주제어 (${wordFreq[sorted[0].toLowerCase()] || 0}/${relatedKeywords.length}개 등장)` };
  }

  return null;
}

// 에러 상태 타입
interface ErrorState {
  message: string;
  errorCode: string;
  retryable: boolean;
}

interface KeywordSearchProps {
  onOpenSettings?: () => void;
  initialKeyword?: string;
  onInitialKeywordConsumed?: () => void;
}

function KeywordSearch({ onOpenSettings, initialKeyword, onInitialKeywordConsumed }: KeywordSearchProps) {
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

  // Kiwi 형태소 분리 결과 (공백 없는 키워드용)
  const [splitWords, setSplitWords] = useState<string[]>([]);

  // 연관 키워드 관련 상태
  const [relatedKeywords, setRelatedKeywords] = useState<RelatedKeywordsResponse | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);

  // 연관 키워드 정렬 상태
  const [relatedSortKey, setRelatedSortKey] = useState<'relevance' | 'pc_search' | 'mobile_search' | 'total_search'>('relevance');
  const [relatedSortDir, setRelatedSortDir] = useState<'asc' | 'desc'>('desc');

  // 연관 키워드 클릭 시 자동 검색용
  const [pendingSearch, setPendingSearch] = useState<string>('');

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

  // 키워드 변경 시 Kiwi 형태소 분리 (공백 없는 키워드만)
  useEffect(() => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setSplitWords([]);
      return;
    }

    // 공백이 이미 있으면 Kiwi 불필요 — 공백 분리 사용
    if (trimmed.includes(' ')) {
      setSplitWords(trimmed.split(/\s+/));
      return;
    }

    // 공백 없는 키워드: 300ms 디바운스 후 Kiwi API 호출
    const timer = setTimeout(async () => {
      try {
        const words = await splitKeyword(trimmed);
        // Kiwi가 2개 이상으로 분리했을 때만 사용
        if (words.length >= 2) {
          setSplitWords(words);
        } else {
          setSplitWords([trimmed]);
        }
      } catch {
        // 실패 시 원본 키워드 그대로 사용
        setSplitWords([trimmed]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword]);

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

  // 정렬 적용된 연관 키워드
  const sortedRelatedKeywords = useMemo(() => {
    if (!relatedKeywords?.related_keywords) return [];
    if (relatedSortKey === 'relevance') {
      return sortRelatedKeywordsByRelevance(relatedKeywords.related_keywords, keyword, splitWords);
    }
    const sorted = [...relatedKeywords.related_keywords].sort((a, b) => {
      const valA = a[relatedSortKey] ?? 0;
      const valB = b[relatedSortKey] ?? 0;
      return relatedSortDir === 'desc' ? valB - valA : valA - valB;
    });
    return sorted;
  }, [relatedKeywords, keyword, splitWords, relatedSortKey, relatedSortDir]);

  // 핵심 키워드 탐지
  const coreKeyword = useMemo(() => {
    if (!relatedKeywords?.related_keywords || !keyword) return null;
    return findCoreKeyword(keyword, relatedKeywords.related_keywords, splitWords);
  }, [relatedKeywords, keyword, splitWords]);

  // 연관 키워드 토글 변경 핸들러
  const handleRelatedToggle = useCallback((enabled: boolean) => {
    setRelatedEnabled(enabled);
    localStorage.setItem('relatedKeywordsEnabled', String(enabled));
  }, []);

  // 연관 키워드 컬럼 정렬 핸들러
  const handleRelatedSort = useCallback((key: 'relevance' | 'pc_search' | 'mobile_search' | 'total_search') => {
    if (relatedSortKey === key) {
      setRelatedSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setRelatedSortKey(key);
      setRelatedSortDir('desc');
    }
  }, [relatedSortKey]);

  // 정렬 화살표 표시
  const getSortArrow = useCallback((key: 'relevance' | 'pc_search' | 'mobile_search' | 'total_search') => {
    if (relatedSortKey !== key) return '';
    return relatedSortDir === 'desc' ? ' ▼' : ' ▲';
  }, [relatedSortKey, relatedSortDir]);

  // 입찰가 새로고침 핸들러
  const handleBidPriceRefresh = useCallback(async () => {
    if (keyword.trim()) {
      await fetchBidPrice(keyword);
    }
  }, [keyword, fetchBidPrice]);

  // 스크래퍼에서 가져온 실제 입찰가 반영
  const handleScraperDataReceived = useCallback((
    pcBids: { rank: number; bid: number }[],
    mobileBids: { rank: number; bid: number }[]
  ) => {
    setBidPriceData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pc_rank_bids: pcBids.length > 0 ? pcBids : prev.pc_rank_bids,
        mobile_rank_bids: mobileBids.length > 0 ? mobileBids : prev.mobile_rank_bids,
        rank_bids_estimated: false,
        rank_bids_source: 'scraper',
      };
    });
  }, []);

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

  // 연관 키워드 클릭 시 자동 검색
  useEffect(() => {
    if (pendingSearch && pendingSearch.trim()) {
      setPendingSearch('');
      handleSearch();
    }
  }, [keyword, pendingSearch]); // keyword가 업데이트된 후 실행

  // 대량 조회에서 키워드 클릭으로 넘어온 경우 자동 검색
  useEffect(() => {
    if (initialKeyword && initialKeyword.trim()) {
      const searchKeyword = initialKeyword.trim();
      setKeyword(searchKeyword);

      // 즉시 검색 실행 (setTimeout 없이 직접 실행하여 cleanup 취소 문제 방지)
      setLoading(true);
      setError(null);
      setRetryCount(0);
      setBidPriceError(null);

      // consumed 콜백은 검색 시작 후 호출하여 타이밍 이슈 방지
      onInitialKeywordConsumed?.();

      withRetry(
        () => analyzeSERP([searchKeyword]),
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt: number) => {
            setRetryCount(attempt);
          },
        }
      )
        .then(async (response) => {
          if (response.results && response.results.length > 0) {
            setResult(response.results[0]);

            // API 설정 상태를 최신으로 확인한 뒤 입찰가/연관키워드 조회
            try {
              const settings = await getNaverAdSettings();
              if (settings.is_configured) {
                getBidPrice(searchKeyword).then(setBidPriceData).catch((err: unknown) => {
                  const parsed = parseApiError(err);
                  setBidPriceError(parsed.message);
                });
                if (relatedEnabled) {
                  setRelatedLoading(true);
                  getRelatedKeywords(searchKeyword).then(setRelatedKeywords).catch((err: unknown) => {
                    const parsed = parseApiError(err);
                    setRelatedError(parsed.message);
                  }).finally(() => setRelatedLoading(false));
                }
              }
            } catch {
              // API 설정 확인 실패 시 무시
            }
          }
        })
        .catch((err: unknown) => {
          const parsed = parseApiError(err);
          setError({
            message: parsed.message,
            errorCode: parsed.errorCode,
            retryable: parsed.retryable,
          });
        })
        .finally(() => {
          setLoading(false);
          setRetryCount(0);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKeyword]);

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
          className="flex-1 px-4 py-3 bg-gray-50 dark:bg-[#0f0f0f] border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-naver-green"
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
        <div className="flex flex-col items-center justify-center" style={{minHeight: 'calc(100vh - 300px)'}}>
          <div className="w-12 h-12 border-4 border-naver-green border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-900 dark:text-gray-400 text-sm">
            {retryCount > 0 ? `재시도 중... (${retryCount}/3)` : '검색 중...'}
          </p>
        </div>
      )}

      {result && (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 dark:bg-[#0f0f0f]/70 rounded-lg backdrop-blur-sm">
              <div className="w-12 h-12 border-4 border-naver-green border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-900 dark:text-gray-400 text-sm">
                {retryCount > 0 ? `재시도 중... (${retryCount}/3)` : '검색 중...'}
              </p>
            </div>
          )}
          <div className="space-y-6">
          {/* 기본 정보 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">기본 정보</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg">
                <div className="text-gray-900 dark:text-gray-400 text-sm mb-1 whitespace-nowrap">월간 검색량</div>
                <div className="text-2xl font-bold text-naver-green whitespace-nowrap">
                  {result.search_volume?.total?.toLocaleString() || '-'}
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg">
                <div className="text-gray-900 dark:text-gray-400 text-sm mb-1 whitespace-nowrap">PC 검색량</div>
                <div className="text-xl font-medium whitespace-nowrap">
                  {result.search_volume?.pc?.toLocaleString() || '-'}
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg">
                <div className="text-gray-900 dark:text-gray-400 text-sm mb-1 whitespace-nowrap">모바일 검색량</div>
                <div className="text-xl font-medium whitespace-nowrap">
                  {result.search_volume?.mobile?.toLocaleString() || '-'}
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg">
                <div className="text-gray-900 dark:text-gray-400 text-sm mb-1 whitespace-nowrap">파워링크 광고</div>
                <div className="text-xl font-medium text-red-400 whitespace-nowrap">
                  {result.ad_count}개
                </div>
              </div>
            </div>
            {/* 추가 정보: 월 발행수 */}
            {result.search_volume?.monthly_blog_count != null && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg">
                  <div className="text-gray-900 dark:text-gray-400 text-sm mb-1 whitespace-nowrap">월 발행수</div>
                  <div className="text-xl font-medium text-orange-400 whitespace-nowrap">
                    {result.search_volume.monthly_blog_count.toLocaleString()}건
                  </div>
                  <div className="text-gray-900 dark:text-gray-400 text-[10px] mt-1">최근 1개월 블로그 글</div>
                </div>
              </div>
            )}
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
            onScraperDataReceived={handleScraperDataReceived}
          />

          {/* 섹션 순서 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">
              섹션 순서
              {result.ai_recommendation?.exists && (
                <span className="ml-3 text-sm px-2 py-1 bg-purple-600 text-white rounded whitespace-nowrap">
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
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap text-white ${color} ${
                      isAI ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#0f0f0f]' : ''
                    } ${isPowerLink ? 'border-2 border-red-300' : ''}`}
                  >
                    <span className="w-5 h-5 flex items-center justify-center bg-black/20 rounded-full text-xs font-bold text-white">
                      {section.order}
                    </span>
                    <span className="font-medium text-sm whitespace-nowrap text-white">{displayType}</span>
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


          {/* 상위노출 블로그 키워드 빈도 분석 */}
          {result.top_blog_keyword_analysis && result.top_blog_keyword_analysis.length > 0 && (() => {
            const analysis = result.top_blog_keyword_analysis!;
            // 키워드 목록 추출 (첫 번째 항목의 키워드 키 사용)
            const keywordKeys = Object.keys(analysis[0].keyword_counts);
            // 각 키워드별 평균 계산
            const averages: Record<string, number> = {};
            for (const key of keywordKeys) {
              const sum = analysis.reduce((acc, item) => acc + (item.keyword_counts[key] || 0), 0);
              averages[key] = Math.round((sum / analysis.length) * 10) / 10;
            }
            return (
              <div className="glass-card p-6">
                <h2 className="text-lg font-semibold mb-4">
                  상위노출 블로그 키워드 빈도
                  <span className="ml-2 text-sm text-gray-900 dark:text-gray-400 font-normal">
                    상위 {analysis.length}개 블로그 본문 분석
                  </span>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-400 w-16">#</th>
                        <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-400">블로그</th>
                        {keywordKeys.map((key) => (
                          <th key={key} className="px-4 py-2 text-center text-gray-900 dark:text-gray-400 whitespace-nowrap">
                            {key}
                          </th>
                        ))}
                        <th className="px-4 py-2 text-right text-gray-900 dark:text-gray-400">글자수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.map((item) => (
                        <tr key={item.rank} className="border-b border-gray-200/30 dark:border-gray-700/30 hover:bg-gray-100 dark:hover:bg-[#252525]">
                          <td className="px-4 py-3 font-bold text-naver-green whitespace-nowrap">
                            {item.rank}위
                            {item.is_ad && (
                              <span className="ml-1 text-[10px] px-1 py-0.5 bg-red-500/20 text-red-400 rounded">광고</span>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline truncate block"
                              title={item.title}
                            >
                              {item.title ? (item.title.length > 25 ? item.title.slice(0, 25) + '...' : item.title) : '(제목 없음)'}
                            </a>
                          </td>
                          {keywordKeys.map((key) => {
                            const count = item.keyword_counts[key] || 0;
                            const avg = averages[key];
                            const isAboveAvg = count >= avg;
                            return (
                              <td key={key} className="px-4 py-3 text-center">
                                <span className={`font-mono font-medium ${
                                  count === 0 ? 'text-gray-900 dark:text-gray-400' : isAboveAvg ? 'text-naver-green' : 'text-gray-900 dark:text-gray-100'
                                }`}>
                                  {count}
                                </span>
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-400">
                            {item.content_length.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {/* 평균 행 */}
                      <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-[#0f0f0f]/50">
                        <td className="px-4 py-3 font-bold text-amber-600 dark:text-yellow-400" colSpan={2}>
                          평균
                        </td>
                        {keywordKeys.map((key) => (
                          <td key={key} className="px-4 py-3 text-center font-mono font-bold text-amber-600 dark:text-yellow-400">
                            {averages[key]}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-600 dark:text-yellow-400">
                          {Math.round(analysis.reduce((acc, item) => acc + item.content_length, 0) / analysis.length).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-gray-900 dark:text-gray-400 text-xs mt-3">
                  * 상위노출 블로그 본문에서 키워드가 등장한 횟수입니다. (공백 무관 매칭)
                </p>
              </div>
            );
          })()}

          {/* 상위노출 순서 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">상위노출 순서</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-400 w-20">순위</th>
                    <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-400 w-24">타입</th>
                    <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-400">제목</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    if (!result.top_results) return null;

                    // 섹션 그룹 키 결정
                    const getSectionKey = (item: TopResult) => {
                      if (item.section) {
                        // "웹사이트 영역 N"은 "웹사이트 영역"으로 통일 (연속이면 합쳐지고, 중간에 다른 게 있으면 분리)
                        if (item.section.startsWith('웹사이트 영역')) return '웹사이트 영역';
                        return item.section;
                      }
                      if (item.type === 'news') return '뉴스';
                      if (item.type === 'kin') return '지식iN';
                      if (item.type === 'place') return '플레이스';
                      if (item.type === 'clip') return '네이버 클립';
                      if (item.type === 'shopping' || item.type === 'smartstore') return '쇼핑';
                      if (item.type === 'youtube' || item.type === 'naver_tv') return '동영상';
                      return '웹사이트 영역';
                    };

                    // 섹션별로 그룹화 (연속된 같은 섹션은 합치고, 중간에 다른 게 있으면 분리)
                    const groupOrder: string[] = [];
                    const groups: Record<string, typeof result.top_results> = {};
                    let lastKey = '';

                    for (const item of result.top_results) {
                      let key = getSectionKey(item);
                      // 이전 섹션과 같으면 같은 그룹에 추가
                      if (key === lastKey) {
                        groups[groupOrder[groupOrder.length - 1]].push(item);
                      } else {
                        // 새 그룹 생성 (같은 이름이 이전에 있었으면 번호 붙이기)
                        let uniqueKey = key;
                        let counter = 2;
                        while (groups[uniqueKey]) {
                          uniqueKey = key + ' ' + counter;
                          counter++;
                        }
                        groups[uniqueKey] = [item];
                        groupOrder.push(uniqueKey);
                        lastKey = key;
                      }
                    }

                    return groupOrder.map((sectionKey) => {
                      const items = groups[sectionKey];
                      // 섹션 색상
                      const firstItem = items[0];
                      // 섹션별 색상
                      let sectionBgColor = 'bg-gray-600';
                      if (sectionKey.startsWith('블로그 탭')) sectionBgColor = 'bg-emerald-600';
                      else if (sectionKey === '브랜드콘텐츠') sectionBgColor = 'bg-red-600';
                      else if (sectionKey === '웹사이트 영역') sectionBgColor = 'bg-blue-600';
                      else if (sectionKey === '플레이스') sectionBgColor = 'bg-orange-600';
                      else if (sectionKey === 'AI 검색') sectionBgColor = 'bg-violet-600';
                      else if (sectionKey === '네이버 클립') sectionBgColor = 'bg-pink-600';
                      else if (sectionKey === '쇼핑') sectionBgColor = 'bg-yellow-600';
                      else if (sectionKey === '뉴스') sectionBgColor = 'bg-purple-600';
                      else if (sectionKey === '동영상') sectionBgColor = 'bg-pink-600';
                      else if (sectionKey === '지식iN') sectionBgColor = 'bg-amber-600';
                      else sectionBgColor = sectionColors[sectionKey] || typeColors[firstItem.type]?.bg || 'bg-gray-600';

                      return (
                        <React.Fragment key={sectionKey}>
                          {/* 그룹 헤더 */}
                          <tr className="bg-gray-50/50 dark:bg-[#0f0f0f]/50">
                            <td colSpan={3} className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs ${sectionBgColor} text-white font-medium whitespace-nowrap`}>
                                  {sectionKey.replace(/ \d+$/, '')}
                                </span>
                                <span className="text-gray-900 dark:text-gray-400 text-xs whitespace-nowrap">
                                  {items.length}개
                                </span>
                              </div>
                            </td>
                          </tr>
                          {/* 그룹 내 항목 */}
                          {items.map((item, idx) => {
                            const color = typeColors[item.type] || { bg: 'bg-gray-600', text: 'text-white' };
                            const label = typeLabels[item.type] || item.type;
                            return (
                              <tr key={`${sectionKey}-${idx}`} className="border-b border-gray-200/30 dark:border-gray-700/30 hover:bg-gray-100 dark:hover:bg-[#252525]">
                                <td className="px-4 py-3 text-gray-900 dark:text-gray-400 text-xs">
                                  {item.rank}위
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded text-xs ${color.bg} ${color.text} whitespace-nowrap`}>
                                    {label}
                                  </span>
                                  {item.is_ad && (
                                    <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 whitespace-nowrap">
                                      광고
                                    </span>
                                  )}
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
                      <span className="ml-2 text-sm font-normal text-gray-900 dark:text-gray-400">
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
                    <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-naver-green peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    <span className="ml-2 text-sm text-gray-900 dark:text-gray-400">
                      {relatedEnabled ? 'ON' : 'OFF'}
                    </span>
                  </label>
                </div>
                {relatedKeywords && !relatedLoading && relatedEnabled && (
                  <button
                    onClick={() => fetchRelatedKeywords(keyword.trim())}
                    className="text-sm text-gray-900 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition"
                  >
                    새로고침
                  </button>
                )}
              </div>

              {relatedEnabled && relatedLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-3 border-naver-green border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-3 text-gray-900 dark:text-gray-400 text-sm">연관 키워드 조회 중...</span>
                </div>
              )}

              {relatedEnabled && relatedError && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                  <p className="text-red-400 text-sm">{relatedError}</p>
                </div>
              )}

              {relatedEnabled && relatedKeywords && !relatedLoading && !relatedError && coreKeyword && (
                <div className="mb-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500 text-white">
                    핵심 키워드
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{coreKeyword.keyword}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">({coreKeyword.reason})</span>
                </div>
              )}

              {relatedEnabled && relatedKeywords && !relatedLoading && !relatedError && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th
                          className="px-4 py-2 text-left text-gray-900 dark:text-gray-400 w-12 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          onClick={() => handleRelatedSort('relevance')}
                        >#{getSortArrow('relevance')}</th>
                        <th
                          className="px-4 py-2 text-left text-gray-900 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          onClick={() => handleRelatedSort('relevance')}
                        >키워드{getSortArrow('relevance') ? '' : ''}</th>
                        <th
                          className="px-4 py-2 text-right text-gray-900 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          onClick={() => handleRelatedSort('pc_search')}
                        >PC 검색량{getSortArrow('pc_search')}</th>
                        <th
                          className="px-4 py-2 text-right text-gray-900 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          onClick={() => handleRelatedSort('mobile_search')}
                        >모바일 검색량{getSortArrow('mobile_search')}</th>
                        <th
                          className="px-4 py-2 text-right text-gray-900 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          onClick={() => handleRelatedSort('total_search')}
                        >월 검색량{getSortArrow('total_search')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRelatedKeywords.map((item: RelatedKeywordItem, idx: number) => {
                        // 상위 10% 키워드에 하이라이트
                        const topThreshold = Math.max(1, Math.floor(sortedRelatedKeywords.length * 0.1));
                        const isTop = idx < topThreshold;
                        // 원본 키워드와 동일한 경우 강조
                        const isOriginal = item.keyword.replace(/\s/g, '') === keyword.trim().replace(/\s/g, '');

                        return (
                          <tr
                            key={idx}
                            className={`border-b border-gray-200/30 dark:border-gray-700/30 hover:bg-gray-100 dark:hover:bg-[#252525] ${
                              isOriginal ? 'bg-naver-green/10' : isTop ? 'bg-yellow-500/5' : ''
                            }`}
                          >
                            <td className="px-4 py-2.5 text-gray-900 dark:text-gray-400">{idx + 1}</td>
                            <td className="px-4 py-2.5">
                              {isOriginal ? (
                                <span className="text-naver-green font-bold">
                                  {item.keyword}
                                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-naver-green/20 text-naver-green rounded">
                                    현재
                                  </span>
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setKeyword(item.keyword);
                                    setPendingSearch(item.keyword);
                                  }}
                                  className={`${isTop ? 'text-amber-600 dark:text-yellow-400 font-medium' : 'text-gray-900 dark:text-gray-100'} hover:text-naver-green hover:underline cursor-pointer bg-transparent border-none p-0 text-left`}
                                >
                                  {item.keyword}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {item.pc_search?.toLocaleString() ?? '-'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {item.mobile_search?.toLocaleString() ?? '-'}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono font-medium ${
                              isTop ? 'text-amber-600 dark:text-yellow-400' : 'text-naver-green'
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
                <p className="text-gray-900 dark:text-gray-400 text-sm text-center py-4">
                  키워드 검색 후 연관 키워드가 표시됩니다.
                </p>
              )}

              {!relatedEnabled && (
                <p className="text-gray-900 dark:text-gray-400 text-sm text-center py-4">
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

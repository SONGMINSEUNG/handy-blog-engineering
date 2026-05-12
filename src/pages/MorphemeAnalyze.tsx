import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { analyzeMorpheme, MorphemeResult, FoundKeyword, analyzeTopContents, TopContentItem, TopContentAnalysisResult, fetchBlogContent, splitKeyword } from '../services/api';
import { ImagePreviewGrid } from '../components/ImagePreviewGrid';

// OG 링크 미리보기 블록 제거 (도메인 라인 + 인접 제목/설명)
function removeOgLinkBlocks(text: string): string {
  const lines = text.split('\n');
  const domainPattern = /^[a-zA-Z0-9][\w.\-]*\.(com|co\.kr|net|org|kr|io|me|dev)\s*$/;

  const domainIndices = new Set<number>();
  lines.forEach((line, i) => {
    if (domainPattern.test(line.trim())) domainIndices.add(i);
  });

  const removeIndices = new Set(domainIndices);
  domainIndices.forEach(di => {
    for (let j = 1; j <= 3; j++) {
      const idx = di - j;
      if (idx < 0) break;
      const stripped = lines[idx].trim();
      if (!stripped) continue;
      if (stripped.endsWith('...')) {
        removeIndices.add(idx);
      } else {
        break;
      }
    }
  });

  return lines.filter((_, i) => !removeIndices.has(i)).join('\n');
}

// HTML 이스케이프 (컴포넌트 외부에 정의하여 호이스팅 문제 방지)
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n+/g, ' ');  // 줄바꿈을 공백 하나로 변환 (문단 붙여서 표시)
};

// 범용어 리스트 (핵심 키워드 판별용 - KeywordSearch.tsx와 동일)
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

export default function MorphemeAnalyze() {
  const [text, setText] = useState('');
  const [targetKeyword, setTargetKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MorphemeResult | null>(null);
  const [pastedImages, setPastedImages] = useState<string[]>([]);
  const [error, setError] = useState('');

  // 서버에서 가져온 이미지 수 (레이지 로딩 보강용)
  const [fetchedImageCount, setFetchedImageCount] = useState<number | null>(null);
  const [fetchingImages, setFetchingImages] = useState(false);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // 키워드 자동 분리 결과 (공백 없는 키워드용)
  const [splitWords, setSplitWords] = useState<string[] | null>(null);

  // 키워드 변경 시 자동 명사 분리 (디바운스 300ms)
  useEffect(() => {
    const trimmed = targetKeyword.trim();

    // 공백이 있거나 비어있으면 분리 불필요
    if (!trimmed || trimmed.includes(' ')) {
      setSplitWords(null);
      return;
    }

    // 2글자 미만이면 분리 불필요
    if (trimmed.length < 2) {
      setSplitWords(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const words = await splitKeyword(trimmed);
        // 분리된 단어가 2개 이상이어야 의미 있음
        if (words.length >= 2) {
          setSplitWords(words);
        } else {
          setSplitWords(null);
        }
      } catch {
        setSplitWords(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [targetKeyword]);

  // 상위노출 블로그 분석 상태
  const [topContentResult, setTopContentResult] = useState<TopContentAnalysisResult | null>(null);
  const [topContentLoading, setTopContentLoading] = useState(false);

  // OG 링크 요소 제거 함수 (네이버 블로그 삽입 링크 미리보기)
  const removeOgLinkElements = useCallback((doc: Document) => {
    const ogLinkSelectors = [
      '.se-oglink',           // 네이버 에디터 OG 링크
      '.se-module-oglink',    // OG 링크 모듈
      '.se-section-oglink',   // OG 링크 섹션
      '.se-linkPreview',      // 링크 미리보기
      '.og_tag',              // OG 태그
      '.link_end',            // 링크 끝
      'a[class*="oglink"]',   // OG 링크 앵커
    ];
    ogLinkSelectors.forEach(sel => {
      doc.querySelectorAll(sel).forEach(el => el.remove());
    });
  }, []);

  // 네이버 블로그 URL 추출 함수
  const extractNaverBlogUrl = useCallback((doc: Document): string | null => {
    // 1. a 태그 href에서 blog.naver.com URL 찾기
    const links = doc.querySelectorAll('a[href]');
    for (const link of Array.from(links)) {
      const href = link.getAttribute('href') || '';
      if (/blog\.naver\.com\/[^?#/]+\/\d+/.test(href)) {
        return href;
      }
    }
    // 2. og:url 메타 태그에서 찾기
    const ogUrl = doc.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      const content = ogUrl.getAttribute('content') || '';
      if (content.includes('blog.naver.com')) {
        return content;
      }
    }
    // 3. HTML 전체에서 blog.naver.com 포스트 URL 패턴 찾기
    const htmlStr = doc.documentElement.innerHTML;
    const blogMatch = htmlStr.match(/https?:\/\/blog\.naver\.com\/[a-zA-Z0-9_]+\/\d+/);
    if (blogMatch) {
      return blogMatch[0];
    }
    return null;
  }, []);

  // 이미지 복붙 핸들러
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const newImages: string[] = [];
    for (const item of Array.from(items)) {
      // 클립보드에서 직접 이미지 파일 감지
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          newImages.push(URL.createObjectURL(file));
        }
      }
      // HTML 붙여넣기에서 이미지 URL 추출 + OG 링크 제거
      if (item.type === 'text/html') {
        item.getAsString((html) => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          // 이미지 URL 추출 (OG 링크 제거 전에 추출)
          const imgs = doc.querySelectorAll('img');
          const urls = Array.from(imgs)
            .map(img => img.getAttribute('data-lazy-src') || img.getAttribute('data-src') || img.src)
            .filter(src => src && src.startsWith('http'));
          if (urls.length > 0) {
            setPastedImages(prev => [...prev, ...urls]);
          }

          // 네이버 블로그 URL 감지 -> 서버에서 전체 이미지 수 가져오기 (레이지 로딩 보강)
          const blogUrl = extractNaverBlogUrl(doc);
          if (blogUrl) {
            // 이전 요청 취소
            if (fetchAbortRef.current) {
              fetchAbortRef.current.abort();
            }
            setFetchingImages(true);
            setFetchedImageCount(null);
            fetchBlogContent(blogUrl)
              .then((result) => {
                setFetchedImageCount(result.image_count);
                setFetchingImages(false);
              })
              .catch((err) => {
                console.warn('블로그 이미지 수 보강 실패:', err);
                setFetchingImages(false);
              });
          }

          // OG 링크 요소 제거 후 텍스트 추출
          removeOgLinkElements(doc);
          const cleanedText = doc.body.textContent || '';

          // textarea에 OG 링크가 제거된 텍스트 삽입
          // 기본 paste 동작을 방지하고 직접 텍스트 설정
          setText(prev => {
            const textarea = document.querySelector('textarea');
            if (textarea) {
              const start = textarea.selectionStart || 0;
              const end = textarea.selectionEnd || 0;
              const before = prev.substring(0, start);
              const after = prev.substring(end);
              return before + cleanedText + after;
            }
            return prev + cleanedText;
          });
        });
        // HTML이 있으면 기본 paste 동작 방지 (OG 링크 제거된 텍스트를 직접 삽입)
        e.preventDefault();
      }
    }

    if (newImages.length > 0) {
      setPastedImages(prev => [...prev, ...newImages]);
    }
    // Let default text paste happen naturally if there is no HTML (plain text only)
  }, [removeOgLinkElements, extractNaverBlogUrl]);

  const removePastedImage = useCallback((index: number) => {
    setPastedImages(prev => {
      const url = prev[index];
      // Revoke object URLs to prevent memory leaks
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleAnalyze = async () => {
    if (!text.trim()) {
      setError('분석할 텍스트를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setTopContentResult(null);

    try {
      const keyword = targetKeyword.trim() || undefined;
      const response = await analyzeMorpheme(text.trim(), keyword);
      setResult(response);

      // 타겟 키워드가 있으면 상위노출 블로그 분석도 실행
      if (keyword) {
        setTopContentLoading(true);
        try {
          const effectiveImageCount = fetchedImageCount !== null
            ? Math.max(fetchedImageCount, pastedImages.length)
            : pastedImages.length;
          const topResult = await analyzeTopContents(keyword, 0, effectiveImageCount, 5);
          setTopContentResult(topResult);
        } catch (topErr: any) {
          console.warn('상위노출 분석 실패:', topErr);
          // 상위노출 분석 실패는 메인 결과에 영향주지 않음
        } finally {
          setTopContentLoading(false);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 금지어/상업성 키워드 하이라이팅
  const highlightedText = useMemo(() => {
    if (!result?.original_text) return '';

    const content = result.original_text;
    const forbidden = result.forbidden_words || [];
    const commercial = result.commercial_words || [];

    // 모든 키워드 위치와 타입 수집
    const markers: Array<{pos: number; len: number; type: 'forbidden' | 'commercial'}> = [];

    forbidden.forEach((f: FoundKeyword) => {
      markers.push({ pos: f.position, len: f.word.length, type: 'forbidden' });
    });
    commercial.forEach((c: FoundKeyword) => {
      markers.push({ pos: c.position, len: c.word.length, type: 'commercial' });
    });

    // 위치순 정렬
    markers.sort((a, b) => a.pos - b.pos);

    // 하이라이팅 적용
    let htmlResult = '';
    let lastPos = 0;

    markers.forEach(m => {
      if (m.pos >= lastPos) {
        // 이전 텍스트 추가 (HTML 이스케이프)
        htmlResult += escapeHtml(content.slice(lastPos, m.pos));
        const word = content.slice(m.pos, m.pos + m.len);
        if (m.type === 'forbidden') {
          htmlResult += `<span class="bg-red-500/30 text-red-300 px-1 rounded">${escapeHtml(word)}</span>`;
        } else {
          htmlResult += `<span class="bg-purple-500/30 text-purple-300 px-1 rounded">${escapeHtml(word)}</span>`;
        }
        lastPos = m.pos + m.len;
      }
    });

    htmlResult += escapeHtml(content.slice(lastPos));
    return htmlResult;
  }, [result?.original_text, result?.forbidden_words, result?.commercial_words]);

  // 띄어쓰기 변형 인식 카운트 함수
  const countWithSpacingVariants = useCallback((text: string, keyword: string): number => {
    if (!text || !keyword) return 0;
    const textLower = text.toLowerCase();
    const noSpaceKeyword = keyword.toLowerCase().replace(/\s+/g, '');
    if (!noSpaceKeyword) return 0;
    // 각 글자 사이에 \s* 삽입 -> "숏폼대행" => "숏\s*폼\s*대\s*행"
    const pattern = noSpaceKeyword.split('').map(c =>
      c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('\\s*');
    const regex = new RegExp(pattern, 'gi');
    const matches = textLower.match(regex);
    return matches ? matches.length : 0;
  }, []);

  // 키워드 세부 횟수 계산
  const keywordDetails = useMemo(() => {
    if (!targetKeyword.trim() || !text.trim()) return null;
    // 공백이 있으면 공백 기준 분리, 없으면 백엔드 형태소 분리 결과 사용
    const trimmed = targetKeyword.trim();
    const words = trimmed.includes(' ')
      ? trimmed.split(/\s+/).filter(w => w.length > 0)
      : (splitWords || []);

    const details: Array<{ word: string; count: number; isFullKeyword: boolean; isCore: boolean }> = [];

    // 전체 키워드 횟수 (띄어쓰기 변형 인식)
    const fullCount = countWithSpacingVariants(text, trimmed);
    details.push({ word: trimmed, count: fullCount, isFullKeyword: true, isCore: false });

    // 개별 단어 횟수 (2단어 이상일 때만, 띄어쓰기 변형 인식)
    if (words.length >= 2) {
      for (const word of words) {
        const count = countWithSpacingVariants(text, word);
        const isCore = !GENERIC_WORDS.has(word.toLowerCase());
        details.push({ word, count, isFullKeyword: false, isCore });
      }
    }

    return details;
  }, [targetKeyword, text, splitWords, countWithSpacingVariants]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">형태소 진단</h1>

      {/* 텍스트 입력 */}
      <div className="glass-card p-6 mb-6">

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-900 dark:text-gray-400 mb-2">
            분석할 텍스트
          </label>
          <textarea
            value={text}
            onChange={(e) => {
              const newText = e.target.value;
              setText(newText);
              if (newText.trim() === '') {
                // 텍스트를 전부 지우면 복붙 이미지도 함께 초기화
                pastedImages.forEach(url => {
                  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
                });
                setPastedImages([]);
                setFetchedImageCount(null);
                setFetchingImages(false);
              }
            }}
            onPaste={handlePaste}
            placeholder="블로그 글을 복사+붙여넣기 하세요. (Tip: 블로그에서 스크롤을 맨 아래까지 내린 후 복사해야 이미지가 모두 포함됩니다)"
            rows={8}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0f0f0f] border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-naver-green resize-none"
          />
          <div className="flex items-center justify-end mt-1">
            {text.length > 0 && (() => {
              // 네이버 에디터 플레이스홀더 제거 (백엔드 morpheme_analyzer._preprocess와 동일)
              const NAVER_PLACEHOLDERS = [
                // 에디터 캡션 플레이스홀더
                '사진 설명을 입력하세요.',
                '동영상 설명을 입력하세요.',
                '파일 설명을 입력하세요.',
                '지도 설명을 입력하세요.',
                '스티커 설명을 입력하세요.',
                '인용구를 입력하세요.',
                '코드 설명을 입력하세요.',
                '표 설명을 입력하세요.',
                '일정 설명을 입력하세요.',
                '링크 설명을 입력하세요.',
                '미디어 설명을 입력하세요.',
                // 에디터 UI
                'AI 활용 설정',
                '출처 입력',
                '본문 기타 기능',
                '본문 폰트 크기 조절',
                '구분선',
                // 이미지 에러
                '존재하지 않는 이미지입니다.',
                '이미지를 불러올 수 없습니다.',
                '이미지가 존재하지 않습니다.',
                '삭제된 이미지입니다.',
                // 블로그 UI (하단)
                '공감한 사람 보러가기',
                '좋아요한 사람 보러가기',
                '이 글에 공감한 블로거',
                '댓글을 입력하세요',
                '서로이웃 추가하기',
                '이웃목록 보기',
                '공유하기',
                '이웃추가',
                '구독하기',
                '스크랩',
                '인쇄',
                'URL 복사',
                '블로그 앱으로 보기',
                '맨 위로',
              ];
              let cleaned = text;
              for (const ph of NAVER_PLACEHOLDERS) {
                cleaned = cleaned.split(ph).join('');
              }
              // 정규식 패턴으로 시스템 메시지/UI 텍스트 제거
              const NAVER_REGEX_PATTERNS = [
                /.{1,10}\s*설명을\s*입력하세요\./g,
                /조회\s*\d+회?/g,
                /조회수\s*\d+회?/g,
                /읽음\s*\d+/g,
                /댓글\s*\d+개?/g,
                /\d+명이\s*이\s*글에\s*공감했습니다/g,
                /로딩\s*중\.{3}/g,
              ];
              for (const pattern of NAVER_REGEX_PATTERNS) {
                cleaned = cleaned.replace(pattern, '');
              }
              // OG 링크 블록 통째로 제거 (도메인 라인 + 위쪽 제목/설명)
              cleaned = removeOgLinkBlocks(cleaned);
              const noSpace = cleaned.replace(/\s/g, '');
              const kr = (noSpace.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
              const en = (noSpace.match(/[a-zA-Z]/g) || []).length;
              const dg = (noSpace.match(/[0-9]/g) || []).length;
              const total = kr + en + dg;
              return (
                <div className="text-xs text-gray-900 dark:text-gray-400">
                  <span>전체: {total.toLocaleString()} | 한글: {kr.toLocaleString()} | 영어: {en.toLocaleString()} | 숫자: {dg.toLocaleString()}</span>
                </div>
              );
            })()}
          </div>

          {/* 붙여넣기된 이미지 프리뷰 */}
          {pastedImages.length > 0 && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-400">
                  붙여넣기된 이미지 ({pastedImages.length}개)
                  {fetchingImages && (
                    <span className="ml-2 text-xs text-naver-green">(서버에서 전체 이미지 수 확인 중...)</span>
                  )}
                  {fetchedImageCount !== null && fetchedImageCount > pastedImages.length && (
                    <span className="ml-2 text-xs text-amber-500">
                      (실제 이미지: {fetchedImageCount}개 - 레이지 로딩으로 {fetchedImageCount - pastedImages.length}개 누락)
                    </span>
                  )}
                  {fetchedImageCount !== null && fetchedImageCount <= pastedImages.length && (
                    <span className="ml-2 text-xs text-green-500">(전체 이미지 확인 완료)</span>
                  )}
                </span>
                <button
                  onClick={() => {
                    pastedImages.forEach(url => {
                      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
                    });
                    setPastedImages([]);
                    setFetchedImageCount(null);
                    setFetchingImages(false);
                  }}
                  className="text-xs text-red-400 hover:text-red-300 transition"
                >
                  전체 삭제
                </button>
              </div>
              <ImagePreviewGrid
                images={pastedImages.map((imgUrl, i) => ({
                  url: imgUrl,
                  alt: `붙여넣기 이미지 ${i + 1}`,
                  onRemove: () => removePastedImage(i),
                }))}
                removable={true}
                maxHeight="max-h-48"
                emptyMessage=""
              />
            </div>
          )}
        </div>

        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-400 mb-2">
              타겟 키워드 (선택)
            </label>
            <input
              type="text"
              value={targetKeyword}
              onChange={(e) => setTargetKeyword(e.target.value)}
              placeholder="분석 대상 키워드..."
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0f0f0f] border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-naver-green"
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="px-6 py-3 naver-gradient text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? '분석 중...' : '분석'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-400 mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center" style={{minHeight: 'calc(100vh - 300px)'}}>
          <div className="w-12 h-12 border-4 border-naver-green border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-6">
          {/* 상위노출 블로그 분석 */}
          {targetKeyword.trim() && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">
                상위노출 블로그 분석: "{targetKeyword}"
              </h2>

              {topContentLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-3 border-naver-green border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-3 text-gray-900 dark:text-gray-400 text-sm">상위노출 블로그 분석 중...</span>
                </div>
              )}

              {topContentResult && !topContentLoading && (
                <>
                  {/* 상위 평균 요약 */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg text-center">
                      <div className="text-lg font-bold text-cyan-400">{topContentResult.averages.keyword_count}</div>
                      <div className="text-xs text-gray-900 dark:text-gray-400">평균 키워드 수</div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg text-center">
                      <div className="text-lg font-bold text-blue-400">{topContentResult.averages.image_count}</div>
                      <div className="text-xs text-gray-900 dark:text-gray-400">평균 사진 수</div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg text-center">
                      <div className="text-lg font-bold text-naver-green">{topContentResult.averages.content_length.toLocaleString()}</div>
                      <div className="text-xs text-gray-900 dark:text-gray-400">평균 글자 수</div>
                    </div>
                  </div>

                  {/* 상위 콘텐츠 테이블 */}
                  {topContentResult.top_contents.length > 0 && (() => {
                    const trimmedKw = targetKeyword.trim();
                    const keywordWords = trimmedKw.includes(' ')
                      ? trimmedKw.split(/\s+/).filter(w => w.length > 0)
                      : (splitWords || []);
                    const hasSubWords = keywordWords.length >= 2;
                    const avgCounts = topContentResult.averages.keyword_counts || {};
                    return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="px-3 py-2 text-left text-gray-900 dark:text-gray-400">순위</th>
                            <th className="px-3 py-2 text-left text-gray-900 dark:text-gray-400">제목</th>
                            <th className="px-3 py-2 text-right text-gray-900 dark:text-gray-400">{targetKeyword.trim()}</th>
                            {hasSubWords && keywordWords.map(w => (
                              <th key={w} className="px-3 py-2 text-right text-gray-900 dark:text-gray-400">{w}</th>
                            ))}
                            <th className="px-3 py-2 text-right text-gray-900 dark:text-gray-400">사진 수</th>
                            <th className="px-3 py-2 text-right text-gray-900 dark:text-gray-400">글자 수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topContentResult.top_contents.map((item: TopContentItem) => (
                            <tr key={item.rank} className="border-b border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-[#252525]">
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                  item.rank <= 3 ? 'bg-naver-green/20 text-naver-green' : 'bg-gray-50 dark:bg-[#0f0f0f] text-gray-900 dark:text-gray-400'
                                }`}>
                                  {item.rank}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:underline line-clamp-1"
                                  title={item.title}
                                >
                                  {item.title || '(제목 없음)'}
                                </a>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className="text-cyan-400 font-medium">{item.keyword_count}</span>
                                <span className="text-gray-900 dark:text-gray-400 text-xs ml-1">회</span>
                              </td>
                              {hasSubWords && keywordWords.map(w => (
                                <td key={w} className="px-3 py-2 text-right">
                                  <span className="text-purple-400 font-medium">{item.keyword_counts?.[w] ?? '-'}</span>
                                  <span className="text-gray-900 dark:text-gray-400 text-xs ml-1">회</span>
                                </td>
                              ))}
                              <td className="px-3 py-2 text-right">
                                <span className="text-blue-400 font-medium">{item.image_count}</span>
                                <span className="text-gray-900 dark:text-gray-400 text-xs ml-1">장</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className="text-gray-900 dark:text-gray-400">{item.content_length.toLocaleString()}</span>
                              </td>
                            </tr>
                          ))}
                          {/* 평균 행 */}
                          <tr className="border-t-2 border-naver-green/30 bg-naver-green/5">
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2 font-medium text-naver-green">상위 평균</td>
                            <td className="px-3 py-2 text-right">
                              <span className="text-naver-green font-bold">{topContentResult.averages.keyword_count}</span>
                              <span className="text-gray-900 dark:text-gray-400 text-xs ml-1">회</span>
                            </td>
                            {hasSubWords && keywordWords.map(w => (
                              <td key={w} className="px-3 py-2 text-right">
                                <span className="text-naver-green font-bold">{avgCounts[w] ?? '-'}</span>
                                <span className="text-gray-900 dark:text-gray-400 text-xs ml-1">회</span>
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right">
                              <span className="text-naver-green font-bold">{topContentResult.averages.image_count}</span>
                              <span className="text-gray-900 dark:text-gray-400 text-xs ml-1">장</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="text-naver-green font-bold">{topContentResult.averages.content_length.toLocaleString()}</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    );
                  })()}

                  {topContentResult.top_contents.length === 0 && (
                    <div className="text-center text-gray-900 dark:text-gray-400 py-4 text-sm">
                      상위노출 블로그 콘텐츠를 찾지 못했습니다.
                    </div>
                  )}
                </>
              )}

              {!topContentResult && !topContentLoading && (
                <div className="text-center text-gray-900 dark:text-gray-400 py-4 text-sm">
                  분석 버튼을 눌러 상위노출 블로그 정보를 확인하세요.
                </div>
              )}
            </div>
          )}

          {/* 요약 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">형태소 분석 요약</h2>

            {/* 글자수 표시 (네이버 방식) */}
            <div className="mb-4 p-3 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg">
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-xl font-bold text-naver-green">
                    {(result.summary?.total ?? result.summary?.char_count_pure ?? text.replace(/\s/g, '').length).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-900 dark:text-gray-400">전체</div>
                </div>
                <div className="text-gray-900 dark:text-gray-400/30">|</div>
                <div className="text-center">
                  <div className="text-xl font-bold text-blue-400">
                    {(result.summary?.korean ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-900 dark:text-gray-400">한글</div>
                </div>
                <div className="text-gray-900 dark:text-gray-400/30">|</div>
                <div className="text-center">
                  <div className="text-xl font-bold text-cyan-400">
                    {(result.summary?.english ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-900 dark:text-gray-400">영어</div>
                </div>
                <div className="text-gray-900 dark:text-gray-400/30">|</div>
                <div className="text-center">
                  <div className="text-xl font-bold text-amber-600 dark:text-yellow-400">
                    {(result.summary?.digit ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-900 dark:text-gray-400">숫자</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg text-center">
                <div className="text-2xl font-bold text-cyan-400">
                  {result.summary?.total_morphemes?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-400">총 형태소</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {result.summary?.unique_nouns || 0}
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-400">고유 명사</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg text-center">
                <div className="text-2xl font-bold text-amber-600 dark:text-yellow-400">
                  {result.summary?.unique_verbs || 0}
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-400">고유 동사</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg text-center">
                <div className="text-2xl font-bold text-red-400">
                  {[...new Set(result.forbidden_words?.map(f => f.word) || [])].length}
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-400">금지어</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {[...new Set(result.commercial_words?.map(c => c.word) || [])].length}
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-400">상업성</div>
              </div>
            </div>
          </div>

          {/* 하이라이팅된 텍스트 + 전체 빈도 분석 (2컬럼 레이아웃) */}
          <div className="grid grid-cols-2 gap-6">
            {/* 왼쪽: 키워드 하이라이트 */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">키워드 하이라이트</h2>

              {((result.forbidden_words?.length ?? 0) > 0 || (result.commercial_words?.length ?? 0) > 0) ? (
                <>
                  {/* 범례 */}
                  <div className="flex gap-4 mb-4 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 bg-red-500/30 rounded"></span>
                      <span className="text-red-300">금지어 ({result.forbidden_words?.length || 0}개)</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 bg-purple-500/30 rounded"></span>
                      <span className="text-purple-300">상업성 키워드 ({result.commercial_words?.length || 0}개)</span>
                    </span>
                  </div>

                  {/* 발견된 키워드 목록 */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {result.forbidden_words && result.forbidden_words.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-red-400 mb-2">금지어</h4>
                        <div className="flex flex-wrap gap-1">
                          {[...new Set(result.forbidden_words.map(f => f.word))].map((word, i) => (
                            <span key={i} className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs">
                              {word}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.commercial_words && result.commercial_words.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-purple-400 mb-2">상업성 키워드</h4>
                        <div className="flex flex-wrap gap-1">
                          {[...new Set(result.commercial_words.map(c => c.word))].map((word, i) => (
                            <span key={i} className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                              {word}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 본문 (하이라이팅 적용) */}
                  <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg max-h-96 overflow-y-auto">
                    <div
                      className="text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: highlightedText }}
                    />
                  </div>
                </>
              ) : (
                <div className="p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg max-h-96 overflow-y-auto">
                  <div className="text-sm leading-relaxed text-gray-900 dark:text-gray-400">
                    금지어나 상업성 키워드가 발견되지 않았습니다.
                  </div>
                  <div
                    className="text-sm leading-relaxed mt-2"
                    dangerouslySetInnerHTML={{ __html: escapeHtml(result.original_text || '') }}
                  />
                </div>
              )}
            </div>

            {/* 오른쪽: 전체 빈도 분석 */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">전체 빈도 분석</h2>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-[#1a1a1a]">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-2 text-left text-gray-900 dark:text-gray-400">순위</th>
                      <th className="px-3 py-2 text-left text-gray-900 dark:text-gray-400">단어</th>
                      <th className="px-3 py-2 text-right text-gray-900 dark:text-gray-400">횟수</th>
                      <th className="px-3 py-2 text-right text-gray-900 dark:text-gray-400">비율</th>
                      <th className="px-3 py-2 text-left text-gray-900 dark:text-gray-400">빈도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.all_freq?.slice(0, 30).map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-[#252525]">
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium">{item.word}</td>
                        <td className="px-3 py-2 text-right">{item.count}</td>
                        <td className="px-3 py-2 text-right text-naver-green">
                          {item.ratio?.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2">
                          <div className="w-full h-2 bg-gray-50 dark:bg-[#0f0f0f] rounded-full overflow-hidden">
                            <div
                              className="h-full naver-gradient rounded-full"
                              style={{ width: `${Math.min(item.ratio * 5, 100)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 키워드 제안 (타겟 키워드가 있는 경우) */}
          {result.keyword_suggestions && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">
                키워드 분석: "{targetKeyword}"
              </h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-gray-900 dark:text-gray-400 mb-2">키워드 밀도</div>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold text-naver-green">
                      {result.keyword_suggestions.keyword_density?.toFixed(2) || 0}%
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-gray-50 dark:bg-[#0f0f0f] rounded-full overflow-hidden">
                        <div
                          className="h-full naver-gradient rounded-full"
                          style={{
                            width: `${Math.min(result.keyword_suggestions.keyword_density * 10, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-900 dark:text-gray-400 mt-2">
                    출현 횟수: {result.keyword_suggestions.keyword_positions?.length || 0}회
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-900 dark:text-gray-400 mb-2">개선 제안</div>
                  {result.keyword_suggestions.improvement_tips?.length > 0 ? (
                    <ul className="space-y-2">
                      {result.keyword_suggestions.improvement_tips.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-amber-600 dark:text-yellow-400">*</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-green-400">좋은 키워드 밀도입니다!</div>
                  )}
                </div>
              </div>
            </div>
          )}



        </div>
      )}

      {/* 키워드 상세 분석 (개별 단어 횟수) - 텍스트와 키워드만 입력하면 실시간 표시 */}
      {text.trim() && targetKeyword.trim() && keywordDetails && keywordDetails.length > 0 && (
        <div className="glass-card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">키워드 상세 분석</h2>
          <div className="space-y-2">
            {keywordDetails.map((detail, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between px-4 py-2.5 rounded-lg ${
                  detail.isFullKeyword
                    ? 'bg-naver-green/10 border border-naver-green/30'
                    : detail.isCore
                      ? 'bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/40'
                      : 'bg-gray-50 dark:bg-[#0f0f0f] border border-gray-200 dark:border-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    "{detail.word}"
                  </span>
                  {detail.isFullKeyword && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-naver-green/20 text-naver-green font-medium">
                      전체
                    </span>
                  )}
                  {!detail.isFullKeyword && detail.isCore && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">
                      핵심
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-lg font-bold ${
                    detail.isFullKeyword
                      ? 'text-naver-green'
                      : detail.isCore
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-gray-900 dark:text-gray-300'
                  }`}>
                    {detail.count}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">회</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

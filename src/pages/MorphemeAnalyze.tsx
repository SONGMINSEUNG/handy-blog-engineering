import { useState, useMemo, useCallback } from 'react';
import { analyzeMorpheme, MorphemeResult, FoundKeyword } from '../services/api';
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

export default function MorphemeAnalyze() {
  const [text, setText] = useState('');
  const [targetKeyword, setTargetKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MorphemeResult | null>(null);
  const [pastedImages, setPastedImages] = useState<string[]>([]);
  const [error, setError] = useState('');

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
  }, [removeOgLinkElements]);

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

    try {
      const response = await analyzeMorpheme(text.trim(), targetKeyword.trim() || undefined);
      setResult(response);
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">형태소 진단</h1>

      {/* 텍스트 입력 */}
      <div className="glass-card p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-dark-muted mb-2">
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
              }
            }}
            onPaste={handlePaste}
            placeholder="분석할 텍스트를 입력하세요... (이미지 붙여넣기도 가능합니다)"
            rows={8}
            className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-dark-muted focus:outline-none focus:border-naver-green resize-none"
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
                <div className="text-xs text-dark-muted">
                  <span>전체: {total.toLocaleString()} | 한글: {kr.toLocaleString()} | 영어: {en.toLocaleString()} | 숫자: {dg.toLocaleString()}</span>
                </div>
              );
            })()}
          </div>

          {/* 붙여넣기된 이미지 프리뷰 */}
          {pastedImages.length > 0 && (
            <div className="mt-3 p-3 bg-dark-bg rounded-lg border border-dark-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-dark-muted">
                  붙여넣기된 이미지 ({pastedImages.length}개)
                </span>
                <button
                  onClick={() => {
                    pastedImages.forEach(url => {
                      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
                    });
                    setPastedImages([]);
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
            <label className="block text-sm font-medium text-dark-muted mb-2">
              타겟 키워드 (선택)
            </label>
            <input
              type="text"
              value={targetKeyword}
              onChange={(e) => setTargetKeyword(e.target.value)}
              placeholder="분석 대상 키워드..."
              className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-dark-muted focus:outline-none focus:border-naver-green"
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
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-naver-green border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-6">
          {/* 요약 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">형태소 분석 요약</h2>

            {/* 글자수 표시 (네이버 방식) */}
            <div className="mb-4 p-3 bg-dark-bg rounded-lg">
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-xl font-bold text-naver-green">
                    {(result.summary?.total ?? result.summary?.char_count_pure ?? text.replace(/\s/g, '').length).toLocaleString()}
                  </div>
                  <div className="text-xs text-dark-muted">전체</div>
                </div>
                <div className="text-dark-muted/30">|</div>
                <div className="text-center">
                  <div className="text-xl font-bold text-blue-400">
                    {(result.summary?.korean ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-dark-muted">한글</div>
                </div>
                <div className="text-dark-muted/30">|</div>
                <div className="text-center">
                  <div className="text-xl font-bold text-cyan-400">
                    {(result.summary?.english ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-dark-muted">영어</div>
                </div>
                <div className="text-dark-muted/30">|</div>
                <div className="text-center">
                  <div className="text-xl font-bold text-yellow-400">
                    {(result.summary?.digit ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-dark-muted">숫자</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-4">
              <div className="p-4 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold text-cyan-400">
                  {result.summary?.total_morphemes?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-dark-muted">총 형태소</div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {result.summary?.unique_nouns || 0}
                </div>
                <div className="text-sm text-dark-muted">고유 명사</div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {result.summary?.unique_verbs || 0}
                </div>
                <div className="text-sm text-dark-muted">고유 동사</div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold text-red-400">
                  {[...new Set(result.forbidden_words?.map(f => f.word) || [])].length}
                </div>
                <div className="text-sm text-dark-muted">금지어</div>
              </div>
              <div className="p-4 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {[...new Set(result.commercial_words?.map(c => c.word) || [])].length}
                </div>
                <div className="text-sm text-dark-muted">상업성</div>
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
                  <div className="p-4 bg-dark-bg rounded-lg max-h-96 overflow-y-auto">
                    <div
                      className="text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: highlightedText }}
                    />
                  </div>
                </>
              ) : (
                <div className="p-4 bg-dark-bg rounded-lg max-h-96 overflow-y-auto">
                  <div className="text-sm leading-relaxed text-dark-muted">
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
                  <thead className="sticky top-0 bg-dark-card">
                    <tr className="border-b border-dark-border">
                      <th className="px-3 py-2 text-left text-dark-muted">순위</th>
                      <th className="px-3 py-2 text-left text-dark-muted">단어</th>
                      <th className="px-3 py-2 text-right text-dark-muted">횟수</th>
                      <th className="px-3 py-2 text-right text-dark-muted">비율</th>
                      <th className="px-3 py-2 text-left text-dark-muted">빈도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.all_freq?.slice(0, 30).map((item, idx) => (
                      <tr key={idx} className="border-b border-dark-border/50 hover:bg-dark-hover">
                        <td className="px-3 py-2 text-dark-muted">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium">{item.word}</td>
                        <td className="px-3 py-2 text-right">{item.count}</td>
                        <td className="px-3 py-2 text-right text-naver-green">
                          {item.ratio?.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2">
                          <div className="w-full h-2 bg-dark-bg rounded-full overflow-hidden">
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
                  <div className="text-sm text-dark-muted mb-2">키워드 밀도</div>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold text-naver-green">
                      {result.keyword_suggestions.keyword_density?.toFixed(2) || 0}%
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-dark-bg rounded-full overflow-hidden">
                        <div
                          className="h-full naver-gradient rounded-full"
                          style={{
                            width: `${Math.min(result.keyword_suggestions.keyword_density * 10, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-dark-muted mt-2">
                    출현 횟수: {result.keyword_suggestions.keyword_positions?.length || 0}회
                  </div>
                </div>
                <div>
                  <div className="text-sm text-dark-muted mb-2">개선 제안</div>
                  {result.keyword_suggestions.improvement_tips?.length > 0 ? (
                    <ul className="space-y-2">
                      {result.keyword_suggestions.improvement_tips.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-yellow-400">*</span>
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

          {/* 주제별 분류 */}
          {result.topics && result.topics.length > 0 && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">주제별 분류</h2>
              <div className="space-y-4">
                {result.topics.map((topic, idx) => (
                  <div key={idx} className="p-4 bg-dark-bg rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{topic.topic}</span>
                      <span className="text-sm text-dark-muted">점수: {topic.score}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {topic.matched_keywords?.map((kw, kidx) => (
                        <span
                          key={kidx}
                          className="px-2 py-1 bg-naver-green/20 text-naver-green rounded text-sm"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 명사 빈도 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">
              명사 빈도 (상위 30개)
            </h2>
            <div className="flex flex-wrap gap-2">
              {result.noun_freq?.slice(0, 30).map((item, idx) => {
                // 빈도에 따라 크기/색상 조절
                const size =
                  idx < 5 ? 'text-lg font-bold' :
                  idx < 10 ? 'text-base font-semibold' :
                  idx < 20 ? 'text-sm font-medium' :
                  'text-xs';
                const opacity =
                  idx < 5 ? 'opacity-100' :
                  idx < 10 ? 'opacity-90' :
                  idx < 20 ? 'opacity-70' :
                  'opacity-50';

                return (
                  <span
                    key={idx}
                    className={`px-3 py-1.5 bg-blue-600/20 text-blue-300 rounded-lg ${size} ${opacity}`}
                    title={`${item.count}회 (${item.ratio}%)`}
                  >
                    {item.word}
                    <span className="ml-1 text-xs opacity-60">({item.count})</span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* 동사 빈도 */}
          {result.verb_freq && result.verb_freq.length > 0 && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">
                동사 빈도 (상위 20개)
              </h2>
              <div className="flex flex-wrap gap-2">
                {result.verb_freq.slice(0, 20).map((item, idx) => {
                  const size =
                    idx < 5 ? 'text-base font-semibold' :
                    idx < 10 ? 'text-sm font-medium' :
                    'text-xs';

                  return (
                    <span
                      key={idx}
                      className={`px-3 py-1.5 bg-yellow-600/20 text-yellow-300 rounded-lg ${size}`}
                      title={`${item.count}회 (${item.ratio}%)`}
                    >
                      {item.word}
                      <span className="ml-1 text-xs opacity-60">({item.count})</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

import { useState, useMemo, useEffect, useRef } from 'react';
import { diagnosePost, PostDiagnoseResult, ImageAnalyzeResult, ImageItem, FoundKeyword, MorphemeFreq, TopicMatch, HTagItem, ExternalLinkItem } from '../services/api';

interface PostDiagnoseProps {
  initialUrl?: string;
  onUrlConsumed?: () => void;
}

export default function PostDiagnose({ initialUrl, onUrlConsumed }: PostDiagnoseProps) {
  const [url, setUrl] = useState('');
  const [targetKeyword, setTargetKeyword] = useState('');
  const processedUrlRef = useRef<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PostDiagnoseResult | null>(null);
  const [error, setError] = useState('');

  // 이미지 분석 데이터 (포스팅 진단 응답에서 추출)
  const imageData: ImageAnalyzeResult | null = result?.image_analysis || null;

  // initialUrl이 전달되면 자동으로 진단 시작
  useEffect(() => {
    if (initialUrl && initialUrl !== processedUrlRef.current) {
      processedUrlRef.current = initialUrl;
      setUrl(initialUrl);
      const runDiagnose = async () => {
        setLoading(true);
        setError('');
        setResult(null);
        try {
          const response = await diagnosePost(initialUrl, targetKeyword.trim() || undefined);
          setResult(response);
        } catch (err: any) {
          setError(err.response?.data?.detail || '포스팅 진단 중 오류가 발생했습니다.');
        } finally {
          setLoading(false);
          if (onUrlConsumed) {
            onUrlConsumed();
          }
        }
      };
      runDiagnose();
    }
  }, [initialUrl, onUrlConsumed]);

  const handleDiagnose = async () => {
    if (!url.trim()) {
      setError('포스트 URL을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await diagnosePost(url.trim(), targetKeyword.trim() || undefined);
      setResult(response);
    } catch (err: any) {
      setError(err.response?.data?.detail || '포스팅 진단 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDiagnose();
    }
  };

  // 본문에 키워드 하이라이팅 적용
  const highlightedContent = useMemo(() => {
    if (!result?.content) return '';

    const content = result.content;
    const forbidden = result.forbidden_words || [];
    const commercial = result.commercial_words || [];

    // 모든 키워드의 위치와 타입 수집
    const markers: Array<{ pos: number; len: number; type: 'forbidden' | 'commercial' }> = [];

    forbidden.forEach((kw: FoundKeyword) => {
      markers.push({ pos: kw.position, len: kw.word.length, type: 'forbidden' });
    });

    commercial.forEach((kw: FoundKeyword) => {
      markers.push({ pos: kw.position, len: kw.word.length, type: 'commercial' });
    });

    // 위치순 정렬
    markers.sort((a, b) => a.pos - b.pos);

    // 중복 영역 제거
    const cleanMarkers: typeof markers = [];
    for (const marker of markers) {
      const last = cleanMarkers[cleanMarkers.length - 1];
      if (!last || marker.pos >= last.pos + last.len) {
        cleanMarkers.push(marker);
      }
    }

    // HTML 생성
    let html = '';
    let lastEnd = 0;

    for (const marker of cleanMarkers) {
      // 이전 텍스트
      html += escapeHtml(content.slice(lastEnd, marker.pos));

      // 하이라이트된 텍스트 - 색상 강화
      const word = content.slice(marker.pos, marker.pos + marker.len);
      // 금지어: 빨간색 배경 + 굵은 글씨, 상업성: 보라색 배경 + 굵은 글씨
      const color = marker.type === 'forbidden'
        ? 'bg-red-500/50 text-red-200 font-bold border-b-2 border-red-400'
        : 'bg-purple-500/50 text-purple-200 font-bold border-b-2 border-purple-400';
      html += `<span class="${color} px-1 py-0.5 rounded">${escapeHtml(word)}</span>`;

      lastEnd = marker.pos + marker.len;
    }

    // 나머지 텍스트
    html += escapeHtml(content.slice(lastEnd));

    return html;
  }, [result?.content, result?.forbidden_words, result?.commercial_words]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">포스팅 진단</h1>

      {/* 입력 */}
      <div className="glass-card p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-dark-muted mb-2">
            타겟 키워드 (선택)
          </label>
          <input
            type="text"
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
            placeholder="SEO 분석 대상 키워드를 입력하세요..."
            className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-dark-muted focus:outline-none focus:border-naver-green"
          />
        </div>
        <div className="flex gap-4">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="포스트 URL 입력... (예: https://blog.naver.com/blogid/123456789)"
            className="flex-1 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-dark-muted focus:outline-none focus:border-naver-green"
          />
          <button
            onClick={handleDiagnose}
            disabled={loading}
            className="px-6 py-3 naver-gradient text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? '진단 중...' : '진단'}
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
          {/* SEO 점수 (prominently displayed) */}
          {typeof result.seo_score === 'number' && (
            <div className="glass-card p-6">
              <div className="flex items-center gap-6">
                <div className="flex-shrink-0">
                  <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center ${
                    result.seo_score >= 80 ? 'border-green-500' :
                    result.seo_score >= 60 ? 'border-yellow-500' :
                    result.seo_score >= 40 ? 'border-orange-500' :
                    'border-red-500'
                  }`}>
                    <div className="text-center">
                      <div className={`text-3xl font-bold ${
                        result.seo_score >= 80 ? 'text-green-400' :
                        result.seo_score >= 60 ? 'text-yellow-400' :
                        result.seo_score >= 40 ? 'text-orange-400' :
                        'text-red-400'
                      }`}>
                        {result.seo_score}
                      </div>
                      <div className="text-xs text-dark-muted">/ 100</div>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold mb-1">SEO 점수</h2>
                  <p className="text-sm text-dark-muted">
                    {result.seo_score >= 80 ? '매우 좋은 SEO 상태입니다.' :
                     result.seo_score >= 60 ? '보통 수준의 SEO 상태입니다. 개선 여지가 있습니다.' :
                     result.seo_score >= 40 ? 'SEO 개선이 필요합니다.' :
                     'SEO 최적화가 매우 부족합니다. 개선이 시급합니다.'}
                  </p>
                  <div className="mt-2 w-full h-3 bg-dark-bg rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        result.seo_score >= 80 ? 'bg-green-500' :
                        result.seo_score >= 60 ? 'bg-yellow-500' :
                        result.seo_score >= 40 ? 'bg-orange-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${result.seo_score}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 기본 정보 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">기본 정보</h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-dark-muted text-sm">제목</div>
                <div className="font-medium">{result.title || '-'}</div>
              </div>
              <div>
                <div className="text-dark-muted text-sm">작성자</div>
                <div className="font-medium">{result.author || '-'}</div>
              </div>
              <div>
                <div className="text-dark-muted text-sm">작성일</div>
                <div className="font-medium">{result.date || '-'}</div>
              </div>
              <div>
                <div className="text-dark-muted text-sm">URL</div>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-sm truncate block"
                >
                  {result.url}
                </a>
              </div>
            </div>

            {/* 글자수 표시 (네이버 방식) */}
            <div className="mb-4 p-3 bg-dark-bg rounded-lg">
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-xl font-bold text-naver-green">
                    {(result.char_stats?.total ?? result.content_length_pure ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-dark-muted">전체</div>
                </div>
                <div className="text-dark-muted/30">|</div>
                <div className="text-center">
                  <div className="text-xl font-bold text-blue-400">
                    {(result.char_stats?.korean ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-dark-muted">한글</div>
                </div>
                <div className="text-dark-muted/30">|</div>
                <div className="text-center">
                  <div className="text-xl font-bold text-cyan-400">
                    {(result.char_stats?.english ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-dark-muted">영어</div>
                </div>
                <div className="text-dark-muted/30">|</div>
                <div className="text-center">
                  <div className="text-xl font-bold text-yellow-400">
                    {(result.char_stats?.digit ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-dark-muted">숫자</div>
                </div>
              </div>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-5 gap-4">
              <div className="p-3 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {imageData
                    ? `${imageData.valid_count} / ${imageData.total_count}`
                    : (typeof result.valid_image_count === 'number' && typeof result.total_image_count === 'number')
                      ? `${result.valid_image_count} / ${result.total_image_count}`
                      : `${result.image_count || 0}`}
                </div>
                <div className="text-xs text-dark-muted">유효 이미지</div>
              </div>
              <div className="p-3 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold">{result.video_count || 0}</div>
                <div className="text-xs text-dark-muted">동영상</div>
              </div>
              <div className="p-3 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold text-cyan-400">{result.link_count || 0}</div>
                <div className="text-xs text-dark-muted">외부링크</div>
              </div>
              <div className="p-3 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold text-red-400">
                  {result.forbidden_words?.length || 0}
                </div>
                <div className="text-xs text-dark-muted">금지어</div>
              </div>
              <div className="p-3 bg-dark-bg rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {result.commercial_words?.length || 0}
                </div>
                <div className="text-xs text-dark-muted">상업성</div>
              </div>
            </div>
          </div>

          {/* 키워드 밀도 & 반복 횟수 (타겟 키워드 입력 시) */}
          {(typeof result.keyword_density === 'number' || typeof result.keyword_count === 'number') && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">키워드 분석{targetKeyword ? `: "${targetKeyword}"` : ''}</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-dark-muted mb-2">키워드 밀도 <span className="text-xs text-yellow-400">(제목 제외)</span></div>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold text-naver-green">
                      {result.keyword_density?.toFixed(2) || 0}%
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-dark-bg rounded-full overflow-hidden">
                        <div
                          className="h-full naver-gradient rounded-full"
                          style={{
                            width: `${Math.min((result.keyword_density || 0) * 10, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-dark-muted mt-1">
                    권장 범위: 1% ~ 3%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-dark-muted mb-2">키워드 반복 횟수 <span className="text-xs text-yellow-400">(제목 제외)</span></div>
                  <div className="text-3xl font-bold text-cyan-400">
                    {result.keyword_count || 0}회
                  </div>
                  <div className="text-xs text-dark-muted mt-1">
                    본문 내 타겟 키워드 출현 횟수
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* H-tag 구조 */}
          {result.h_tags && result.h_tags.length > 0 && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">H-Tag 구조</h2>
              <div className="space-y-2">
                {result.h_tags.map((htag: HTagItem, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2 bg-dark-bg rounded-lg"
                    style={{ paddingLeft: `${(htag.level - 1) * 20 + 8}px` }}
                  >
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      htag.level <= 2 ? 'bg-naver-green/20 text-naver-green' :
                      htag.level <= 3 ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {htag.tag.toUpperCase()}
                    </span>
                    <span className="text-sm">{htag.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 이미지 분석 결과 (유효/무효 분리) - 포스팅 진단 응답의 image_analysis 사용 */}
          {imageData && imageData.images.length > 0 && (
            <>
              {/* 유효 이미지 섹션 */}
              {imageData.images.filter((img: ImageItem) => img.is_valid).length > 0 && (
                <div className="glass-card p-6">
                  <h2 className="text-lg font-semibold mb-4">
                    유효 이미지 ({imageData.valid_count}개)
                  </h2>
                  <div className="grid grid-cols-6 gap-2">
                    {imageData.images.filter((img: ImageItem) => img.is_valid).map((img: ImageItem, idx: number) => (
                      <a
                        key={idx}
                        href={normalizeImageUrl(img.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg overflow-hidden border border-green-500/30 hover:border-green-500 transition"
                      >
                        <div className="h-[100px] bg-dark-bg">
                          <img
                            src={normalizeImageUrl(img.thumbnail_url || img.url)}
                            alt={img.alt || `유효 이미지 ${idx + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              const normalizedUrl = normalizeImageUrl(img.url);
                              if (img.thumbnail_url && target.src !== normalizedUrl) {
                                target.src = normalizedUrl;
                                return;
                              }
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent && !parent.querySelector('.img-fallback')) {
                                const fallback = document.createElement('div');
                                fallback.className = 'img-fallback w-full h-full flex items-center justify-center text-dark-muted text-xs text-center p-1';
                                fallback.textContent = `#${img.order}`;
                                parent.appendChild(fallback);
                              }
                            }}
                          />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* 무효 이미지 섹션 */}
              {imageData.images.filter((img: ImageItem) => !img.is_valid).length > 0 && (
                <div className="glass-card p-6">
                  <h2 className="text-lg font-semibold mb-4 text-red-400">
                    무효 이미지 ({imageData.invalid_count}개)
                  </h2>
                  <div className="grid grid-cols-6 gap-2">
                    {imageData.images.filter((img: ImageItem) => !img.is_valid).map((img: ImageItem, idx: number) => (
                      <a
                        key={idx}
                        href={normalizeImageUrl(img.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg overflow-hidden border border-red-500/30 hover:border-red-500 transition relative group"
                      >
                        <div className="h-[100px] bg-dark-bg">
                          <img
                            src={normalizeImageUrl(img.thumbnail_url || img.url)}
                            alt={img.alt || `무효 이미지 ${idx + 1}`}
                            className="w-full h-full object-cover opacity-60"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              const normalizedUrl = normalizeImageUrl(img.url);
                              if (img.thumbnail_url && target.src !== normalizedUrl) {
                                target.src = normalizedUrl;
                                return;
                              }
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent && !parent.querySelector('.img-fallback')) {
                                const fallback = document.createElement('div');
                                fallback.className = 'img-fallback w-full h-full flex items-center justify-center text-dark-muted text-xs text-center p-1';
                                fallback.textContent = `#${img.order}`;
                                parent.appendChild(fallback);
                              }
                            }}
                          />
                        </div>
                        {/* 무효 사유 오버레이 */}
                        {img.invalid_reason && (
                          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                            <span className="text-red-300 text-[10px] leading-tight text-center">
                              {img.invalid_reason}
                            </span>
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* imageData 없을 때 fallback: image_urls 썸네일 그리드 */}
          {!imageData && result.image_urls && result.image_urls.length > 0 && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">
                이미지 ({result.image_urls.length}개)
              </h2>
              <div className="grid grid-cols-6 gap-2">
                {result.image_urls
                  .map((imgUrl: string) => normalizeImageUrl(imgUrl))
                  .filter((imgUrl: string) => isValidImageUrl(imgUrl))
                  .map((imgUrl: string, idx: number) => (
                    <a
                      key={idx}
                      href={imgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden border border-dark-border hover:border-naver-green transition"
                    >
                      <div className="h-[100px] bg-dark-bg">
                        <img
                          src={imgUrl}
                          alt={`이미지 ${idx + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent && !parent.querySelector('.img-fallback')) {
                              const fallback = document.createElement('div');
                              fallback.className = 'img-fallback w-full h-full flex items-center justify-center text-dark-muted text-xs text-center p-1';
                              fallback.textContent = `#${idx + 1}`;
                              parent.appendChild(fallback);
                            }
                          }}
                        />
                      </div>
                    </a>
                  ))}
              </div>
            </div>
          )}

          {/* 외부 링크 목록 */}
          {result.external_links && result.external_links.length > 0 && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">
                외부 링크 ({result.external_links.length}개)
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.external_links.map((link: ExternalLinkItem, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 p-2 bg-dark-bg rounded-lg text-sm">
                    <span className="px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded text-xs flex-shrink-0">
                      {link.domain}
                    </span>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline truncate"
                      title={link.url}
                    >
                      {link.text || link.url}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 키워드 탐지 결과 */}
          {((result.forbidden_words?.length || 0) > 0 || (result.commercial_words?.length || 0) > 0) && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">탐지된 키워드</h2>
              <div className="grid grid-cols-2 gap-6">
                {/* 금지어 */}
                <div>
                  <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                    <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                    금지어 ({result.forbidden_words?.length || 0}개)
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {result.forbidden_words?.map((kw, idx) => (
                      <div key={idx} className="p-2 bg-red-500/10 rounded text-sm">
                        <span className="font-medium text-red-300">{kw.word}</span>
                        <span className="text-dark-muted ml-2">"{kw.context}"</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 상업성 키워드 */}
                <div>
                  <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                    <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                    상업성 키워드 ({result.commercial_words?.length || 0}개)
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {result.commercial_words?.map((kw, idx) => (
                      <div key={idx} className="p-2 bg-purple-500/10 rounded text-sm">
                        <span className="font-medium text-purple-300">{kw.word}</span>
                        <span className="text-dark-muted ml-2">"{kw.context}"</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 본문 (하이라이팅) */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">본문 분석</h2>
            <div className="flex gap-4 mb-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-red-500/50 rounded border-b-2 border-red-400"></span>
                <span className="text-red-300 font-medium">금지어 (빨간색)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-purple-500/50 rounded border-b-2 border-purple-400"></span>
                <span className="text-purple-300 font-medium">상업성 키워드 (보라색)</span>
              </div>
            </div>
            <div
              className="p-4 bg-dark-bg rounded-lg max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: highlightedContent }}
            />
          </div>

          {/* 문장 통계 */}
          {result.word_stats && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">문장 통계</h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 bg-dark-bg rounded-lg text-center">
                  <div className="text-xl font-bold">
                    {result.word_stats.word_count?.toLocaleString() || 0}
                  </div>
                  <div className="text-sm text-dark-muted">단어 수</div>
                </div>
                <div className="p-4 bg-dark-bg rounded-lg text-center">
                  <div className="text-xl font-bold">
                    {result.word_stats.sentence_count || 0}
                  </div>
                  <div className="text-sm text-dark-muted">문장 수</div>
                </div>
                <div className="p-4 bg-dark-bg rounded-lg text-center">
                  <div className="text-xl font-bold">
                    {result.word_stats.paragraph_count || 0}
                  </div>
                  <div className="text-sm text-dark-muted">문단 수</div>
                </div>
                <div className="p-4 bg-dark-bg rounded-lg text-center">
                  <div className="text-xl font-bold">
                    {result.word_stats.avg_sentence_length?.toFixed(1) || 0}
                  </div>
                  <div className="text-sm text-dark-muted">평균 문장 길이</div>
                </div>
              </div>
            </div>
          )}

          {/* 이미지 분석은 포스팅 진단 응답에 포함되므로 별도 로딩/에러 UI 불필요 */}

          {/* 이미지 상세 테이블 (접을 수 있음) */}
          {imageData && imageData.images.length > 0 && (
            <div className="glass-card p-6">
              <details>
                <summary className="cursor-pointer text-sm text-dark-muted hover:text-white transition">
                  이미지 상세 목록 보기 ({imageData.images.length}개)
                </summary>
                <div className="mt-4 overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-dark-card">
                      <tr className="border-b border-dark-border">
                        <th className="px-3 py-2 text-left text-dark-muted">#</th>
                        <th className="px-3 py-2 text-left text-dark-muted">상태</th>
                        <th className="px-3 py-2 text-left text-dark-muted">크기</th>
                        <th className="px-3 py-2 text-left text-dark-muted">URL</th>
                        <th className="px-3 py-2 text-left text-dark-muted">사유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {imageData.images.map((img: ImageItem, idx: number) => {
                        const normalizedUrl = normalizeImageUrl(img.url);
                        return (
                          <tr key={idx} className="border-b border-dark-border/50 hover:bg-dark-hover">
                            <td className="px-3 py-2 text-dark-muted">{img.order}</td>
                            <td className="px-3 py-2">
                              {img.is_valid ? (
                                <span className="text-green-400">유효</span>
                              ) : (
                                <span className="text-red-400">무효</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {img.width && img.height ? `${img.width}x${img.height}` : '-'}
                            </td>
                            <td className="px-3 py-2">
                              <a
                                href={normalizedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline truncate block max-w-xs"
                                title={normalizedUrl}
                              >
                                {normalizedUrl.length > 50 ? normalizedUrl.substring(0, 50) + '...' : normalizedUrl}
                              </a>
                            </td>
                            <td className="px-3 py-2 text-red-300 text-xs">
                              {img.invalid_reason || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}

          {/* 형태소 분석 결과 */}
          {result.morpheme_analysis && Object.keys(result.morpheme_analysis).length > 0 && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">형태소 분석 (키워드 빈도) <span className="text-sm font-normal text-yellow-400">(제목 제외)</span></h2>

              {/* 요약 정보 */}
              {result.morpheme_analysis.summary && (
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="p-3 bg-dark-bg rounded-lg text-center">
                    <div className="text-xl font-bold text-cyan-400">
                      {result.morpheme_analysis.summary.total_morphemes?.toLocaleString() || 0}
                    </div>
                    <div className="text-xs text-dark-muted">총 형태소</div>
                  </div>
                  <div className="p-3 bg-dark-bg rounded-lg text-center">
                    <div className="text-xl font-bold text-green-400">
                      {result.morpheme_analysis.summary.unique_nouns || 0}
                    </div>
                    <div className="text-xs text-dark-muted">고유 명사</div>
                  </div>
                  <div className="p-3 bg-dark-bg rounded-lg text-center">
                    <div className="text-xl font-bold text-yellow-400">
                      {result.morpheme_analysis.summary.unique_verbs || 0}
                    </div>
                    <div className="text-xs text-dark-muted">고유 동사</div>
                  </div>
                  <div className="p-3 bg-dark-bg rounded-lg text-center">
                    <div className="text-sm font-medium text-orange-400">
                      {result.morpheme_analysis.summary.top_topics?.join(', ') || '-'}
                    </div>
                    <div className="text-xs text-dark-muted">주요 주제</div>
                  </div>
                </div>
              )}

              {/* 품사별 빈도 테이블 */}
              <div className="grid grid-cols-2 gap-6">
                {/* 명사 빈도 */}
                <div>
                  <h3 className="text-sm font-medium text-green-400 mb-3 flex items-center gap-2">
                    <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                    명사 빈도 (상위 15개)
                  </h3>
                  <div className="bg-dark-bg rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-border">
                          <th className="px-3 py-2 text-left text-dark-muted">순위</th>
                          <th className="px-3 py-2 text-left text-dark-muted">단어</th>
                          <th className="px-3 py-2 text-right text-dark-muted">횟수</th>
                          <th className="px-3 py-2 text-right text-dark-muted">비율</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(result.morpheme_analysis.noun_freq || []).slice(0, 15).map((item: MorphemeFreq, idx: number) => (
                          <tr key={idx} className="border-b border-dark-border/50 hover:bg-dark-card">
                            <td className="px-3 py-2 text-dark-muted">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium">{item.word}</td>
                            <td className="px-3 py-2 text-right text-green-400">{item.count}</td>
                            <td className="px-3 py-2 text-right text-dark-muted">{item.ratio}%</td>
                          </tr>
                        ))}
                        {(!result.morpheme_analysis.noun_freq || result.morpheme_analysis.noun_freq.length === 0) && (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-center text-dark-muted">
                              데이터 없음
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 동사 빈도 */}
                <div>
                  <h3 className="text-sm font-medium text-yellow-400 mb-3 flex items-center gap-2">
                    <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                    동사 빈도 (상위 15개)
                  </h3>
                  <div className="bg-dark-bg rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-border">
                          <th className="px-3 py-2 text-left text-dark-muted">순위</th>
                          <th className="px-3 py-2 text-left text-dark-muted">단어</th>
                          <th className="px-3 py-2 text-right text-dark-muted">횟수</th>
                          <th className="px-3 py-2 text-right text-dark-muted">비율</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(result.morpheme_analysis.verb_freq || []).slice(0, 15).map((item: MorphemeFreq, idx: number) => (
                          <tr key={idx} className="border-b border-dark-border/50 hover:bg-dark-card">
                            <td className="px-3 py-2 text-dark-muted">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium">{item.word}</td>
                            <td className="px-3 py-2 text-right text-yellow-400">{item.count}</td>
                            <td className="px-3 py-2 text-right text-dark-muted">{item.ratio}%</td>
                          </tr>
                        ))}
                        {(!result.morpheme_analysis.verb_freq || result.morpheme_analysis.verb_freq.length === 0) && (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-center text-dark-muted">
                              데이터 없음
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 전체 키워드 빈도 (가로 스크롤 테이블) */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-cyan-400 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-cyan-500 rounded-full"></span>
                  전체 키워드 빈도 (상위 30개)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(result.morpheme_analysis.all_freq || []).slice(0, 30).map((item: MorphemeFreq, idx: number) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 bg-dark-bg rounded-full text-sm flex items-center gap-2"
                      style={{
                        opacity: Math.max(0.5, 1 - idx * 0.02)
                      }}
                    >
                      <span className="font-medium">{item.word}</span>
                      <span className="text-cyan-400 text-xs">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 주제 분류 */}
              {result.morpheme_analysis.topics && result.morpheme_analysis.topics.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-orange-400 mb-3 flex items-center gap-2">
                    <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                    주제 분류
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    {result.morpheme_analysis.topics.slice(0, 6).map((topic: TopicMatch, idx: number) => (
                      <div key={idx} className="p-3 bg-dark-bg rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-orange-300">{topic.topic}</span>
                          <span className="text-xs text-dark-muted">점수: {topic.score}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {topic.matched_keywords.map((kw: string, kwIdx: number) => (
                            <span key={kwIdx} className="px-2 py-0.5 bg-orange-500/20 rounded text-xs text-orange-200">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// HTML 이스케이프
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// URL 내 유니코드 이스케이프(\u002F 등)를 정상 문자로 변환
function normalizeImageUrl(url: string): string {
  if (!url) return '';
  // \u002F -> /, \u003A -> : 등의 유니코드 이스케이프 처리
  let normalized = url.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  // HTML 엔티티 디코딩 (&amp; -> & 등)
  normalized = normalized
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  return normalized.trim();
}

// 무효 이미지 URL 필터링 (no_image.png, blank 등)
function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  const invalidPatterns = [
    /no_image/i,
    /blank\.(png|gif|jpg)/i,
    /spacer\.(png|gif)/i,
    /transparent\.(png|gif)/i,
    /pixel\.(png|gif)/i,
    /1x1\.(png|gif)/i,
    /data:image/i,
  ];
  return !invalidPatterns.some(pattern => pattern.test(url));
}

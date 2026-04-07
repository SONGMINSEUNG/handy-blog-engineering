import { useState } from 'react';
import { diagnoseBlog, BlogDiagnoseResult } from '../services/api';

interface BlogDiagnoseProps {
  onNavigateToPostDiagnose?: (url: string) => void;
}

export default function BlogDiagnose({ onNavigateToPostDiagnose }: BlogDiagnoseProps) {
  const [blogId, setBlogId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BlogDiagnoseResult | null>(null);
  const [error, setError] = useState('');

  const handleDiagnose = async () => {
    if (!blogId.trim()) {
      setError('블로그 ID를 입력해주세요.');
      return;
    }

    // URL에서 블로그 ID 추출
    let extractedId = blogId.trim();
    const urlMatch = blogId.match(/blog\.naver\.com\/([^/?]+)/);
    if (urlMatch) {
      extractedId = urlMatch[1];
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await diagnoseBlog(extractedId);
      setResult(response);
    } catch (err: any) {
      setError(err.response?.data?.detail || '블로그 진단 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDiagnose();
    }
  };

  // 포스트 진단 페이지로 이동
  const handlePostDiagnose = (postUrl: string) => {
    if (onNavigateToPostDiagnose) {
      onNavigateToPostDiagnose(postUrl);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">블로그 진단</h1>

      {/* 입력 */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          value={blogId}
          onChange={(e) => setBlogId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="블로그 ID 또는 URL 입력... (예: blogid123 또는 https://blog.naver.com/blogid123)"
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
          {/* 블로그 정보 */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">블로그 정보</h2>
            <div className="flex items-start gap-6">
              {result.blog_info.profile_image && (
                <img
                  src={result.blog_info.profile_image}
                  alt="프로필"
                  className="w-24 h-24 rounded-full object-cover border-2 border-naver-green"
                />
              )}
              <div className="flex-1">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-dark-muted text-sm">블로그 ID</div>
                    <div className="font-medium">{result.blog_info.blog_id}</div>
                  </div>
                  <div>
                    <div className="text-dark-muted text-sm">블로그 이름</div>
                    <div className="font-medium">{result.blog_info.blog_name || '-'}</div>
                  </div>
                  <div>
                    <div className="text-dark-muted text-sm">블로그 제목</div>
                    <div className="font-medium">{result.blog_info.blog_title || '-'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 통계 카드 - 이웃수, 방문자 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card p-5 text-center">
              <div className="text-dark-muted text-sm mb-2">이웃 수</div>
              <div className="text-3xl font-bold text-naver-green">
                {result.blog_info.neighbor_count?.toLocaleString() || 0}
              </div>
              <div className="text-dark-muted text-xs mt-1">명</div>
            </div>
            <div className="glass-card p-5 text-center">
              <div className="text-dark-muted text-sm mb-2">오늘 방문자</div>
              <div className="text-3xl font-bold text-blue-400">
                {result.blog_info.today_visitors?.toLocaleString() || 0}
              </div>
              <div className="text-dark-muted text-xs mt-1">명</div>
            </div>
            <div className="glass-card p-5 text-center">
              <div className="text-dark-muted text-sm mb-2">전체 방문자</div>
              <div className="text-3xl font-bold text-purple-400">
                {result.blog_info.total_visitors?.toLocaleString() || 0}
              </div>
              <div className="text-dark-muted text-xs mt-1">명</div>
            </div>
          </div>

          {/* 게시물 목록 */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                게시물 목록 ({result.posts.length}개)
              </h2>
              <div className="flex items-center gap-2 text-xs text-dark-muted">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  진단
                </span>
              </div>
            </div>
            {result.posts.length > 0 ? (
              <div className="space-y-3">
                {result.posts.slice(0, 10).map((post, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-dark-bg rounded-lg hover:bg-dark-hover transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-400 hover:underline"
                        >
                          {post.title || '(제목 없음)'}
                        </a>
                        {post.summary && (
                          <p className="text-sm text-dark-muted mt-1 line-clamp-2">
                            {post.summary}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        <div className="text-right text-sm text-dark-muted">
                          <div>{post.date}</div>
                          {post.comment_count > 0 && (
                            <div>댓글 {post.comment_count}</div>
                          )}
                        </div>
                        {/* 진단 버튼 */}
                        <button
                          onClick={() => handlePostDiagnose(post.url)}
                          className="p-2 rounded-lg bg-naver-green/20 hover:bg-naver-green/40 text-naver-green transition"
                          title="포스팅 진단으로 이동"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-dark-muted py-8">
                게시물을 찾을 수 없습니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

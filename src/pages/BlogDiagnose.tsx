import { useState, useMemo } from 'react';
import { diagnoseBlog, BlogDiagnoseResult, VisitorHistoryItem } from '../services/api';

// 방문자 그래프 탭 타입
type VisitorTab = 'daily' | 'weekly' | 'monthly';

// 그래프 데이터 항목
interface ChartDataItem {
  label: string;
  count: number;
}

// 일별 방문자 데이터를 주간/월간으로 집계하는 유틸
function aggregateVisitorData(
  dailyVisitors: Record<string, number>,
  tab: VisitorTab
): ChartDataItem[] {
  const entries = Object.entries(dailyVisitors).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return [];

  if (tab === 'daily') {
    // 최근 30일 (또는 데이터가 있는 만큼)
    const recent = entries.slice(-30);
    return recent.map(([dateStr, count]) => {
      const m = dateStr.slice(4, 6);
      const d = dateStr.slice(6, 8);
      return { label: `${m}/${d}`, count };
    });
  }

  if (tab === 'weekly') {
    // 주별 합산 (최근 12주)
    // 각 주의 시작일/종료일을 기록하기 위해 날짜 기반으로 집계
    const weekMap: Record<string, { count: number; startDate: string; endDate: string }> = {};
    for (const [dateStr, count] of entries) {
      const year = parseInt(dateStr.slice(0, 4));
      const month = parseInt(dateStr.slice(4, 6)) - 1;
      const day = parseInt(dateStr.slice(6, 8));
      const date = new Date(year, month, day);
      // ISO 주차 계산
      const jan1 = new Date(date.getFullYear(), 0, 1);
      const dayOfYear = Math.floor((date.getTime() - jan1.getTime()) / 86400000) + 1;
      const weekNum = Math.ceil(dayOfYear / 7);
      const weekKey = `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
      if (!weekMap[weekKey]) {
        weekMap[weekKey] = { count: 0, startDate: dateStr, endDate: dateStr };
      }
      weekMap[weekKey].count += count;
      if (dateStr < weekMap[weekKey].startDate) weekMap[weekKey].startDate = dateStr;
      if (dateStr > weekMap[weekKey].endDate) weekMap[weekKey].endDate = dateStr;
    }
    const weekEntries = Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
    return weekEntries.map(([, data]) => {
      const sm = data.startDate.slice(4, 6);
      const sd = data.startDate.slice(6, 8);
      const em = data.endDate.slice(4, 6);
      const ed = data.endDate.slice(6, 8);
      return { label: `${sm}.${sd}~${em}.${ed}`, count: data.count };
    });
  }

  // monthly: 월별 합산 (최근 12개월)
  const monthMap: Record<string, number> = {};
  for (const [dateStr, count] of entries) {
    const monthKey = dateStr.slice(0, 6); // YYYYMM
    monthMap[monthKey] = (monthMap[monthKey] || 0) + count;
  }
  const monthEntries = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  return monthEntries.map(([monthKey, count]) => {
    const y = monthKey.slice(0, 4);
    const m = monthKey.slice(4, 6);
    return { label: `${y}.${m}`, count };
  });
}

// 방문자 바 차트 컴포넌트
function VisitorBarChart({ data }: { data: ChartDataItem[] }) {
  if (data.length === 0) {
    return (
      <div className="text-center text-dark-muted py-8">
        방문자 데이터가 없습니다.
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  // 데이터가 1개일 때도 바가 보이도록 최소 너비 보장
  const barMinWidth = data.length === 1 ? 'min-w-[60px] max-w-[120px]' : 'min-w-0';

  return (
    <div className={`flex items-end gap-[2px] h-44 px-1 ${data.length === 1 ? 'justify-center' : ''}`}>
      {data.map((d, i) => {
        const heightPercent = (d.count / maxCount) * 100;
        // 데이터가 있으면 최소 5% 높이 보장 (바가 보이도록)
        const minHeight = d.count > 0 ? 5 : 1;
        return (
          <div key={i} className={`flex-1 flex flex-col items-center ${barMinWidth} group relative`}>
            {/* 툴팁 */}
            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
              <div className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-dark-text whitespace-nowrap shadow-lg">
                {d.label}: {d.count.toLocaleString()}
              </div>
            </div>
            {/* 값 표시 - 데이터가 적을 때 바 위에 숫자 표시 */}
            {data.length <= 7 && d.count > 0 && (
              <span className="text-[10px] text-naver-green font-medium mb-0.5">
                {d.count.toLocaleString()}
              </span>
            )}
            {/* 바 */}
            <div
              className="w-full bg-naver-green/80 hover:bg-naver-green rounded-t transition-all duration-200"
              style={{ height: `${Math.max(heightPercent, minHeight)}%`, minHeight: '4px' }}
            />
            {/* 라벨 - 데이터가 적을 때만 표시 */}
            {data.length <= 15 && (
              <span className="text-[10px] text-dark-muted mt-1 truncate w-full text-center">
                {d.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 방문자 그래프 섹션 컴포넌트
function VisitorChart({ dailyVisitors }: { dailyVisitors: Record<string, number> }) {
  const [tab, setTab] = useState<VisitorTab>('daily');

  const chartData = useMemo(
    () => aggregateVisitorData(dailyVisitors, tab),
    [dailyVisitors, tab]
  );

  const totalInPeriod = useMemo(
    () => chartData.reduce((sum, d) => sum + d.count, 0),
    [chartData]
  );

  const avgInPeriod = useMemo(
    () => (chartData.length > 0 ? Math.round(totalInPeriod / chartData.length) : 0),
    [chartData, totalInPeriod]
  );

  const tabLabels: Record<VisitorTab, string> = {
    daily: '일간',
    weekly: '주간',
    monthly: '월간',
  };

  const dataCount = Object.keys(dailyVisitors).length;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">방문자 추이</h2>
        <div className="flex gap-1">
          {(Object.keys(tabLabels) as VisitorTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                tab === t
                  ? 'bg-naver-green text-white'
                  : 'bg-dark-bg border border-dark-border text-dark-muted hover:border-naver-green hover:text-dark-text'
              }`}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>
      </div>

      {/* 요약 정보 */}
      <div className="flex gap-4 mb-4 text-sm">
        <div>
          <span className="text-dark-muted">기간 합계: </span>
          <span className="text-dark-text font-medium">{totalInPeriod.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-dark-muted">
            {tab === 'daily' ? '일 평균' : tab === 'weekly' ? '주 평균' : '월 평균'}:{' '}
          </span>
          <span className="text-dark-text font-medium">{avgInPeriod.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-dark-muted">데이터: </span>
          <span className="text-dark-text font-medium">{dataCount}일</span>
        </div>
      </div>

      {/* 바 차트 */}
      <VisitorBarChart data={chartData} />

      {/* 라벨 범위 표시 (데이터가 많을 때) */}
      {chartData.length > 15 && (
        <div className="flex justify-between mt-1 text-[10px] text-dark-muted px-1">
          <span>{chartData[0]?.label}</span>
          <span>{chartData[chartData.length - 1]?.label}</span>
        </div>
      )}

      {/* 데이터 제한 안내 */}
      {dataCount < 7 && (
        <div className="mt-3 text-xs text-dark-muted text-center">
          * 네이버 API 특성상 최근 수일 데이터만 제공됩니다.
        </div>
      )}
    </div>
  );
}

// DB 누적 방문자 추이 그래프 컴포넌트
function VisitorHistoryChart({ history }: { history: VisitorHistoryItem[] }) {
  if (history.length === 0) {
    return null;
  }

  const maxCount = Math.max(...history.map((d) => d.visitor_count), 1);

  // 날짜 포맷: YYYY-MM-DD -> MM/DD
  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}`;
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">방문자 추이 (누적 기록)</h2>
        <span className="text-xs text-dark-muted">{history.length}일 기록</span>
      </div>

      {history.length === 1 && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-300">
          현재 1일치 데이터만 있습니다. 매일 진단하면 방문자 추이 그래프가 쌓여갑니다.
        </div>
      )}

      {/* 요약 정보 */}
      <div className="flex gap-4 mb-4 text-sm">
        <div>
          <span className="text-dark-muted">기간 합계: </span>
          <span className="text-dark-text font-medium">
            {history.reduce((sum, d) => sum + d.visitor_count, 0).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-dark-muted">일 평균: </span>
          <span className="text-dark-text font-medium">
            {Math.round(history.reduce((sum, d) => sum + d.visitor_count, 0) / history.length).toLocaleString()}
          </span>
        </div>
        {history.length >= 2 && (
          <div>
            <span className="text-dark-muted">최근 변화: </span>
            {(() => {
              const latest = history[history.length - 1].visitor_count;
              const prev = history[history.length - 2].visitor_count;
              const diff = latest - prev;
              const color = diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-dark-muted';
              const prefix = diff > 0 ? '+' : '';
              return <span className={`font-medium ${color}`}>{prefix}{diff.toLocaleString()}</span>;
            })()}
          </div>
        )}
      </div>

      {/* 바 차트 */}
      <div className={`flex items-end gap-[2px] h-44 px-1 ${history.length === 1 ? 'justify-center' : ''}`}>
        {history.map((d, i) => {
          const heightPercent = (d.visitor_count / maxCount) * 100;
          const minHeight = d.visitor_count > 0 ? 5 : 1;
          const barMinWidth = history.length === 1 ? 'min-w-[60px] max-w-[120px]' : 'min-w-0';
          return (
            <div key={i} className={`flex-1 flex flex-col items-center ${barMinWidth} group relative`}>
              {/* 툴팁 */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                <div className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-dark-text whitespace-nowrap shadow-lg">
                  <div>{formatDate(d.date)}: {d.visitor_count.toLocaleString()}명</div>
                  <div className="text-dark-muted">전체: {d.total_visitor.toLocaleString()}</div>
                  <div className="text-dark-muted">이웃: {d.subscriber_count.toLocaleString()}</div>
                </div>
              </div>
              {/* 값 표시 - 데이터가 적을 때 */}
              {history.length <= 7 && d.visitor_count > 0 && (
                <span className="text-[10px] text-blue-400 font-medium mb-0.5">
                  {d.visitor_count.toLocaleString()}
                </span>
              )}
              {/* 바 */}
              <div
                className="w-full bg-blue-500/80 hover:bg-blue-500 rounded-t transition-all duration-200"
                style={{ height: `${Math.max(heightPercent, minHeight)}%`, minHeight: '4px' }}
              />
              {/* 라벨 */}
              {history.length <= 15 && (
                <span className="text-[10px] text-dark-muted mt-1 truncate w-full text-center">
                  {formatDate(d.date)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 라벨 범위 표시 (데이터가 많을 때) */}
      {history.length > 15 && (
        <div className="flex justify-between mt-1 text-[10px] text-dark-muted px-1">
          <span>{formatDate(history[0].date)}</span>
          <span>{formatDate(history[history.length - 1].date)}</span>
        </div>
      )}
    </div>
  );
}

interface BlogDiagnoseProps {
  onNavigateToPostDiagnose?: (url: string) => void;
}

export default function BlogDiagnose({ onNavigateToPostDiagnose }: BlogDiagnoseProps) {
  const [blogId, setBlogId] = useState('');
  const [postCount, setPostCount] = useState<number>(30);
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
      const response = await diagnoseBlog(extractedId, postCount);
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
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          value={blogId}
          onChange={(e) => setBlogId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="블로그 ID 또는 URL 입력... (예: blogid123 또는 https://blog.naver.com/blogid123)"
          className="flex-1 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green"
        />
        <button
          onClick={handleDiagnose}
          disabled={loading}
          className="px-6 py-3 naver-gradient text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
        >
          {loading ? '진단 중...' : '진단'}
        </button>
      </div>

      {/* 글 개수 선택 */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-dark-muted">분석 글 수:</span>
        <div className="flex gap-2">
          {[30, 60, 90].map((count) => (
            <button
              key={count}
              onClick={() => setPostCount(count)}
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                postCount === count
                  ? 'bg-naver-green text-white'
                  : 'bg-dark-bg border border-dark-border text-dark-muted hover:border-naver-green hover:text-dark-text'
              } disabled:opacity-50`}
            >
              {count}개
            </button>
          ))}
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

          {/* 통계 카드 - 이웃수, 방문자, 월 발행수 */}
          <div className="grid grid-cols-4 gap-4">
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
            <div className="glass-card p-5 text-center">
              <div className="text-dark-muted text-sm mb-2">월 발행수</div>
              <div className="text-3xl font-bold text-orange-400">
                {result.blog_info.monthly_post_count?.toLocaleString() ?? '-'}
              </div>
              <div className="text-dark-muted text-xs mt-1">최근 30일</div>
            </div>
          </div>

          {/* 방문자 추이 그래프 (네이버 API 데이터) */}
          {result.blog_info.daily_visitors && Object.keys(result.blog_info.daily_visitors).length > 0 && (
            <VisitorChart dailyVisitors={result.blog_info.daily_visitors} />
          )}

          {/* 방문자 추이 그래프 (DB 누적 데이터) */}
          {result.visitor_history && result.visitor_history.length > 0 && (
            <VisitorHistoryChart history={result.visitor_history} />
          )}

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
                {result.posts.map((post, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-dark-bg rounded-lg hover:bg-dark-hover transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {post.is_notice && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0 whitespace-nowrap">
                            공지
                          </span>
                        )}
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-400 hover:underline truncate"
                        >
                          {post.title || '(제목 없음)'}
                        </a>
                        <span className="text-sm text-dark-muted whitespace-nowrap shrink-0">{post.date}</span>
                        {post.comment_count > 0 && (
                          <span className="text-sm text-dark-muted whitespace-nowrap shrink-0">댓글 {post.comment_count}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
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

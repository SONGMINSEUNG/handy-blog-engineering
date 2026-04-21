import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  getBlogPosts,
  checkRanking,
  getKeywordStats,
  parseApiError,
  BlogPostItem,
  RankingResult,
  RankingEntry,
} from '../services/api';

// ===== 타입 정의 =====

// localStorage 저장 구조: 글별 데이터
interface SavedPostData {
  logNo: string;
  title: string;
  url: string;
  keyword: string;
  lastRank?: RankingEntry[];
}

// localStorage 저장 구조: 블로그별 데이터
interface SavedBlogData {
  blogId: string;
  posts: SavedPostData[];
}

// 글별 순위 확인 상태 (UI용)
interface PostRankState {
  keyword: string;
  loading: boolean;
  result: RankingResult | null;
  error: string | null;
  searchVolume: number | null; // 월간 검색수 (PC + 모바일)
}

// ===== 유틸 함수 =====

// URL 인코딩된 제목 디코딩
function decodeTitle(title: string): string {
  try {
    return decodeURIComponent(title);
  } catch {
    return title;
  }
}

// URL에서 블로그 ID 추출
function extractBlogId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/([^\/\?\#]+)/);
  if (match) return match[1];
  return trimmed;
}

// ===== localStorage 헬퍼 (유저별 분리) =====

function getStoragePrefix(userId?: number): string {
  return userId ? `rankTracker:${userId}` : 'rankTracker';
}

function getAccountsKey(userId?: number): string {
  return `${getStoragePrefix(userId)}:accounts`;
}

function getAccounts(userId?: number): string[] {
  try {
    const raw = localStorage.getItem(getAccountsKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: string[], userId?: number) {
  localStorage.setItem(getAccountsKey(userId), JSON.stringify(accounts));
}

function getBlogData(blogId: string, userId?: number): SavedBlogData | null {
  try {
    const raw = localStorage.getItem(`${getStoragePrefix(userId)}:${blogId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveBlogData(data: SavedBlogData, userId?: number) {
  localStorage.setItem(`${getStoragePrefix(userId)}:${data.blogId}`, JSON.stringify(data));
}

function removeBlogData(blogId: string, userId?: number) {
  localStorage.removeItem(`${getStoragePrefix(userId)}:${blogId}`);
}

// ===== 컴포넌트 =====

interface RankTrackerProps {
  userId: number;
}

function RankTracker({ userId }: RankTrackerProps) {
  // 블로그 계정 관리
  const [accounts, setAccounts] = useState<string[]>([]);
  const [activeBlogId, setActiveBlogId] = useState<string>('');
  const [blogIdInput, setBlogIdInput] = useState('');

  // 글 목록
  const [posts, setPosts] = useState<BlogPostItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [postCount, setPostCount] = useState<30 | 60 | 90>(30);

  // 글별 순위 상태: key = log_no
  const [rankStates, setRankStates] = useState<Record<string, PostRankState>>({});

  // 자동 순위 확인 중단 플래그
  const autoCheckAbortRef = useRef(false);
  // 자동 순위 확인 진행 중 여부
  const [autoChecking, setAutoChecking] = useState(false);

  // ===== 초기 로드: localStorage에서 계정 목록 복원 =====
  useEffect(() => {
    const savedAccounts = getAccounts(userId);
    setAccounts(savedAccounts);
    // 첫 번째 계정이 있으면 자동 선택
    if (savedAccounts.length > 0) {
      setActiveBlogId(savedAccounts[0]);
    }
  }, [userId]);

  // 블로그 선택 시 저장된 데이터 복원은 위 autoLoad useEffect에서 처리

  // ===== 블로그 추가 =====
  const handleAddBlog = useCallback(() => {
    const id = extractBlogId(blogIdInput);
    if (!id) {
      setError('블로그 ID를 입력해주세요.');
      return;
    }
    if (accounts.includes(id)) {
      setError('이미 등록된 블로그입니다.');
      return;
    }
    if (accounts.length >= 10) {
      setError('최대 10개 블로그까지 등록할 수 있습니다.');
      return;
    }

    autoCheckAbortRef.current = true; // 기존 자동 확인 중단
    const newAccounts = [...accounts, id];
    setAccounts(newAccounts);
    saveAccounts(newAccounts, userId);
    setActiveBlogId(id);
    setBlogIdInput('');
    setError(null);
    setPosts([]);
    setRankStates({});
    setTotalCount(0);
  }, [blogIdInput, accounts, userId]);

  // ===== 블로그 삭제 =====
  const handleRemoveBlog = useCallback(
    (blogId: string) => {
      const newAccounts = accounts.filter((a) => a !== blogId);
      setAccounts(newAccounts);
      saveAccounts(newAccounts, userId);
      removeBlogData(blogId, userId);

      if (activeBlogId === blogId) {
        const next = newAccounts.length > 0 ? newAccounts[0] : '';
        setActiveBlogId(next);
        if (!next) {
          setPosts([]);
          setRankStates({});
          setTotalCount(0);
        }
      }
    },
    [accounts, activeBlogId, userId],
  );

  // ===== 블로그 탭 선택 =====
  const handleSelectBlog = useCallback(
    (blogId: string) => {
      autoCheckAbortRef.current = true; // 기존 자동 확인 중단
      setActiveBlogId(blogId);
      setError(null);
    },
    [],
  );

  // ===== localStorage에 현재 상태 저장 =====
  const saveCurrentState = useCallback(
    (logNo: string, keyword: string, rankings?: RankingEntry[]) => {
      if (!activeBlogId) return;

      const existing = getBlogData(activeBlogId, userId) || { blogId: activeBlogId, posts: [] };

      const postIdx = existing.posts.findIndex((p) => p.logNo === logNo);
      const post = posts.find((p) => p.log_no === logNo);

      const postData: SavedPostData = {
        logNo,
        title: post ? decodeTitle(post.title) : '',
        url: post ? post.url : '',
        keyword,
        lastRank: rankings || (postIdx >= 0 ? existing.posts[postIdx].lastRank : undefined),
      };

      if (postIdx >= 0) {
        existing.posts[postIdx] = postData;
      } else {
        existing.posts.push(postData);
      }

      // 빈 키워드 제거
      existing.posts = existing.posts.filter((p) => p.keyword.trim() !== '');

      saveBlogData(existing, userId);
    },
    [activeBlogId, posts, userId],
  );

  // ===== 검색수 조회 =====
  const fetchSearchVolume = useCallback(async (keyword: string, logNo: string) => {
    try {
      const stats = await getKeywordStats(keyword);
      const pcVol = stats.pc_search_volume ?? 0;
      const mobVol = stats.mobile_search_volume ?? 0;
      const total = pcVol + mobVol;
      setRankStates((prev) => ({
        ...prev,
        [logNo]: { ...prev[logNo], searchVolume: total > 0 ? total : null },
      }));
    } catch {
      // 검색수 조회 실패해도 순위 확인에는 영향 없음
    }
  }, []);

  // ===== 자동 순위 확인 (키워드가 있는 글들 순차 실행) =====
  const autoCheckRankings = useCallback(
    async (postsToCheck: { logNo: string; keyword: string }[]) => {
      if (postsToCheck.length === 0 || !activeBlogId) return;

      autoCheckAbortRef.current = false;
      setAutoChecking(true);

      for (const { logNo, keyword } of postsToCheck) {
        if (autoCheckAbortRef.current) break;

        // 로딩 상태 설정
        setRankStates((prev) => ({
          ...prev,
          [logNo]: { ...prev[logNo], keyword, loading: true, error: null, result: prev[logNo]?.result || null },
        }));

        try {
          // 순위 확인과 검색수 조회를 병렬로 실행
          const [result] = await Promise.all([
            checkRanking(keyword, activeBlogId, logNo),
            fetchSearchVolume(keyword, logNo),
          ]);
          if (autoCheckAbortRef.current) break;

          setRankStates((prev) => ({
            ...prev,
            [logNo]: { ...prev[logNo], loading: false, result, error: null },
          }));

          // localStorage에 저장
          saveCurrentState(logNo, keyword, result.rankings);
        } catch (err: unknown) {
          if (autoCheckAbortRef.current) break;
          const parsed = parseApiError(err);
          setRankStates((prev) => ({
            ...prev,
            [logNo]: { ...prev[logNo], loading: false, error: parsed.message, result: null },
          }));
        }

        // 서버 부하 방지: 1초 간격
        if (!autoCheckAbortRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      setAutoChecking(false);
    },
    [activeBlogId, saveCurrentState, fetchSearchVolume],
  );

  // ===== 블로그 선택 시 자동으로 글 목록 불러오기 + 순위 확인 =====
  useEffect(() => {
    if (!activeBlogId) return;

    // 이전 자동 확인 중단
    autoCheckAbortRef.current = true;

    const loadAndCheck = async () => {
      // 글 목록 불러오기
      setLoading(true);
      setError(null);
      setPosts([]);
      setTotalCount(0);

      try {
        const response = await getBlogPosts(activeBlogId, postCount);
        setPosts(response.posts);
        setTotalCount(response.total_count);

        if (response.posts.length === 0) {
          setError('글 목록을 불러올 수 없습니다. 블로그 ID를 확인해주세요.');
          setLoading(false);
          return;
        }

        // 저장된 키워드 복원
        const savedData = getBlogData(activeBlogId, userId);
        const restoredStates: Record<string, PostRankState> = {};
        const postsToAutoCheck: { logNo: string; keyword: string }[] = [];

        if (savedData) {
          response.posts.forEach((post) => {
            const savedPost = savedData.posts.find((sp) => sp.logNo === post.log_no);
            if (savedPost && savedPost.keyword) {
              restoredStates[post.log_no] = {
                keyword: savedPost.keyword,
                loading: false,
                result: savedPost.lastRank
                  ? {
                      keyword: savedPost.keyword,
                      blog_id: activeBlogId,
                      log_no: post.log_no,
                      found: savedPost.lastRank.length > 0,
                      rankings: savedPost.lastRank,
                    }
                  : null,
                error: null,
                searchVolume: null,
              };
              // 키워드가 있는 글은 자동 순위 확인 대상
              postsToAutoCheck.push({ logNo: post.log_no, keyword: savedPost.keyword });
            }
          });
        }

        setRankStates(restoredStates);
        setLoading(false);

        // 키워드가 있는 글들 자동 순위 확인
        if (postsToAutoCheck.length > 0) {
          // 약간의 딜레이 후 시작 (UI 업데이트 대기)
          await new Promise((resolve) => setTimeout(resolve, 300));
          await autoCheckRankings(postsToAutoCheck);
        }
      } catch (err: unknown) {
        const parsed = parseApiError(err);
        setError(parsed.message);
        setLoading(false);
      }
    };

    loadAndCheck();

    return () => {
      autoCheckAbortRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBlogId, userId]);

  // ===== 블로그 글 목록 불러오기 (수동 새로고침) =====
  const handleFetchPosts = useCallback(async () => {
    if (!activeBlogId) {
      setError('블로그를 먼저 등록해주세요.');
      return;
    }

    // 기존 자동 확인 중단
    autoCheckAbortRef.current = true;

    setLoading(true);
    setError(null);
    setPosts([]);
    setTotalCount(0);

    try {
      const response = await getBlogPosts(activeBlogId, postCount);
      setPosts(response.posts);
      setTotalCount(response.total_count);

      if (response.posts.length === 0) {
        setError('글 목록을 불러올 수 없습니다. 블로그 ID를 확인해주세요.');
      } else {
        // 저장된 키워드 복원 + 자동 순위 확인
        const savedData = getBlogData(activeBlogId, userId);
        const restoredStates: Record<string, PostRankState> = {};
        const postsToAutoCheck: { logNo: string; keyword: string }[] = [];

        if (savedData) {
          response.posts.forEach((post) => {
            const savedPost = savedData.posts.find((sp) => sp.logNo === post.log_no);
            if (savedPost && savedPost.keyword) {
              restoredStates[post.log_no] = {
                keyword: savedPost.keyword,
                loading: false,
                result: savedPost.lastRank
                  ? {
                      keyword: savedPost.keyword,
                      blog_id: activeBlogId,
                      log_no: post.log_no,
                      found: savedPost.lastRank.length > 0,
                      rankings: savedPost.lastRank,
                    }
                  : null,
                error: null,
                searchVolume: null,
              };
              postsToAutoCheck.push({ logNo: post.log_no, keyword: savedPost.keyword });
            }
          });
          setRankStates((prev) => ({ ...restoredStates, ...prev }));
        }

        // 자동 순위 확인 시작
        if (postsToAutoCheck.length > 0) {
          setTimeout(() => autoCheckRankings(postsToAutoCheck), 300);
        }
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [activeBlogId, postCount, userId, autoCheckRankings]);

  // ===== 키워드 입력 변경 =====
  const handleKeywordChange = useCallback((logNo: string, keyword: string) => {
    setRankStates((prev) => ({
      ...prev,
      [logNo]: {
        ...prev[logNo],
        keyword,
        result: prev[logNo]?.result || null,
        loading: prev[logNo]?.loading || false,
        error: prev[logNo]?.error || null,
        searchVolume: prev[logNo]?.searchVolume ?? null,
      },
    }));
  }, []);

  // ===== 키워드 삭제 (빈칸으로) =====
  const handleKeywordClear = useCallback(
    (logNo: string) => {
      setRankStates((prev) => {
        const newStates = { ...prev };
        delete newStates[logNo];
        return newStates;
      });
      // localStorage에서도 제거
      if (activeBlogId) {
        const existing = getBlogData(activeBlogId, userId);
        if (existing) {
          existing.posts = existing.posts.filter((p) => p.logNo !== logNo);
          saveBlogData(existing, userId);
        }
      }
    },
    [activeBlogId, userId],
  );

  // ===== 순위 확인 =====
  const handleCheckRank = useCallback(
    async (logNo: string) => {
      const state = rankStates[logNo];
      const keyword = state?.keyword?.trim();
      if (!keyword || !activeBlogId) return;

      setRankStates((prev) => ({
        ...prev,
        [logNo]: { ...prev[logNo], loading: true, error: null, result: null },
      }));

      try {
        // 순위 확인과 검색수 조회를 병렬로 실행
        const [result] = await Promise.all([
          checkRanking(keyword, activeBlogId, logNo),
          fetchSearchVolume(keyword, logNo),
        ]);
        setRankStates((prev) => ({
          ...prev,
          [logNo]: { ...prev[logNo], loading: false, result, error: null },
        }));

        // localStorage에 저장
        saveCurrentState(logNo, keyword, result.rankings);
      } catch (err: unknown) {
        const parsed = parseApiError(err);
        setRankStates((prev) => ({
          ...prev,
          [logNo]: { ...prev[logNo], loading: false, error: parsed.message, result: null },
        }));
      }
    },
    [activeBlogId, rankStates, saveCurrentState, fetchSearchVolume],
  );

  // Enter 키로 블로그 등록
  const handleBlogInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleAddBlog();
      }
    },
    [handleAddBlog],
  );

  // 키워드 입력란에서 Enter 키로 순위 확인
  const handleKeywordKeyDown = useCallback(
    (e: React.KeyboardEvent, logNo: string) => {
      if (e.key === 'Enter') {
        handleCheckRank(logNo);
      }
    },
    [handleCheckRank],
  );

  // ===== 순위 결과 렌더링 (1줄) =====
  const renderRankResult = (logNo: string) => {
    const state = rankStates[logNo];
    if (!state) return null;

    if (state.loading) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-naver-green border-t-transparent rounded-full animate-spin"></div>
          <span className="text-dark-muted text-sm">확인 중...</span>
        </div>
      );
    }

    if (state.error) {
      return <span className="text-red-400 text-sm">{state.error}</span>;
    }

    if (state.result) {
      if (state.result.found && state.result.rankings.length > 0) {
        // 1줄 표시: "웹사이트 3위 · 인기글 5위"
        const rankText = state.result.rankings
          .map((r) => `${r.section} ${r.rank}위`)
          .join(' · ');

        return (
          <span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-sm font-bold whitespace-nowrap">
            {rankText}
          </span>
        );
      } else {
        return (
          <span className="px-2 py-1 bg-dark-border text-dark-muted rounded text-sm">
            순위권 밖
          </span>
        );
      }
    }

    return null;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">순위 추적</h1>

      <p className="text-dark-muted text-sm mb-6">
        블로그를 등록하고, 글별 키워드 순위를 추적합니다. 최대 10개 블로그 등록 가능.
      </p>

      {/* ===== 등록된 블로그 탭 ===== */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-dark-muted text-sm mr-1">등록된 블로그:</span>
          {accounts.map((acc) => (
            <div
              key={acc}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition ${
                activeBlogId === acc
                  ? 'bg-naver-green text-white'
                  : 'bg-dark-bg border border-dark-border text-dark-muted hover:border-naver-green hover:text-dark-text'
              }`}
            >
              <span onClick={() => handleSelectBlog(acc)}>{acc}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveBlog(acc);
                }}
                className="ml-1 text-xs opacity-60 hover:opacity-100 hover:text-red-400 transition"
                title="블로그 삭제"
              >
                x
              </button>
            </div>
          ))}
          {accounts.length < 10 && (
            <span className="text-dark-muted text-xs ml-2">
              ({accounts.length}/10)
            </span>
          )}
        </div>
      )}

      {/* ===== 블로그 ID 입력 (추가) ===== */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          value={blogIdInput}
          onChange={(e) => setBlogIdInput(e.target.value)}
          onKeyDown={handleBlogInputKeyDown}
          placeholder="블로그 ID 또는 URL 입력 (예: myblog123 또는 blog.naver.com/myblog123)"
          className="flex-1 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green"
        />
        <button
          onClick={handleAddBlog}
          disabled={!blogIdInput.trim()}
          className="px-6 py-3 naver-gradient text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition whitespace-nowrap"
        >
          등록
        </button>
      </div>

      {/* ===== 활성 블로그: 글 개수 + 불러오기 ===== */}
      {activeBlogId && (
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-dark-muted text-sm">글 개수:</span>
            {([30, 60, 90] as const).map((count) => (
              <button
                key={count}
                onClick={() => setPostCount(count)}
                className={`px-3 py-1.5 text-sm rounded transition ${
                  postCount === count
                    ? 'bg-naver-green text-white'
                    : 'bg-dark-bg border border-dark-border text-dark-muted hover:border-naver-green hover:text-dark-text'
                }`}
              >
                {count}개
              </button>
            ))}
          </div>
          <button
            onClick={handleFetchPosts}
            disabled={loading}
            className="px-5 py-1.5 bg-naver-green/20 text-naver-green text-sm rounded-lg hover:bg-naver-green/30 disabled:opacity-50 transition whitespace-nowrap"
          >
            {loading ? '불러오는 중...' : '글 목록 불러오기'}
          </button>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500 rounded-lg mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-naver-green border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-dark-muted text-sm">블로그 글 목록 불러오는 중...</p>
        </div>
      )}

      {/* ===== 글 목록 테이블 ===== */}
      {!loading && posts.length > 0 && (
        <div className="glass-card overflow-hidden">
          {/* 헤더 */}
          <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{activeBlogId} 글 목록</h2>
              <p className="text-dark-muted text-sm mt-1">
                총 {totalCount}개 글
              </p>
            </div>
            {autoChecking && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-naver-green border-t-transparent rounded-full animate-spin"></div>
                <span className="text-naver-green text-sm">순위 자동 확인 중...</span>
              </div>
            )}
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-dark-border bg-dark-bg/50">
                  <th className="px-2 py-3 text-left text-dark-muted w-10">#</th>
                  <th className="px-2 py-3 text-left text-dark-muted">글 제목</th>
                  <th className="px-2 py-3 text-left text-dark-muted w-[160px]">키워드</th>
                  <th className="px-2 py-3 text-right text-dark-muted w-[100px]">검색수</th>
                  <th className="px-2 py-3 text-left text-dark-muted w-[180px]">순위</th>
                  <th className="px-2 py-3 text-center text-dark-muted w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post, idx) => {
                  const state = rankStates[post.log_no];
                  const hasResult = state?.result?.found;

                  return (
                    <tr
                      key={post.log_no}
                      className={`border-b border-dark-border/30 hover:bg-dark-hover transition ${
                        hasResult ? 'bg-green-600/5' : ''
                      }`}
                    >
                      {/* 번호 */}
                      <td className="px-2 py-2 text-dark-muted w-10">{idx + 1}</td>

                      {/* 글 제목 */}
                      <td className="px-2 py-2">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline block truncate text-xs"
                          title={decodeTitle(post.title)}
                        >
                          {decodeTitle(post.title)}
                        </a>
                      </td>

                      {/* 키워드 입력 */}
                      <td className="px-2 py-2 w-[160px]">
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={state?.keyword || ''}
                            onChange={(e) => handleKeywordChange(post.log_no, e.target.value)}
                            onKeyDown={(e) => handleKeywordKeyDown(e, post.log_no)}
                            placeholder="키워드"
                            className="flex-1 min-w-0 px-2 py-1 bg-dark-bg border border-dark-border rounded text-dark-text text-xs placeholder-dark-muted focus:outline-none focus:border-naver-green"
                          />
                          {state?.keyword && (
                            <button
                              onClick={() => handleKeywordClear(post.log_no)}
                              className="px-1 py-1 text-dark-muted text-xs rounded hover:text-red-400 hover:bg-red-500/10 transition flex-shrink-0"
                              title="키워드 삭제"
                            >
                              x
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 검색수 */}
                      <td className="px-2 py-2 text-right w-[100px]">
                        {state?.searchVolume != null ? (
                          <span className="text-xs text-dark-muted whitespace-nowrap">
                            {state.searchVolume.toLocaleString()}
                          </span>
                        ) : state?.loading ? (
                          <span className="text-xs text-dark-muted">-</span>
                        ) : null}
                      </td>

                      {/* 순위 결과 (1줄) */}
                      <td className="px-2 py-2 w-[180px]">{renderRankResult(post.log_no)}</td>

                      {/* 확인 버튼 */}
                      <td className="px-2 py-2 text-center w-[60px]">
                        <button
                          onClick={() => handleCheckRank(post.log_no)}
                          disabled={!state?.keyword?.trim() || state?.loading}
                          className="px-2 py-1 bg-naver-green/20 text-naver-green text-xs rounded hover:bg-naver-green/30 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                        >
                          확인
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && posts.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg
            className="w-16 h-16 text-dark-muted mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {accounts.length === 0 ? (
            <>
              <p className="text-dark-muted text-lg mb-2">블로그를 등록해주세요</p>
              <p className="text-dark-muted text-sm">
                상단에 블로그 ID를 입력하고 등록 버튼을 누르세요.
                <br />
                최대 10개 블로그를 등록하고 순위를 추적할 수 있습니다.
              </p>
            </>
          ) : (
            <>
              <p className="text-dark-muted text-lg mb-2">글 목록을 불러오세요</p>
              <p className="text-dark-muted text-sm">
                &quot;글 목록 불러오기&quot; 버튼을 눌러 블로그 글 목록을 불러옵니다.
                <br />
                각 글에 키워드를 입력하여 네이버 검색 순위를 확인할 수 있습니다.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(RankTracker);

import { useState, useEffect, useCallback, useRef } from 'react';
import KeywordInput from './components/KeywordInput/KeywordInput';
// @ts-ignore -- ProgressLog는 다른 곳에서 재사용 가능하므로 import 유지
import ProgressLog from './components/ProgressLog/ProgressLog';
import ResultsTable from './components/ResultsTable/ResultsTable';
import KeywordSearch from './pages/KeywordSearch';
import BlogDiagnose from './pages/BlogDiagnose';
import PostDiagnose from './pages/PostDiagnose';
import MorphemeAnalyze from './pages/MorphemeAnalyze';
import RankTracker from './pages/RankTracker';
// @ts-ignore
import SettingsButton from './components/Settings/SettingsButton';
import ApiSettingsModal from './components/Settings/ApiSettingsModal';
import Sidebar from './components/Sidebar/Sidebar';
import {
  healthCheck,
  startAnalysis,
  getAnalysisStatus,
  getAnalysisResult,
  closeDriver,
  getNaverAdSettings,
  getRelatedKeywords,
  signup,
  login,
  getMe,
  parseApiError,
  AnalysisStatus,
  AnalysisResult,
  RelatedKeywordsResponse,
  RelatedKeywordItem,
  AuthUser,
} from './services/api';

type AppStatus = 'connecting' | 'ready' | 'waiting_login' | 'analyzing' | 'completed' | 'error';
type TabType = 'keyword' | 'blog' | 'post' | 'morpheme' | 'batch' | 'rank';

function App() {
  // ===== 앱 레벨 인증 상태 =====
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [appStatus, setAppStatus] = useState<AppStatus>('connecting');
  const [activeTab, setActiveTab] = useState<TabType>('keyword');
  const [postDiagnoseUrl, setPostDiagnoseUrl] = useState<string>(''); // 포스팅 진단으로 전달할 URL
  // @ts-ignore
  const [isLoggedIn, setIsLoggedIn] = useState(false); // eslint-disable-line
  const [keywords, setKeywords] = useState<string[]>([]);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedKeyword, setSelectedKeyword] = useState<string>('');
  const [error, setError] = useState<string>('');

  // 이전 분석 결과 누적 저장
  const [allResults, setAllResults] = useState<AnalysisResult[]>([]);

  // 연관 키워드 관련 상태
  const [batchRelatedKeywords, setBatchRelatedKeywords] = useState<RelatedKeywordsResponse | null>(null);
  const [batchRelatedLoading, setBatchRelatedLoading] = useState(false);
  const [batchRelatedError, setBatchRelatedError] = useState<string | null>(null);

  // 연관 키워드 토글 (localStorage 저장)
  const [batchRelatedEnabled, setBatchRelatedEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('batchRelatedKeywordsEnabled');
    return saved !== null ? saved === 'true' : true;
  });

  // 설정 모달 관련 상태
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isApiConfigured, setIsApiConfigured] = useState(false);

  // API 설정 상태 확인
  const checkApiConfiguration = useCallback(() => {
    getNaverAdSettings()
      .then((data) => {
        setIsApiConfigured(data.is_configured);
      })
      .catch(() => {
        setIsApiConfigured(false);
      });
  }, []);

  // ===== 페이지 로드 시 토큰으로 자동 로그인 =====
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      getMe(token)
        .then((user) => {
          setAuthUser(user);
          setAuthLoading(false);
        })
        .catch(() => {
          localStorage.removeItem('auth_token');
          setAuthLoading(false);
        });
    } else {
      setAuthLoading(false);
    }
  }, []);

  // ===== 회원가입 =====
  const handleAuthSignup = useCallback(async () => {
    if (!authUsername.trim() || authUsername.trim().length < 2) {
      setAuthError('아이디는 2자 이상이어야 합니다.');
      return;
    }
    if (!authPassword || authPassword.length < 4) {
      setAuthError('비밀번호는 4자 이상이어야 합니다.');
      return;
    }
    if (authPassword !== authPasswordConfirm) {
      setAuthError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setAuthSubmitting(true);
    setAuthError(null);

    try {
      const res = await signup(authUsername.trim(), authPassword);
      localStorage.setItem('auth_token', res.token);
      setAuthUser(res.user);
      setAuthUsername('');
      setAuthPassword('');
      setAuthPasswordConfirm('');
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setAuthError(parsed.message);
    } finally {
      setAuthSubmitting(false);
    }
  }, [authUsername, authPassword, authPasswordConfirm]);

  // ===== 로그인 =====
  const handleAuthLogin = useCallback(async () => {
    if (!authUsername.trim() || !authPassword) {
      setAuthError('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    setAuthSubmitting(true);
    setAuthError(null);

    try {
      const res = await login(authUsername.trim(), authPassword);
      localStorage.setItem('auth_token', res.token);
      setAuthUser(res.user);
      setAuthUsername('');
      setAuthPassword('');
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setAuthError(parsed.message);
    } finally {
      setAuthSubmitting(false);
    }
  }, [authUsername, authPassword]);

  // ===== 로그아웃 =====
  const handleAuthLogout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setAuthUser(null);
  }, []);

  // ===== 인증 폼 Enter 처리 =====
  const handleAuthKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (authTab === 'login') handleAuthLogin();
        else handleAuthSignup();
      }
    },
    [authTab, handleAuthLogin, handleAuthSignup],
  );

  useEffect(() => {
    checkApiConfiguration();
  }, [checkApiConfiguration]);

  // 설정 모달 열기/닫기
  const handleOpenSettings = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsModalOpen(false);
  }, []);

  // 설정 저장 성공 시
  const handleSettingsSaveSuccess = useCallback(() => {
    checkApiConfiguration();
  }, [checkApiConfiguration]);

  // 서버 연결 확인
  useEffect(() => {
    const checkConnection = async () => {
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        const isHealthy = await healthCheck();
        if (isHealthy) {
          setAppStatus('ready');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      setAppStatus('error');
      setError('서버에 연결할 수 없습니다. Python 서버가 실행 중인지 확인하세요.');
    };

    checkConnection();
  }, []);

  // 분석 상태 폴링
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (appStatus === 'analyzing') {
      interval = setInterval(async () => {
        try {
          const status = await getAnalysisStatus();
          setAnalysisStatus(status);

          if (status.status === 'completed') {
            const result = await getAnalysisResult();
            setResults(result.results);
            if (result.results.length > 0) {
              setSelectedKeyword(result.results[0].keyword);
            }
            setAppStatus('completed');
          } else if (status.status === 'error') {
            setAppStatus('error');
            setError('분석 중 오류가 발생했습니다.');
          }
        } catch (err) {
          console.error('Status polling error:', err);
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [appStatus]);


  // 분석 시작
  const handleStartAnalysis = useCallback(async () => {
    if (keywords.length === 0) {
      setError('키워드를 입력해주세요.');
      return;
    }

    try {
      setError('');
      setAppStatus('analyzing');
      setResults([]);
      await startAnalysis(keywords);
    } catch (err) {
      setError('분석을 시작할 수 없습니다.');
      setAppStatus('ready');
    }
  }, [keywords]);

  // 분석 완료 시 연관 키워드 자동 조회
  useEffect(() => {
    if (appStatus === 'completed' && results.length > 0 && batchRelatedEnabled && isApiConfigured) {
      const firstKeyword = results[0].keyword;
      setBatchRelatedLoading(true);
      setBatchRelatedError(null);
      getRelatedKeywords(firstKeyword.trim())
        .then((data) => {
          setBatchRelatedKeywords(data);
        })
        .catch(() => {
          setBatchRelatedError('연관 키워드를 조회하지 못했습니다.');
        })
        .finally(() => {
          setBatchRelatedLoading(false);
        });
    }
  }, [appStatus, results, batchRelatedEnabled, isApiConfigured]);

  // 연관 키워드 토글 변경 핸들러
  const handleBatchRelatedToggle = useCallback((enabled: boolean) => {
    setBatchRelatedEnabled(enabled);
    localStorage.setItem('batchRelatedKeywordsEnabled', String(enabled));
  }, []);

  // 대량 조회 연관 키워드 조회 함수
  const fetchBatchRelatedKeywords = useCallback(async (searchKeywords: string[]) => {
    if (!isApiConfigured || searchKeywords.length === 0 || !batchRelatedEnabled) return;

    setBatchRelatedLoading(true);
    setBatchRelatedError(null);

    try {
      // 첫 번째 키워드 기준으로 연관 키워드 조회
      const data = await getRelatedKeywords(searchKeywords[0].trim());
      setBatchRelatedKeywords(data);
    } catch {
      setBatchRelatedError('연관 키워드를 조회하지 못했습니다.');
    } finally {
      setBatchRelatedLoading(false);
    }
  }, [isApiConfigured, batchRelatedEnabled]);

  // 새 분석
  const handleNewAnalysis = useCallback(async () => {
    try {
      await closeDriver();
    } catch {
      // ignore
    }
    // 현재 결과가 있으면 누적 저장
    if (results.length > 0) {
      setAllResults(prev => [...prev, ...results]);
    }
    setAppStatus('ready');
    setIsLoggedIn(false);
    setKeywords([]);
    setResults([]);
    setAnalysisStatus(null);
    setSelectedKeyword('');
    setError('');
    // 연관 키워드는 유지 (누적 결과와 함께)
  }, [results]);

  // 랜덤 멘트 목록
  const loadingMessages = [
    "샅샅이 분석 중...",
    "더 좋은 키워드 있나 보는 중...",
    "네이버 검색결과 뒤지는 중...",
    "경쟁사 키워드 몰래 엿보는 중...",
    "검색 트렌드 파악 중...",
    "숨겨진 키워드 발굴 중...",
    "데이터 수집하는 중...",
    "광고 전략 분석 중...",
    "상위노출 비밀 해독 중...",
    "블로그 순위 계산 중...",
    "키워드 가치 평가 중...",
    "검색량 데이터 긁어오는 중...",
    "AI가 열심히 일하는 중...",
    "잠시만요, 거의 다 됐어요...",
    "커피 한 잔 하고 오셔도 돼요...",
    "열심히 분석하고 있으니 조금만...",
    "좋은 결과가 나올 거예요...",
    "네이버 서버와 대화 중...",
    "키워드 맛집 찾는 중...",
    "SEO 전문가가 분석 중...",
    "검색 알고리즘 해독 중...",
    "빅데이터 처리 중...",
    "마케팅 인사이트 추출 중...",
    "경쟁 강도 측정 중...",
  ];

  // 랜덤 멘트 상태
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const loadingMessagesRef = useRef(loadingMessages);

  // 분석 중일 때 3초마다 랜덤 멘트 변경
  useEffect(() => {
    if (appStatus !== 'analyzing') return;

    const messages = loadingMessagesRef.current;
    setLoadingMessage(messages[Math.floor(Math.random() * messages.length)]);

    const interval = setInterval(() => {
      setLoadingMessage(prev => {
        let next = prev;
        while (next === prev) {
          next = messages[Math.floor(Math.random() * messages.length)];
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [appStatus]);

  // 현재 선택된 키워드의 결과
  const currentResult = results.find(r => r.keyword === selectedKeyword);

  // 블로그 진단에서 포스팅 진단으로 이동하는 함수
  const handleNavigateToPostDiagnose = useCallback((url: string) => {
    setPostDiagnoseUrl(url);
    setActiveTab('post');
  }, []);

  // 대량 조회 결과에서 키워드 클릭 시 단일 키워드 조회 탭으로 이동
  const [batchToKeyword, setBatchToKeyword] = useState<string>('');
  const handleKeywordClick = useCallback((keyword: string) => {
    setBatchToKeyword(keyword);
    setActiveTab('keyword');
  }, []);

  // 탭 목록 (Sidebar 컴포넌트에서 관리)

  // ===== 인증 로딩 중 =====
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-naver-green border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-dark-muted">로딩 중...</p>
        </div>
      </div>
    );
  }

  // ===== 로그인 안 된 상태: 로그인/회원가입 화면 =====
  if (!authUser) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-dark-bg px-4">
        <div className="w-full max-w-md">
          {/* 로고 */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl naver-gradient flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">H</span>
            </div>
            <h1 className="text-2xl font-bold text-dark-text">핸디 블로그 엔지니어링</h1>
            <p className="text-dark-muted text-sm mt-2">로그인하여 모든 기능을 이용하세요</p>
          </div>

          {/* 카드 */}
          <div className="glass-card p-6">
            {/* 탭 */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => { setAuthTab('login'); setAuthError(null); }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition ${
                  authTab === 'login'
                    ? 'bg-naver-green text-white'
                    : 'bg-dark-bg border border-dark-border text-dark-muted hover:text-dark-text'
                }`}
              >
                로그인
              </button>
              <button
                onClick={() => { setAuthTab('signup'); setAuthError(null); }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition ${
                  authTab === 'signup'
                    ? 'bg-naver-green text-white'
                    : 'bg-dark-bg border border-dark-border text-dark-muted hover:text-dark-text'
                }`}
              >
                회원가입
              </button>
            </div>

            {/* 로그인 폼 */}
            {authTab === 'login' && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  onKeyDown={handleAuthKeyDown}
                  placeholder="아이디"
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green"
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={handleAuthKeyDown}
                  placeholder="비밀번호"
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green"
                />
                <button
                  onClick={handleAuthLogin}
                  disabled={authSubmitting}
                  className="w-full px-4 py-3 naver-gradient text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
                >
                  {authSubmitting ? '로그인 중...' : '로그인'}
                </button>
              </div>
            )}

            {/* 회원가입 폼 */}
            {authTab === 'signup' && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  onKeyDown={handleAuthKeyDown}
                  placeholder="아이디 (2자 이상)"
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green"
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={handleAuthKeyDown}
                  placeholder="비밀번호 (4자 이상)"
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green"
                />
                <input
                  type="password"
                  value={authPasswordConfirm}
                  onChange={(e) => setAuthPasswordConfirm(e.target.value)}
                  onKeyDown={handleAuthKeyDown}
                  placeholder="비밀번호 확인"
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green"
                />
                <button
                  onClick={handleAuthSignup}
                  disabled={authSubmitting}
                  className="w-full px-4 py-3 naver-gradient text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
                >
                  {authSubmitting ? '가입 중...' : '회원가입'}
                </button>
              </div>
            )}

            {/* 에러 메시지 */}
            {authError && (
              <p className="mt-4 text-red-400 text-sm text-center">{authError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== 로그인 된 상태: 기존 앱 =====
  return (
    <div className="h-screen flex bg-dark-bg">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        username={authUser.username || authUser.nickname || ''}
        onLogout={handleAuthLogout}
        onOpenSettings={handleOpenSettings}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Loading/Connecting State */}
        {appStatus === 'connecting' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-naver-green border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-dark-muted">서버에 연결 중...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {appStatus === 'error' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-dark-border hover:bg-dark-hover rounded-lg transition"
              >
                다시 시도
              </button>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {appStatus !== 'connecting' && appStatus !== 'error' && (
          <div className="flex-1 overflow-auto">
            {/* 키워드 조회 */}
            {activeTab === 'keyword' && (
              <KeywordSearch
                onOpenSettings={handleOpenSettings}
                initialKeyword={batchToKeyword}
                onInitialKeywordConsumed={() => setBatchToKeyword('')}
              />
            )}

            {/* 순위 추적 */}
            {activeTab === 'rank' && <RankTracker userId={authUser.id} />}

            {/* 블로그 진단 */}
            {activeTab === 'blog' && <BlogDiagnose onNavigateToPostDiagnose={handleNavigateToPostDiagnose} />}

            {/* 포스팅 진단 */}
            {activeTab === 'post' && (
              <PostDiagnose
                initialUrl={postDiagnoseUrl}
                onUrlConsumed={() => setPostDiagnoseUrl('')}
              />
            )}

            {/* 형태소 진단 */}
            {activeTab === 'morpheme' && <MorphemeAnalyze />}

            {/* 대량 조회 (기존 기능) */}
            {activeTab === 'batch' && (
              <>
                {/* Ready State - Keyword Input */}
                {(appStatus === 'ready' || appStatus === 'waiting_login') && (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-5xl mx-auto">
                      <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold mb-2">대량 키워드 조회</h2>
                        <p className="text-dark-muted">여러 키워드를 동시에 조회합니다.</p>
                      </div>

                      <KeywordInput
                        keywords={keywords}
                        onKeywordsChange={setKeywords}
                      />

                      {error && (
                        <p className="text-red-400 text-sm mt-4 text-center">{error}</p>
                      )}

                      <div className="flex gap-4 mt-8 justify-center">
                        <button
                          onClick={handleStartAnalysis}
                          disabled={keywords.length === 0}
                          className={`px-8 py-3 rounded-lg font-medium transition ${
                            keywords.length === 0
                              ? 'bg-dark-border text-dark-muted cursor-not-allowed'
                              : 'naver-gradient text-white hover:opacity-90'
                          }`}
                        >
                          분석 시작
                        </button>
                      </div>

                      <p className="text-dark-muted text-sm text-center mt-4">
                        로그인 없이도 분석이 가능하지만, 일부 데이터는 제한될 수 있습니다.
                      </p>
                    </div>
                  </div>
                )}

                {/* Analyzing State */}
                {appStatus === 'analyzing' && analysisStatus && (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center max-w-md w-full">
                      {/* 스피너 */}
                      <div className="w-16 h-16 border-4 border-naver-green border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>

                      {/* 랜덤 멘트 */}
                      <p className="text-lg text-dark-text font-medium mb-3 transition-opacity duration-500">
                        {loadingMessage}
                      </p>

                      {/* 현재 진행 상황 */}
                      <p className="text-dark-muted text-sm mb-6">
                        {analysisStatus.current_task ? (
                          <>
                            <span className="text-naver-green font-medium">
                              "{analysisStatus.current_task}"
                            </span>{' '}
                            분석 중...
                            {keywords.length > 1 && (
                              <span className="ml-1">
                                ({Math.min(Math.round(analysisStatus.progress / 100 * keywords.length) + 1, keywords.length)}/{keywords.length})
                              </span>
                            )}
                          </>
                        ) : (
                          '분석 준비 중...'
                        )}
                      </p>

                      {/* 진행률 바 */}
                      <div className="w-full bg-dark-border rounded-full h-2.5 mb-2">
                        <div
                          className="bg-naver-green h-2.5 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${Math.max(analysisStatus.progress, 2)}%` }}
                        ></div>
                      </div>
                      <p className="text-dark-muted text-xs">
                        {Math.round(analysisStatus.progress)}%
                      </p>
                    </div>
                  </div>
                )}

                {/* Completed State - Results Table */}
                {appStatus === 'completed' && results.length > 0 && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* 요약 정보 */}
                    <div className="px-6 py-4 border-b border-dark-border bg-dark-card/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-xl font-bold">분석 결과</h2>
                          <p className="text-dark-muted text-sm mt-1">
                            총 {results.length}개 키워드 분석 완료
                            {allResults.length > 0 && (
                              <span className="ml-2 text-dark-muted">
                                (이전 결과 {allResults.length}개 포함)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {allResults.length > 0 && (
                            <button
                              onClick={() => setAllResults([])}
                              className="px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
                            >
                              이전 결과 삭제
                            </button>
                          )}
                          <button
                            onClick={handleNewAnalysis}
                            className="px-4 py-2 bg-dark-border hover:bg-dark-hover rounded-lg transition"
                          >
                            새 분석
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 테이블 - 이전 결과 + 현재 결과 */}
                    <div className="flex-1 overflow-auto">
                      <ResultsTable results={[...allResults, ...results]} onKeywordClick={handleKeywordClick} />

                      {/* 연관 키워드 섹션 */}
                      {isApiConfigured && (
                        <div className="px-6 py-4">
                          <div className="glass-card p-6">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <h2 className="text-lg font-semibold">
                                  연관 키워드
                                  {batchRelatedKeywords && !batchRelatedLoading && (
                                    <span className="ml-2 text-sm font-normal text-dark-muted">
                                      ({batchRelatedKeywords.total_count}개)
                                    </span>
                                  )}
                                </h2>
                                {/* 토글 스위치 */}
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={batchRelatedEnabled}
                                    onChange={(e) => handleBatchRelatedToggle(e.target.checked)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-dark-border rounded-full peer peer-checked:bg-naver-green peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                  <span className="ml-2 text-sm text-dark-muted">
                                    {batchRelatedEnabled ? 'ON' : 'OFF'}
                                  </span>
                                </label>
                              </div>
                              {batchRelatedKeywords && !batchRelatedLoading && batchRelatedEnabled && (
                                <button
                                  onClick={() => fetchBatchRelatedKeywords(results.map(r => r.keyword))}
                                  className="text-sm text-dark-muted hover:text-dark-text transition"
                                >
                                  새로고침
                                </button>
                              )}
                            </div>

                            {batchRelatedEnabled && (
                              <>
                                {batchRelatedLoading && (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="w-8 h-8 border-3 border-naver-green border-t-transparent rounded-full animate-spin"></div>
                                    <span className="ml-3 text-dark-muted text-sm">연관 키워드 조회 중...</span>
                                  </div>
                                )}

                                {batchRelatedError && (
                                  <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                                    <p className="text-red-400 text-sm">{batchRelatedError}</p>
                                  </div>
                                )}

                                {batchRelatedKeywords && !batchRelatedLoading && !batchRelatedError && (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b border-dark-border">
                                          <th className="px-4 py-2 text-left text-dark-muted w-12">#</th>
                                          <th className="px-4 py-2 text-left text-dark-muted">키워드</th>
                                          <th className="px-4 py-2 text-right text-dark-muted">PC 검색량</th>
                                          <th className="px-4 py-2 text-right text-dark-muted">모바일 검색량</th>
                                          <th className="px-4 py-2 text-right text-dark-muted">월 검색량</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {batchRelatedKeywords.related_keywords.map((item: RelatedKeywordItem, idx: number) => {
                                          const topThreshold = Math.max(1, Math.floor(batchRelatedKeywords.related_keywords.length * 0.1));
                                          const isTop = idx < topThreshold;
                                          const analyzedKeywords = results.map(r => r.keyword.replace(/\s/g, ''));
                                          const isAnalyzed = analyzedKeywords.includes(item.keyword.replace(/\s/g, ''));

                                          return (
                                            <tr
                                              key={idx}
                                              className={`border-b border-dark-border/30 hover:bg-dark-hover ${
                                                isAnalyzed ? 'bg-naver-green/10' : isTop ? 'bg-yellow-500/5' : ''
                                              }`}
                                            >
                                              <td className="px-4 py-2.5 text-dark-muted">{idx + 1}</td>
                                              <td className="px-4 py-2.5">
                                                <span className={`${isAnalyzed ? 'text-naver-green font-bold' : isTop ? 'text-yellow-400 font-medium' : 'text-dark-text'}`}>
                                                  {item.keyword}
                                                </span>
                                                {isAnalyzed && (
                                                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-naver-green/20 text-naver-green rounded">
                                                    분석됨
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

                                {!batchRelatedKeywords && !batchRelatedLoading && !batchRelatedError && (
                                  <p className="text-dark-muted text-sm text-center py-4">
                                    분석 완료 후 연관 키워드가 표시됩니다.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 상세보기 (선택된 키워드) */}
                    {selectedKeyword && currentResult && !currentResult.error && (
                      <div className="border-t border-dark-border bg-dark-card/50">
                        <div className="px-6 py-3 flex items-center justify-between border-b border-dark-border">
                          <h3 className="font-medium">
                            <span className="text-naver-green">"{selectedKeyword}"</span> 상세 정보
                          </h3>
                          <button
                            onClick={() => setSelectedKeyword('')}
                            className="text-dark-muted hover:text-dark-text transition"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          <div className="p-4">
                            <h4 className="text-sm font-medium text-dark-muted mb-2">상위노출 순서</h4>
                            <div className="grid grid-cols-5 gap-2">
                              {currentResult.top_results?.slice(0, 10).map((item) => (
                                <a
                                  key={item.rank}
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded bg-dark-bg hover:bg-dark-border transition text-xs"
                                >
                                  <div className="font-medium text-naver-green">{item.rank}위</div>
                                  <div className="text-dark-muted truncate">{item.title || '(제목 없음)'}</div>
                                </a>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* API 설정 모달 */}
      <ApiSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettings}
        onSaveSuccess={handleSettingsSaveSuccess}
      />
    </div>
  );
}

export default App;

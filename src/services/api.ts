import axios, { AxiosError, AxiosResponse } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL + '/api' : '/api';

// 에러 응답 타입
export interface ApiErrorDetail {
  error: boolean;
  error_code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, any>;
}

// 에러 응답 타입 (FastAPI HTTPException detail)
export interface ApiErrorResponse {
  detail: string | ApiErrorDetail;
}

// 사용자 친화적 에러 메시지 매핑
const errorMessages: Record<string, string> = {
  // WebDriver 관련
  WEBDRIVER_NOT_INITIALIZED: '브라우저가 시작되지 않았습니다. 다시 시도해주세요.',
  WEBDRIVER_TIMEOUT: '페이지 로딩 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
  WEBDRIVER_SESSION_EXPIRED: '브라우저 세션이 만료되었습니다. 브라우저를 재시작해주세요.',
  WEBDRIVER_ERROR: '브라우저 오류가 발생했습니다.',

  // 네트워크 관련
  CONNECTION_TIMEOUT: '서버 연결 시간이 초과되었습니다.',
  CONNECTION_REFUSED: '서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인해주세요.',
  NETWORK_ERROR: '네트워크 오류가 발생했습니다.',

  // 크롤링 관련
  ELEMENT_NOT_FOUND: '페이지에서 필요한 정보를 찾을 수 없습니다.',
  IFRAME_NOT_FOUND: '블로그 콘텐츠를 불러올 수 없습니다.',
  PAGE_LOAD_FAILED: '페이지를 불러오는데 실패했습니다.',
  BLOCKED_BY_NAVER: '네이버에서 요청이 차단되었습니다. 잠시 후 다시 시도해주세요.',
  CRAWLING_ERROR: '데이터 수집 중 오류가 발생했습니다.',

  // 검증 관련
  VALIDATION_ERROR: '입력값이 올바르지 않습니다.',
  INVALID_KEYWORD: '유효한 검색어를 입력해주세요.',
  INVALID_URL: 'URL 형식이 올바르지 않습니다.',
  INVALID_BLOG_ID: '블로그 ID가 올바르지 않습니다.',

  // 분석 관련
  ANALYSIS_IN_PROGRESS: '이미 분석이 진행 중입니다.',
  ANALYSIS_FAILED: '분석에 실패했습니다.',
  ANALYSIS_ERROR: '분석 중 오류가 발생했습니다.',

  // API 관련
  NAVER_API_ERROR: '네이버 API 호출 중 오류가 발생했습니다.',
  EXTERNAL_API_ERROR: '외부 서비스 연동 중 오류가 발생했습니다.',

  // 기본
  UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
};

// 에러 파싱 유틸리티
export function parseApiError(error: unknown): {
  message: string;
  errorCode: string;
  retryable: boolean;
  details?: Record<string, any>;
} {
  // Axios 에러인 경우
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorResponse>;

    // 네트워크 에러 (서버 응답 없음)
    if (!axiosError.response) {
      if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
        return {
          message: errorMessages.CONNECTION_TIMEOUT,
          errorCode: 'CONNECTION_TIMEOUT',
          retryable: true,
        };
      }
      return {
        message: errorMessages.CONNECTION_REFUSED,
        errorCode: 'CONNECTION_REFUSED',
        retryable: true,
      };
    }

    // 서버 응답이 있는 경우
    const responseData = axiosError.response.data;

    if (responseData?.detail) {
      // 구조화된 에러 응답
      if (typeof responseData.detail === 'object') {
        const detail = responseData.detail as ApiErrorDetail;
        return {
          message: errorMessages[detail.error_code] || detail.message || errorMessages.UNKNOWN_ERROR,
          errorCode: detail.error_code || 'UNKNOWN_ERROR',
          retryable: detail.retryable ?? false,
          details: detail.details,
        };
      }
      // 문자열 에러 메시지
      return {
        message: responseData.detail as string,
        errorCode: 'SERVER_ERROR',
        retryable: false,
      };
    }

    // HTTP 상태 코드 기반 기본 메시지
    const statusMessages: Record<number, string> = {
      400: '잘못된 요청입니다.',
      401: '인증이 필요합니다.',
      403: '접근 권한이 없습니다.',
      404: '요청한 리소스를 찾을 수 없습니다.',
      408: '요청 시간이 초과되었습니다.',
      429: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      500: '서버 내부 오류가 발생했습니다.',
      502: '서버 연결에 문제가 있습니다.',
      503: '서비스를 일시적으로 사용할 수 없습니다.',
      504: '서버 응답 시간이 초과되었습니다.',
    };

    return {
      message: statusMessages[axiosError.response.status] || `서버 오류 (${axiosError.response.status})`,
      errorCode: `HTTP_${axiosError.response.status}`,
      retryable: axiosError.response.status >= 500 || axiosError.response.status === 429,
    };
  }

  // 일반 에러
  if (error instanceof Error) {
    return {
      message: error.message || errorMessages.UNKNOWN_ERROR,
      errorCode: 'UNKNOWN_ERROR',
      retryable: false,
    };
  }

  return {
    message: errorMessages.UNKNOWN_ERROR,
    errorCode: 'UNKNOWN_ERROR',
    retryable: false,
  };
}

// 재시도 유틸리티
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const parsed = parseApiError(error);

      // 재시도 불가능한 에러인 경우 즉시 throw
      if (!parsed.retryable || attempt >= maxRetries) {
        throw error;
      }

      // 재시도 콜백 호출
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      // 지수 백오프 대기
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000,
});

// 응답 인터셉터: 에러 로깅
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    const parsed = parseApiError(error);
    console.error(`[API Error] ${parsed.errorCode}: ${parsed.message}`, parsed.details || '');
    return Promise.reject(error);
  }
);

// 프론트엔드 캐싱 (5분 TTL)
const cache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5분

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  if (cached) {
    cache.delete(key);
  }
  return null;
}

function setCache(key: string, data: any): void {
  // 캐시 크기 제한 (최대 50개)
  if (cache.size >= 50) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

// Types
export interface AnalysisStatus {
  status: 'idle' | 'waiting_login' | 'collecting' | 'analyzing' | 'completed' | 'error';
  progress: number;
  current_task: string;
  logs: string[];
}

// 검색량 정보
export interface SearchVolume {
  total: number | null;
  pc: number | null;
  mobile: number | null;
  competition: string | null;
  note?: string;
  monthly_blog_count?: number | null;  // 최근 1개월 블로그 발행수
}

// 상위노출 결과 아이템
export interface TopResult {
  rank: number;
  section_rank?: number;
  type: string;
  title: string;
  url: string;
}

// 광고 정보
export interface AdInfo {
  count: number;
  top_count: number;
  middle_count: number;
  positions: Array<{ position: string; count: number }>;
}

// AI 추천 정보
export interface AIRecommendation {
  exists: boolean;
  position: string | null;  // "상단", "중간", "하단"
  section_index: number | null;
}

// 섹션 순서
export interface SectionOrder {
  order: number;
  type: string;
  count?: number;
  detail?: Record<string, number>;
}

// 상위노출 블로그 키워드 빈도 분석 항목
export interface TopBlogKeywordItem {
  rank: number;
  url: string;
  title: string;
  keyword_counts: Record<string, number>;
  content_length: number;
  is_ad?: boolean;
}

// 분석 결과
export interface AnalysisResult {
  keyword: string;
  search_volume: SearchVolume;
  ad_count: number;
  ad_info?: AdInfo;
  ai_recommendation?: AIRecommendation;
  section_order?: SectionOrder[];
  top_results: TopResult[];
  section_counts: Record<string, number>;
  keyword_in_titles?: Record<string, number>;
  top_blog_keyword_analysis?: TopBlogKeywordItem[];
  error?: string;
}

// 블로그 정보
export interface BlogInfo {
  blog_id: string;
  blog_name: string;
  blog_title: string;
  neighbor_count: number;
  total_posts: number;
  total_visitors: number;
  today_visitors: number;
  profile_image: string;
  description: string;
  daily_visitors?: Record<string, number>;  // YYYYMMDD -> count
  monthly_post_count?: number;  // 최근 30일 발행수
}

// 블로그 게시물
export interface BlogPost {
  title: string;
  url: string;
  date: string;
  comment_count: number;
  like_count: number;
  summary: string;
  is_notice?: boolean;
}

// 방문자 히스토리 항목 (DB 누적 데이터)
export interface VisitorHistoryItem {
  date: string;           // YYYY-MM-DD
  visitor_count: number;  // 해당일 방문자수
  total_visitor: number;  // 전체 방문자수
  subscriber_count: number; // 이웃/구독자수
}

// 블로그 진단 결과
export interface BlogDiagnoseResult {
  blog_id: string;
  blog_info: BlogInfo;
  posts: BlogPost[];
  visitor_history?: VisitorHistoryItem[];  // DB 누적 방문자 히스토리
  error?: string;
}

// 금지어/상업성 키워드
export interface FoundKeyword {
  word: string;
  position: number;
  context: string;
}

// 형태소 빈도
export interface MorphemeFreq {
  word: string;
  count: number;
  ratio: number;
}

// 주제 분류
export interface TopicMatch {
  topic: string;
  score: number;
  matched_keywords: string[];
}

// 형태소 분석 요약
export interface MorphemeSummary {
  total_morphemes: number;
  unique_nouns: number;
  unique_verbs: number;
  top_topics: string[];
  char_count?: number;
  char_count_pure?: number;  // 순수 글자수 (공백 제외)
  // 네이버 방식 글자수
  total?: number;
  korean?: number;
  english?: number;
  digit?: number;
  forbidden_count?: number;
  commercial_count?: number;
}

// 포스팅 형태소 분석
export interface PostMorphemeAnalysis {
  noun_freq: MorphemeFreq[];
  verb_freq: MorphemeFreq[];
  all_freq: MorphemeFreq[];
  topics: TopicMatch[];
  summary: MorphemeSummary;
}

// H-tag 구조
export interface HTagItem {
  tag: string;   // e.g., "h2", "h3"
  text: string;
  level: number;
}

// 외부 링크 항목
export interface ExternalLinkItem {
  url: string;
  text: string;
  domain: string;
}

// 포스팅 진단 결과
export interface PostDiagnoseResult {
  url: string;
  title: string;
  author: string;
  date: string;
  profile_image?: string;   // 블로거 프로필 이미지 URL
  blog_title?: string;      // 블로그 이름 (블로그 제목)
  content: string;
  content_html: string;
  content_length: number;
  content_length_pure: number;  // 순수 글자수 (공백/줄바꿈 제외)
  image_count: number;
  video_count: number;
  link_count: number;
  forbidden_words: FoundKeyword[];
  commercial_words: FoundKeyword[];
  word_stats: {
    char_count: number;
    word_count: number;
    sentence_count: number;
    paragraph_count: number;
    avg_sentence_length: number;
  };
  morpheme_analysis?: PostMorphemeAnalysis;  // 형태소 분석 결과
  // New fields for enhanced diagnosis
  image_urls?: string[];                    // 이미지 URL 목록
  valid_image_count?: number;               // 유효 이미지 수 (data-lazy-src 추출 성공)
  total_image_count?: number;               // 전체 이미지 컴포넌트 수
  sticker_count?: number;                   // 스티커 수
  h_tags?: HTagItem[];                      // H-tag 구조
  keyword_density?: number;                 // 키워드 밀도 (%)
  keyword_count?: number;                   // 키워드 반복 횟수
  keyword_breakdown?: Array<{ word: string; count: number }>;  // 핵심 키워드 빈도
  external_links?: ExternalLinkItem[];      // 외부 링크 목록
  seo_score?: number;                       // SEO 점수 (0-100)
  seo_score_is_relative?: boolean;          // 상대적 점수 여부 (상위노출 대비)
  seo_score_details?: Record<string, {      // SEO 점수 항목별 상세
    score: number;
    max: number;
    label: string;
    my_value?: number;
    avg_value?: number;
    has_keyword?: boolean;
  }>;
  top_averages?: {                          // 상위노출 평균 데이터
    keyword_count: number;
    image_count: number;
    content_length: number;
    keyword_density: number;
  };
  image_analysis?: ImageAnalyzeResult | null;  // 이미지 분석 결과 (포스팅 진단 통합)
  char_stats?: {
    total: number;
    korean: number;
    english: number;
    digit: number;
  };
  error?: string;
}

// 상위노출 콘텐츠 분석 결과
export interface TopContentItem {
  rank: number;
  url: string;
  title: string;
  keyword_count: number;
  title_keyword_count: number;
  image_count: number;
  content_length: number;
}

export interface TopContentRecommendation {
  type: 'keyword' | 'image';
  status: 'good' | 'insufficient' | 'excessive';
  message: string;
  detail: string;
  severity: 'good' | 'info' | 'warning' | 'danger';
}

export interface TopContentAnalysisResult {
  keyword: string;
  top_contents: TopContentItem[];
  averages: {
    keyword_count: number;
    image_count: number;
    content_length: number;
  };
  my_stats: {
    keyword_count: number;
    image_count: number;
  };
  recommendations: TopContentRecommendation[];
}

// 형태소 분석 결과
export interface MorphemeResult {
  morphemes: Array<{ form: string; tag: string; start: number; end: number }>;
  nouns: string[];
  verbs: string[];
  adjectives: string[];
  noun_freq: Array<{ word: string; count: number; ratio: number }>;
  verb_freq: Array<{ word: string; count: number; ratio: number }>;
  all_freq: Array<{ word: string; count: number; ratio: number }>;
  topics: Array<{ topic: string; score: number; matched_keywords: string[] }>;
  summary: {
    total_morphemes: number;
    unique_nouns: number;
    unique_verbs: number;
    top_topics: string[];
    char_count?: number;
    char_count_pure?: number;
    // 네이버 방식 글자수
    total?: number;
    korean?: number;
    english?: number;
    digit?: number;
    forbidden_count?: number;
    commercial_count?: number;
  };
  forbidden_words?: FoundKeyword[];
  commercial_words?: FoundKeyword[];
  original_text?: string;
  keyword_suggestions?: {
    related_nouns: Array<{ word: string; count: number; ratio: number }>;
    keyword_density: number;
    keyword_positions: number[];
    improvement_tips: string[];
  };
}

// ========================================
// 인증 (회원가입/로그인) API
// ========================================

export interface AuthUser {
  id: number;
  username?: string;
  nickname?: string;
  blog_id?: string;
  profile_image?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// 회원가입
export async function signup(username: string, password: string, blogId?: string): Promise<AuthResponse> {
  const response = await api.post('/auth/signup', {
    username,
    password,
    blog_id: blogId || null,
  });
  return response.data;
}

// 로그인
export async function login(username: string, password: string): Promise<AuthResponse> {
  const response = await api.post('/auth/login', {
    username,
    password,
  });
  return response.data;
}

// 현재 유저 정보 조회
export async function getMe(token: string): Promise<AuthUser> {
  const response = await api.get('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

// API Functions

// Login
export async function openLogin(): Promise<any> {
  const response = await api.post('/login/open');
  return response.data;
}

export async function checkLoginStatus(): Promise<{ logged_in: boolean; message: string }> {
  const response = await api.get('/login/status');
  return response.data;
}

export async function confirmLogin(): Promise<{ success: boolean; message: string }> {
  const response = await api.post('/login/confirm');
  return response.data;
}

// Analysis
export async function startAnalysis(keywords: string[]): Promise<any> {
  const response = await api.post('/analyze', { keywords });
  return response.data;
}

export async function getAnalysisStatus(): Promise<AnalysisStatus> {
  const response = await api.get('/analyze/status');
  return response.data;
}

export async function getAnalysisResult(): Promise<{ status: string; results: AnalysisResult[] }> {
  const response = await api.get('/analyze/result');
  return response.data;
}

export async function resetAnalysis(): Promise<any> {
  const response = await api.post('/analyze/reset');
  return response.data;
}

// Driver
export async function closeDriver(): Promise<any> {
  const response = await api.post('/driver/close');
  return response.data;
}

export async function getDriverStatus(): Promise<{ is_active: boolean; is_logged_in: boolean }> {
  const response = await api.get('/driver/status');
  return response.data;
}

export async function restartDriver(): Promise<{ success: boolean; message: string }> {
  const response = await api.post('/driver/restart');
  return response.data;
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await axios.get(import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL + '/health' : '/health');
    return response.status === 200;
  } catch {
    return false;
  }
}

// Blog Diagnose
export async function diagnoseBlog(blogId: string, count: number = 30): Promise<BlogDiagnoseResult> {
  const response = await api.post('/blog/diagnose', { blog_id: blogId, count });
  return response.data;
}

// Post Diagnose
export async function diagnosePost(url: string, targetKeyword?: string): Promise<PostDiagnoseResult> {
  const response = await api.post('/post/diagnose', {
    url,
    target_keyword: targetKeyword || null,
  });
  return response.data;
}

// Top Content Analysis (상위노출 콘텐츠 분석)
export async function analyzeTopContents(
  keyword: string,
  myKeywordCount: number,
  myImageCount: number,
  topN: number = 5
): Promise<TopContentAnalysisResult> {
  const response = await api.post('/post/top-contents', {
    keyword,
    my_keyword_count: myKeywordCount,
    my_image_count: myImageCount,
    top_n: topN,
  });
  return response.data;
}

// Morpheme Analysis
export async function analyzeMorpheme(text: string, targetKeyword?: string): Promise<MorphemeResult> {
  const response = await api.post('/morpheme/analyze', {
    text,
    target_keyword: targetKeyword,
  });
  return response.data;
}

// Topic Keywords
export async function getTopicKeywords(): Promise<{ topics: Record<string, string[]> }> {
  const response = await api.get('/morpheme/topics');
  return response.data;
}

// SERP Analysis (즉시 분석) - 캐싱 적용
export async function analyzeSERP(keywords: string[]): Promise<{ results: AnalysisResult[] }> {
  // 단일 키워드의 경우 캐시 확인
  if (keywords.length === 1) {
    const cacheKey = `serp:${keywords[0]}`;
    const cached = getCached<{ results: AnalysisResult[] }>(cacheKey);
    if (cached) {
      console.log(`[Cache] Using cached result for: ${keywords[0]}`);
      return cached;
    }
  }

  const response = await api.post('/serp/analyze', { keywords });

  // 결과 캐싱
  if (keywords.length === 1 && response.data.results?.length > 0) {
    const cacheKey = `serp:${keywords[0]}`;
    setCache(cacheKey, response.data);
  }

  return response.data;
}

// ========================================
// 네이버 광고 API (입찰가 조회)
// ========================================

// 입찰가 데이터 타입 (확장됨 - 검색량, 클릭수, 경쟁 정도 포함)
export interface BidPriceData {
  keyword: string;
  // 검색량
  pc_search_volume: number | null;
  mobile_search_volume: number | null;
  // 클릭수
  pc_click_count: number | null;
  mobile_click_count: number | null;
  // 클릭률
  pc_click_rate: number | null;
  mobile_click_rate: number | null;
  // 경쟁 정도
  competition: string | null;
  competition_index: number | null;
  // 입찰가
  pc_minimum_bid: number | null;
  mobile_minimum_bid: number | null;
  pc_rank_bids: { rank: number; bid: number }[];
  mobile_rank_bids: { rank: number; bid: number }[];
  // 추정 여부
  rank_bids_estimated?: boolean;
  // 입찰가 출처 (api/scraper/estimated)
  rank_bids_source?: string | null;
  // 변형 키워드(공백 제거) 데이터
  variant_data?: BidPriceData | null;
  // 에러
  error?: string | null;
}

// 네이버 광고 API 설정 타입
export interface NaverAdSettings {
  customer_id: string;
  api_key: string;
  secret_key: string;
}

// 네이버 광고 API 설정 상태 타입
export interface NaverAdSettingsStatus {
  is_configured: boolean;
  customer_id?: string;
  api_key?: string;
}

// 종합 키워드 데이터 조회 (검색량 + 클릭수 + 경쟁 정도 + 입찰가)
export async function getBidPrice(keyword: string): Promise<BidPriceData> {
  // 캐시 확인
  const cacheKey = `bid:${keyword}`;
  const cached = getCached<BidPriceData>(cacheKey);
  if (cached) {
    console.log(`[Cache] Using cached bid price for: ${keyword}`);
    return cached;
  }

  // 종합 API 호출 (검색량 + 입찰가 모두 조회)
  const response = await api.post('/bid/full', { keyword });
  const data = response.data;

  const result: BidPriceData = {
    keyword,
    // 검색량
    pc_search_volume: data.pc_search_volume ?? null,
    mobile_search_volume: data.mobile_search_volume ?? null,
    // 클릭수
    pc_click_count: data.pc_click_count ?? null,
    mobile_click_count: data.mobile_click_count ?? null,
    // 클릭률
    pc_click_rate: data.pc_click_rate ?? null,
    mobile_click_rate: data.mobile_click_rate ?? null,
    // 경쟁 정도
    competition: data.competition ?? null,
    competition_index: data.competition_index ?? null,
    // 입찰가
    pc_minimum_bid: data.pc_minimum_bid ?? null,
    mobile_minimum_bid: data.mobile_minimum_bid ?? null,
    pc_rank_bids: data.pc_rank_bids ?? [],
    mobile_rank_bids: data.mobile_rank_bids ?? [],
    // 추정 여부
    rank_bids_estimated: data.rank_bids_estimated ?? false,
    // 입찰가 출처
    rank_bids_source: data.rank_bids_source ?? null,
    // 변형 키워드(공백 제거) 데이터
    variant_data: data.variant_data ?? null,
    // 에러
    error: data.error ?? null,
  };

  // 결과 캐싱
  setCache(cacheKey, result);

  return result;
}

// 키워드 통계만 조회 (검색량, 클릭수, 경쟁 정도)
export async function getKeywordStats(keyword: string): Promise<{
  keyword: string;
  pc_search_volume: number | null;
  mobile_search_volume: number | null;
  pc_click_count: number | null;
  mobile_click_count: number | null;
  pc_click_rate: number | null;
  mobile_click_rate: number | null;
  competition: string | null;
  competition_index: number | null;
  error?: string | null;
}> {
  const response = await api.post('/bid/stats', { keyword });
  return response.data;
}

// 네이버 광고 API 연결 테스트
// 참고: 백엔드는 저장된 설정을 사용하므로 테스트 전에 먼저 설정을 저장해야 함
export async function testNaverAdConnection(
  settings: NaverAdSettings
): Promise<{ success: boolean; message: string }> {
  // 먼저 설정을 저장한 후 테스트 수행
  await api.post('/settings/naver-ad', settings);
  const response = await api.post('/settings/naver-ad/test');
  return response.data;
}

// 네이버 광고 API 설정 저장
export async function saveNaverAdSettings(settings: NaverAdSettings): Promise<void> {
  await api.post('/settings/naver-ad', settings);
}

// 네이버 광고 API 설정 조회
export async function getNaverAdSettings(): Promise<NaverAdSettingsStatus> {
  const response = await api.get('/settings/naver-ad');
  return response.data;
}

// ========================================
// 순위별 입찰가 스크래핑 (검색광고 관리 시스템)
// ========================================

// 스크래퍼 로그인 상태 타입
export interface ScraperLoginStatus {
  logged_in: boolean;
  message: string;
  scraper_active: boolean;
  error_code?: string | null;
}

// 스크래핑 키워드별 결과 타입
export interface RankScrapeKeywordResult {
  keyword: string;
  pc: Record<string, number | null>;
  mobile: Record<string, number | null>;
  error?: string | null;
}

// 스크래핑 응답 타입
export interface RankScrapeResponse {
  results: Record<string, RankScrapeKeywordResult>;
  total_keywords: number;
  success_count: number;
  error_count: number;
}

// 스크래퍼 로그인 창 열기
export async function openScraperLogin(): Promise<{
  status: string;
  message: string;
  logged_in: boolean;
}> {
  const response = await api.post('/bid/rank-scrape/login/open');
  return response.data;
}

// 스크래퍼 로그인 상태 확인
export async function getScraperLoginStatus(): Promise<ScraperLoginStatus> {
  const response = await api.get('/bid/rank-scrape/login/status');
  return response.data;
}

// 스크래퍼 로그인 완료 대기
export async function confirmScraperLogin(): Promise<{
  success: boolean;
  message: string;
}> {
  const response = await api.post('/bid/rank-scrape/login/confirm');
  return response.data;
}

// 스크래핑으로 순위별 입찰가 조회
export async function scrapeRankBids(keywords: string[]): Promise<RankScrapeResponse> {
  const response = await api.post('/bid/rank-scrape', { keywords });
  return response.data;
}

// 스크래퍼 브라우저 종료
export async function closeScraperBrowser(): Promise<{
  status: string;
  message: string;
}> {
  const response = await api.post('/bid/rank-scrape/close');
  return response.data;
}

// 스크래퍼 상태 조회
export async function getScraperStatus(): Promise<{
  is_active: boolean;
  is_logged_in: boolean;
}> {
  const response = await api.get('/bid/rank-scrape/status');
  return response.data;
}

// ========================================
// 연관 키워드 API
// ========================================

// 연관 키워드 항목 타입
export interface RelatedKeywordItem {
  keyword: string;
  pc_search: number;
  mobile_search: number;
  total_search: number;
}

// 연관 키워드 응답 타입
export interface RelatedKeywordsResponse {
  keyword: string;
  related_keywords: RelatedKeywordItem[];
  total_count: number;
  error?: string | null;
}

// 연관 키워드 + 검색량 조회
export async function getRelatedKeywords(keyword: string): Promise<RelatedKeywordsResponse> {
  // 캐시 확인
  const cacheKey = `related:${keyword}`;
  const cached = getCached<RelatedKeywordsResponse>(cacheKey);
  if (cached) {
    console.log(`[Cache] Using cached related keywords for: ${keyword}`);
    return cached;
  }

  const response = await api.post('/bid/related-keywords', { keyword });
  const data = response.data;

  // 결과 캐싱
  setCache(cacheKey, data);

  return data;
}

// ========================================
// 이미지 분석 API
// ========================================

// 이미지 항목 타입
export interface ImageItem {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  position: string;
  order: number;
  is_valid: boolean;
  invalid_reason: string | null;
  thumbnail_url: string;
  source_type: string | null;
}

// 이미지 분석 요약 타입
export interface ImageAnalyzeSummary {
  naver_original: number;
  external: number;
  too_small: number;
  copied: number;
  ad_banner: number;
  stock_paid_count: number;
  stock_free_count: number;
  naver_original_count: number;
  external_count: number;
}

// 이미지 분석 결과 타입
export interface ImageAnalyzeResult {
  url: string;
  total_count: number;
  valid_count: number;
  invalid_count: number;
  images: ImageItem[];
  summary: ImageAnalyzeSummary;
  error?: string;
}

// 이미지 분석
export async function analyzeImages(blogUrl: string): Promise<ImageAnalyzeResult> {
  const response = await api.post('/image/analyze', { blog_url: blogUrl });
  return response.data;
}

// ========================================
// 순위 추적 API
// ========================================

// 블로그 글 목록 항목
export interface BlogPostItem {
  title: string;
  url: string;
  log_no: string;
  date: string;
}

// 블로그 글 목록 응답
export interface BlogPostsResponse {
  blog_id: string;
  posts: BlogPostItem[];
  total_count: number;
}

// 섹션별 순위 항목
export interface RankingEntry {
  section: string;       // 한글 섹션명 (블로그, 웹사이트, 인기글 등)
  rank: number;
  section_type: string;  // 원본 타입 (blog, website, popular 등)
}

// 순위 확인 결과
export interface RankingResult {
  keyword: string;
  blog_id: string;
  log_no: string;
  found: boolean;
  rankings: RankingEntry[];
}

// 블로그 글 목록 조회
export async function getBlogPosts(blogId: string, count: number = 30): Promise<BlogPostsResponse> {
  // 캐시 확인
  const cacheKey = `blog-posts:${blogId}:${count}`;
  const cached = getCached<BlogPostsResponse>(cacheKey);
  if (cached) {
    console.log(`[Cache] Using cached blog posts for: ${blogId}`);
    return cached;
  }

  const response = await api.post('/tracking/blog-posts', { blog_id: blogId, count });
  const data = response.data;

  // 캐시 저장
  setCache(cacheKey, data);

  return data;
}

// 순위 확인
export async function checkRanking(
  keyword: string,
  blogId: string,
  logNo: string,
): Promise<RankingResult> {
  const response = await api.post('/tracking/check-rank', {
    keyword,
    blog_id: blogId,
    log_no: logNo,
  });
  return response.data;
}

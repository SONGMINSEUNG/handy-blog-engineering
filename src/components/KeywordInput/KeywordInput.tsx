import { useState } from 'react';

interface KeywordInputProps {
  keywords: string[];
  onKeywordsChange: (keywords: string[]) => void;
}

// 줄바꿈/쉼표로 구분된 텍스트를 키워드 배열로 파싱 (공백 제거, 중복 제거, 순서 유지)
function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const kw = raw.trim();
    if (kw && !seen.has(kw)) {
      seen.add(kw);
      result.push(kw);
    }
  }
  return result;
}

export default function KeywordInput({ keywords, onKeywordsChange }: KeywordInputProps) {
  // textarea 텍스트를 로컬 상태로 보유 (마운트 시 기존 키워드로 초기화)
  const [text, setText] = useState(() => keywords.join('\n'));

  const handleChange = (value: string) => {
    setText(value);
    onKeywordsChange(parseKeywords(value));
  };

  const removeKeyword = (index: number) => {
    const next = keywords.filter((_, i) => i !== index);
    onKeywordsChange(next);
    setText(next.join('\n'));
  };

  return (
    <div className="glass-card p-6">
      <label className="block text-sm font-medium text-gray-900 dark:text-gray-400 mb-3">
        분석할 키워드 ({keywords.length}개)
      </label>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={'키워드를 줄바꿈(엔터)으로 구분해 입력하세요.\n예)\n맛집\n홍대 맛집\n강남 카페'}
        rows={8}
        className="w-full p-4 bg-gray-50 dark:bg-[#0f0f0f] rounded-lg border border-gray-200 dark:border-gray-700 outline-none focus:border-naver-green text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-y min-h-[180px] leading-7"
      />

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {keywords.map((keyword, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-naver-green/20 text-naver-green rounded-full text-sm"
            >
              {keyword}
              <button
                onClick={() => removeKeyword(index)}
                className="hover:text-gray-900 dark:hover:text-gray-100 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-900 dark:text-gray-400 mt-2">
        줄바꿈(엔터) 또는 쉼표로 키워드를 구분합니다. 여러 줄을 한 번에 붙여넣어도 됩니다. (중복 자동 제거)
      </p>
    </div>
  );
}

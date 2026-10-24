'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 日程表 Day 1〜7 の定義
const SUMMARY_OPTIONS = [
  { tag: 'DAY001_CAPACITY', label: 'Day 1: 行為能力・意思能力・詐術' },
  { tag: 'DAY002_FALSE_REPR', label: 'Day 2: 虚偽表示・94条2項類推適用' },
  { tag: 'DAY003_MISTAKE_FRAUD', label: 'Day 3: 錯誤・詐欺取消と第三者・登記' },
  { tag: 'DAY004_AGENCY', label: 'Day 4: 代理全体系・代理権濫用・表見代理' },
  { tag: 'DAY005_PRESCRIPTION', label: 'Day 5: 消滅時効・援用権者・信義則' },
  { tag: 'DAY006_GENERAL_MIX', label: 'Day 6: 総則総合演習（複雑論点）' },
  { tag: 'DAY007_SUMMARY_FACTS', label: 'Day 7: 民法総則総括・要件事実まとめ' },
];

interface TantoQuestion {
  id: string;
  subject: string;
  topic: string;
  summary_tag: string;
  question_text: string;
  correct_answer: boolean;
  point_rule: string | null;
  explanation: string;
}

type FontSize = 'normal' | 'large' | 'xlarge';

function TantoPracticeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSummaryTag = searchParams.get('summary') || 'DAY001_CAPACITY';

  const [syncKey, setSyncKey] = useState<string>('ufu');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [tempKey, setTempKey] = useState('ufu');

  const [questions, setQuestions] = useState<TantoQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, boolean>>({});
  const [fontSize, setFontSize] = useState<FontSize>('large');
  const [streak, setStreak] = useState(0);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem('yobi_tanto_synckey');
    if (savedKey) {
      setSyncKey(savedKey);
      setTempKey(savedKey);
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setCurrentIndex(0);
      setUserAnswers({});
      setStats({ correct: 0, total: 0 });
      setStreak(0);

      const { data: qData } = await supabase
        .from('tanto_questions')
        .select('*')
        .eq('summary_tag', currentSummaryTag)
        .order('id', { ascending: true })
        .limit(30);

      const loaded = qData || [];
      setQuestions(loaded);

      // クラウドから中断進捗をロード
      if (loaded.length > 0) {
        const { data: syncData } = await supabase
          .from('user_sync_progress')
          .select('*')
          .eq('sync_key', syncKey)
          .eq('summary_tag', currentSummaryTag)
          .maybeSingle();

        if (syncData) {
          const restoredIndex = syncData.current_index < loaded.length ? syncData.current_index : 0;
          setCurrentIndex(restoredIndex);
          setUserAnswers(syncData.user_answers || {});
          setStats({ correct: syncData.correct_count || 0, total: syncData.total_count || 0 });
          setStreak(syncData.streak || 0);
        }
      }
      setLoading(false);
    }
    loadData();
  }, [currentSummaryTag, syncKey]);

  const saveSyncProgress = useCallback(
    async (newIndex: number, newAnswers: Record<number, boolean>, newCorrect: number, newTotal: number, newStreak: number) => {
      setSyncing(true);
      try {
        await supabase.from('user_sync_progress').upsert({
          sync_key: syncKey,
          summary_tag: currentSummaryTag,
          current_index: newIndex,
          user_answers: newAnswers,
          correct_count: newCorrect,
          total_count: newTotal,
          streak: newStreak,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error('同期エラー:', err);
      } finally {
        setSyncing(false);
      }
    },
    [syncKey, currentSummaryTag]
  );

  const currentQ = questions[currentIndex];
  const selectedAnswer = userAnswers[currentIndex] ?? null;
  const isAnswered = selectedAnswer !== null;

  const handleSelect = (choice: boolean) => {
    if (isAnswered || !currentQ) return;
    const newAnswers = { ...userAnswers, [currentIndex]: choice };
    setUserAnswers(newAnswers);

    const isCorr = choice === currentQ.correct_answer;
    const newCorrect = stats.correct + (isCorr ? 1 : 0);
    const newTotal = stats.total + 1;
    const newStreak = isCorr ? streak + 1 : 0;

    setStats({ correct: newCorrect, total: newTotal });
    setStreak(newStreak);

    saveSyncProgress(currentIndex, newAnswers, newCorrect, newTotal, newStreak);
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const nextIdx = currentIndex - 1;
      setCurrentIndex(nextIdx);
      saveSyncProgress(nextIdx, userAnswers, stats.correct, stats.total, streak);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      saveSyncProgress(nextIdx, userAnswers, stats.correct, stats.total, streak);
    } else {
      alert(`🎉 演習完了！ 正解数: ${stats.correct} / ${questions.length}`);
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    router.push(`/tanto?summary=${e.target.value}`);
  };

  const handleResetSession = async () => {
    if (!confirm('この単元の進捗をリセットして第1問からやり直しますか？')) return;
    setCurrentIndex(0);
    setUserAnswers({});
    setStats({ correct: 0, total: 0 });
    setStreak(0);
    await saveSyncProgress(0, {}, 0, 0, 0);
  };

  const fontStyles = {
    normal: { question: 'text-base leading-relaxed', point: 'text-xs leading-relaxed', explanation: 'text-xs sm:text-sm leading-relaxed' },
    large: { question: 'text-lg sm:text-xl leading-relaxed font-medium', point: 'text-sm leading-relaxed', explanation: 'text-sm sm:text-base leading-relaxed' },
    xlarge: { question: 'text-xl sm:text-2xl leading-relaxed font-medium tracking-wide', point: 'text-base leading-relaxed', explanation: 'text-base sm:text-lg leading-relaxed' },
  }[fontSize];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400 font-mono text-sm">
        前回の学習進捗を同期中...
      </div>
    );
  }

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 max-w-lg mx-auto select-none">
      <header className="border-b border-slate-800 pb-3 pt-1">
        <div className="flex justify-between items-center mb-2">
          <Link href="/" className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold bg-indigo-950/50 border border-indigo-800/60 px-2.5 py-1 rounded-lg">
            ← 論証集トップ
          </Link>
          <div className="flex items-center gap-1.5 text-[11px]">
            {syncing ? (
              <span className="text-amber-400 animate-pulse font-mono">同期中...</span>
            ) : (
              <span className="text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>同期中
              </span>
            )}
            <button onClick={() => setIsEditingKey(!isEditingKey)} className="text-slate-400 hover:text-slate-200 underline font-mono ml-1">
              [{syncKey}]
            </button>
          </div>
        </div>

        {/* SUMMARY カテゴリー切替ドロップダウン */}
        <div className="mb-2.5">
          <label className="text-[10px] text-slate-400 font-bold block mb-1">【学習日程表 SUMMARY 選択】</label>
          <select
            value={currentSummaryTag}
            onChange={handleCategoryChange}
            className="w-full bg-slate-900 border border-indigo-600/60 text-indigo-200 text-xs font-semibold py-2 px-2.5 rounded-xl outline-none focus:border-indigo-400"
          >
            {SUMMARY_OPTIONS.map((opt) => (
              <option key={opt.tag} value={opt.tag} className="bg-slate-900 text-slate-200">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {isEditingKey && (
          <div className="flex items-center gap-1 mb-2.5 bg-slate-900 border border-slate-700 p-2 rounded-lg text-xs">
            <span className="text-slate-300 font-semibold">同期ID:</span>
            <input
              type="text"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              className="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-white flex-1 font-mono text-xs"
            />
            <button
              onClick={() => {
                if (tempKey.trim()) {
                  setSyncKey(tempKey.trim());
                  localStorage.setItem('yobi_tanto_synckey', tempKey.trim());
                  setIsEditingKey(false);
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2.5 py-1 rounded"
            >
              設定
            </button>
          </div>
        )}

        <div className="flex justify-between items-center mb-2">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
              currentIndex === 0 ? 'border-slate-800 text-slate-600 bg-slate-900/30' : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            ◀ 前へ
          </button>
          <span className="font-bold text-sm text-slate-200">
            問 {questions.length > 0 ? currentIndex + 1 : 0} / {questions.length}
          </span>
          <button
            onClick={handleNext}
            disabled={currentIndex === questions.length - 1}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
              currentIndex === questions.length - 1 ? 'border-slate-800 text-slate-600 bg-slate-900/30' : 'border-indigo-600 bg-indigo-900/50 text-indigo-200 hover:bg-indigo-800/60'
            }`}
          >
            次へ ▶
          </button>
        </div>

        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
            <span className="text-[10px] text-slate-400 px-1 font-semibold">文字</span>
            {(['normal', 'large', 'xlarge'] as FontSize[]).map((sz) => (
              <button
                key={sz}
                onClick={() => setFontSize(sz)}
                className={`px-2 py-0.5 rounded text-xs ${fontSize === sz ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400'}`}
              >
                {sz === 'normal' ? '標準' : sz === 'large' ? '大' : '特大'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-bold ${accuracy >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>定着率: {accuracy}%</span>
            <button onClick={handleResetSession} className="text-[11px] text-slate-400 hover:text-rose-400 underline">最初から</button>
          </div>
        </div>
      </header>

      {/* 問題文カード */}
      <main className="my-auto py-3">
        {questions.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-300">
            <p className="font-bold text-base mb-1">このSUMMARYの問題は現在準備中です</p>
            <p className="text-xs text-slate-500">下のSQLを実行して問題データを投入してください。</p>
          </div>
        ) : (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                  {currentQ.topic}
                </span>
                {streak >= 3 && <span className="text-xs text-amber-400 font-bold animate-pulse">🔥 {streak} 連続正解</span>}
              </div>
              <p className={`${fontStyles.question} text-slate-100`}>{currentQ.question_text}</p>
            </div>

            <div className="mt-4">
              {!isAnswered ? (
                <div className="grid grid-cols-2 gap-3.5">
                  <button onClick={() => handleSelect(true)} className="h-20 bg-emerald-950/40 hover:bg-emerald-900/60 active:scale-95 border-2 border-emerald-500/50 rounded-2xl flex flex-col items-center justify-center transition shadow-lg">
                    <span className="text-3xl font-black text-emerald-400">○</span>
                    <span className="text-xs font-semibold text-emerald-300 mt-0.5">正しい</span>
                  </button>
                  <button onClick={() => handleSelect(false)} className="h-20 bg-rose-950/40 hover:bg-rose-900/60 active:scale-95 border-2 border-rose-500/50 rounded-2xl flex flex-col items-center justify-center transition shadow-lg">
                    <span className="text-3xl font-black text-rose-400">✕</span>
                    <span className="text-xs font-semibold text-rose-300 mt-0.5">誤り</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                  <div className={`p-4 rounded-xl border ${selectedAnswer === currentQ.correct_answer ? 'bg-emerald-950/30 border-emerald-500/60 text-emerald-300' : 'bg-rose-950/30 border-rose-500/60 text-rose-300'}`}>
                    <div className="flex items-center justify-between font-bold text-lg mb-1">
                      <span>{selectedAnswer === currentQ.correct_answer ? '正解 (○)' : '不正解 (✕)'}</span>
                      <span className="text-xs bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700 text-slate-200">
                        正解肢: {currentQ.correct_answer ? '○ 正しい' : '✕ 誤り'}
                      </span>
                    </div>
                    {currentQ.point_rule && (
                      <div className="mt-2.5 p-3 bg-slate-900/95 rounded-lg border border-amber-500/30 text-amber-200/95">
                        <span className="font-semibold block text-amber-400 mb-1 text-xs">【判例規範・当てはめ基準】</span>
                        <p className={fontStyles.point}>{currentQ.point_rule}</p>
                      </div>
                    )}
                    <p className={`mt-2.5 text-slate-200 ${fontStyles.explanation}`}>{currentQ.explanation}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <button onClick={handlePrev} disabled={currentIndex === 0} className={`h-12 rounded-xl font-bold border transition ${currentIndex === 0 ? 'border-slate-800 text-slate-600 bg-slate-900/40' : 'border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-slate-100'}`}>
                      ◀ 前の肢に戻る
                    </button>
                    <button onClick={handleNext} className="h-12 bg-indigo-600 hover:bg-indigo-500 active:scale-98 rounded-xl font-bold text-white shadow-lg">
                      {currentIndex < questions.length - 1 ? '次の肢へ進む ▶' : '演習結果を確認'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="pt-2 flex justify-between items-center text-xs text-slate-500 border-t border-slate-900">
        <button onClick={handlePrev} disabled={currentIndex === 0} className={`py-1 px-2.5 rounded ${currentIndex === 0 ? 'text-slate-800' : 'text-slate-400 hover:text-slate-200 underline'}`}>
          ◀ 前の問へ
        </button>
        <span className="font-mono text-[11px] text-slate-500">{currentSummaryTag}</span>
        <button onClick={handleNext} disabled={questions.length === 0 || currentIndex === questions.length - 1} className={`py-1 px-2.5 rounded ${questions.length === 0 || currentIndex === questions.length - 1 ? 'text-slate-800' : 'text-slate-400 hover:text-slate-200 underline'}`}>
          スキップ ▶
        </button>
      </footer>
    </div>
  );
}

export default function TantoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-400 p-4">進捗を同期中...</div>}>
      <TantoPracticeContent />
    </Suspense>
  );
}

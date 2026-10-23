'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

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
  const searchParams = useSearchParams();
  const summaryParam = searchParams.get('summary') || 'DAY001_CAPACITY';

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

  // 1. 同期キーの初期化（localStorageから読込）
  useEffect(() => {
    const savedKey = localStorage.getItem('yobi_tanto_synckey');
    if (savedKey) {
      setSyncKey(savedKey);
      setTempKey(savedKey);
    }
  }, []);

  // 2. 問題取得 ＆ クラウドから中断進捗をロード
  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // 問題の読み込み
      const { data: qData } = await supabase
        .from('tanto_questions')
        .select('*')
        .eq('summary_tag', summaryParam)
        .order('id', { ascending: true })
        .limit(30);

      let loadedQuestions: TantoQuestion[] = [];
      if (qData && qData.length > 0) {
        loadedQuestions = qData;
      } else {
        const { data: fallback } = await supabase
          .from('tanto_questions')
          .select('*')
          .in('topic', ['行為能力', '意思能力', '詐術'])
          .limit(30);
        if (fallback) loadedQuestions = fallback;
      }
      setQuestions(loadedQuestions);

      // クラウド（Supabase）から中断データの取得
      const { data: syncData } = await supabase
        .from('user_sync_progress')
        .select('*')
        .eq('sync_key', syncKey)
        .eq('summary_tag', summaryParam)
        .maybeSingle();

      if (syncData) {
        // クラウドの中断地点から再開
        const restoredIndex = syncData.current_index < loadedQuestions.length ? syncData.current_index : 0;
        setCurrentIndex(restoredIndex);
        setUserAnswers(syncData.user_answers || {});
        setStats({ correct: syncData.correct_count || 0, total: syncData.total_count || 0 });
        setStreak(syncData.streak || 0);
      }

      setLoading(false);
    }

    loadData();
  }, [summaryParam, syncKey]);

  // 3. クラウドに進捗を保存・同期する関数
  const saveSyncProgress = useCallback(
    async (newIndex: number, newAnswers: Record<number, boolean>, newCorrect: number, newTotal: number, newStreak: number) => {
      setSyncing(true);
      try {
        await supabase.from('user_sync_progress').upsert({
          sync_key: syncKey,
          summary_tag: summaryParam,
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
    [syncKey, summaryParam]
  );

  const currentQ = questions[currentIndex];
  const selectedAnswer = userAnswers[currentIndex] ?? null;
  const isAnswered = selectedAnswer !== null;

  // 解答時
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

    // 回答直後にクラウドへ同期
    saveSyncProgress(currentIndex, newAnswers, newCorrect, newTotal, newStreak);
  };

  // 前の肢へ
  const handlePrev = () => {
    if (currentIndex > 0) {
      const nextIdx = currentIndex - 1;
      setCurrentIndex(nextIdx);
      saveSyncProgress(nextIdx, userAnswers, stats.correct, stats.total, streak);
    }
  };

  // 次の肢へ
  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      saveSyncProgress(nextIdx, userAnswers, stats.correct, stats.total, streak);
    } else {
      alert(`🎉 演習完了！ 正解数: ${stats.correct} / ${questions.length}`);
    }
  };

  // 演習リセット（1問目からやり直す）
  const handleResetSession = async () => {
    if (!confirm('この単元の進捗をリセットして第1問からやり直しますか？')) return;
    setCurrentIndex(0);
    setUserAnswers({});
    setStats({ correct: 0, total: 0 });
    setStreak(0);
    await saveSyncProgress(0, {}, 0, 0, 0);
  };

  // 同期キー変更の保存
  const handleSaveSyncKey = () => {
    if (!tempKey.trim()) return;
    const cleanKey = tempKey.trim();
    setSyncKey(cleanKey);
    localStorage.setItem('yobi_tanto_synckey', cleanKey);
    setIsEditingKey(false);
  };

  const fontStyles = {
    normal: {
      question: 'text-base leading-relaxed',
      point: 'text-xs leading-relaxed',
      explanation: 'text-xs sm:text-sm leading-relaxed',
    },
    large: {
      question: 'text-lg sm:text-xl leading-relaxed font-medium',
      point: 'text-sm leading-relaxed',
      explanation: 'text-sm sm:text-base leading-relaxed',
    },
    xlarge: {
      question: 'text-xl sm:text-2xl leading-relaxed font-medium tracking-wide',
      point: 'text-base leading-relaxed',
      explanation: 'text-base sm:text-lg leading-relaxed',
    },
  }[fontSize];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400 font-mono text-sm">
        前回の学習進捗を同期中...
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-slate-300 p-6 text-center">
        <p className="text-lg font-bold mb-2">該当する問題が見つかりません</p>
        <Link href="/" className="text-sm text-indigo-400 underline mt-2">
          ← 論証集トップへ戻る
        </Link>
      </div>
    );
  }

  const isCorrect = selectedAnswer === currentQ.correct_answer;
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 max-w-lg mx-auto select-none">
      {/* 上部固定ヘッダー */}
      <header className="border-b border-slate-800 pb-3 pt-1">
        {/* ナビゲーション ＆ クラウド同期インジケーター */}
        <div className="flex justify-between items-center mb-2.5">
          <Link
            href="/"
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 bg-indigo-950/50 border border-indigo-800/60 px-2.5 py-1 rounded-lg transition"
          >
            ← 論証集トップ
          </Link>

          {/* 同期キー設定 ＆ 同期状態 */}
          <div className="flex items-center gap-1.5 text-[11px]">
            {syncing ? (
              <span className="text-amber-400 animate-pulse font-mono">クラウド同期中...</span>
            ) : (
              <span className="text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>同期完了
              </span>
            )}
            <button
              onClick={() => setIsEditingKey(!isEditingKey)}
              className="text-slate-400 hover:text-slate-200 underline font-mono ml-1"
              title="PCとスマホで同じIDを設定すると進捗が共有されます"
            >
              [{syncKey}]
            </button>
          </div>
        </div>

        {/* 同期キー編集入力バー */}
        {isEditingKey && (
          <div className="flex items-center gap-1 mb-2.5 bg-slate-900 border border-slate-700 p-2 rounded-lg text-xs">
            <span className="text-slate-300 font-semibold">同期ID:</span>
            <input
              type="text"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="例: ufu"
              className="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-white flex-1 font-mono text-xs"
            />
            <button
              onClick={handleSaveSyncKey}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2.5 py-1 rounded"
            >
              設定
            </button>
          </div>
        )}

        {/* 前へ・次へ ナビゲーションバー */}
        <div className="flex justify-between items-center mb-2.5">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${
              currentIndex === 0
                ? 'border-slate-800 text-slate-600 bg-slate-900/30 cursor-not-allowed'
                : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95'
            }`}
          >
            ◀ 前へ戻る
          </button>

          <span className="font-bold text-sm text-slate-200">
            問 {currentIndex + 1} / {questions.length}
          </span>

          <button
            onClick={handleNext}
            disabled={currentIndex === questions.length - 1}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${
              currentIndex === questions.length - 1
                ? 'border-slate-800 text-slate-600 bg-slate-900/30 cursor-not-allowed'
                : 'border-indigo-600 bg-indigo-900/50 text-indigo-200 hover:bg-indigo-800/60 active:scale-95'
            }`}
          >
            次へ進む ▶
          </button>
        </div>

        {/* 文字サイズ切替 & 定着率 & 最初からやり直す */}
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
            <span className="text-[10px] text-slate-400 px-1 font-semibold">文字</span>
            <button
              onClick={() => setFontSize('normal')}
              className={`px-2 py-0.5 rounded text-xs transition ${
                fontSize === 'normal' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              標準
            </button>
            <button
              onClick={() => setFontSize('large')}
              className={`px-2 py-0.5 rounded text-xs transition ${
                fontSize === 'large' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              大
            </button>
            <button
              onClick={() => setFontSize('xlarge')}
              className={`px-2 py-0.5 rounded text-xs transition ${
                fontSize === 'xlarge' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              特大
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className={`font-bold ${accuracy >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
              定着率: {accuracy}%
            </span>
            <button
              onClick={handleResetSession}
              className="text-[11px] text-slate-400 hover:text-rose-400 underline ml-1"
              title="この単元の進捗をリセット"
            >
              最初から
            </button>
          </div>
        </div>
      </header>

      {/* 問題文カード */}
      <main className="my-auto py-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
              {currentQ.topic}
            </span>
            {streak >= 3 && (
              <span className="text-xs text-amber-400 font-bold animate-pulse">
                🔥 {streak} 連続正解
              </span>
            )}
          </div>

          <p className={`${fontStyles.question} text-slate-100`}>
            {currentQ.question_text}
          </p>
        </div>

        {/* 解答・判定エリア */}
        <div className="mt-4">
          {!isAnswered ? (
            <div className="grid grid-cols-2 gap-3.5">
              <button
                onClick={() => handleSelect(true)}
                className="h-20 bg-emerald-950/40 hover:bg-emerald-900/60 active:scale-95 border-2 border-emerald-500/50 rounded-2xl flex flex-col items-center justify-center transition shadow-lg"
              >
                <span className="text-3xl font-black text-emerald-400">○</span>
                <span className="text-xs font-semibold text-emerald-300 mt-0.5">正しい</span>
              </button>
              <button
                onClick={() => handleSelect(false)}
                className="h-20 bg-rose-950/40 hover:bg-rose-900/60 active:scale-95 border-2 border-rose-500/50 rounded-2xl flex flex-col items-center justify-center transition shadow-lg"
              >
                <span className="text-3xl font-black text-rose-400">✕</span>
                <span className="text-xs font-semibold text-rose-300 mt-0.5">誤り</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 animate-in fade-in duration-150">
              <div
                className={`p-4 rounded-xl border ${
                  isCorrect
                    ? 'bg-emerald-950/30 border-emerald-500/60 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-500/60 text-rose-300'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-lg mb-1">
                  <span>{isCorrect ? '正解 (○)' : '不正解 (✕)'}</span>
                  <span className="text-xs bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700 text-slate-200">
                    正解肢: {currentQ.correct_answer ? '○ 正しい' : '✕ 誤り'}
                  </span>
                </div>

                {currentQ.point_rule && (
                  <div className="mt-2.5 p-3 bg-slate-900/95 rounded-lg border border-amber-500/30 text-amber-200/95">
                    <span className="font-semibold block text-amber-400 mb-1 text-xs">
                      【判例規範・当てはめ基準】
                    </span>
                    <p className={fontStyles.point}>{currentQ.point_rule}</p>
                  </div>
                )}

                <div className="mt-2.5 text-slate-200">
                  <p className={fontStyles.explanation}>{currentQ.explanation}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-1">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className={`h-12 rounded-xl font-bold border transition ${
                    currentIndex === 0
                      ? 'border-slate-800 text-slate-600 bg-slate-900/40 cursor-not-allowed'
                      : 'border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-slate-100 active:scale-98'
                  }`}
                >
                  ◀ 前の肢に戻る
                </button>
                <button
                  onClick={handleNext}
                  className="h-12 bg-indigo-600 hover:bg-indigo-500 active:scale-98 rounded-xl font-bold text-white shadow-lg transition"
                >
                  {currentIndex < questions.length - 1 ? '次の肢へ進む ▶' : '演習結果を確認'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 下部フッター */}
      <footer className="pt-2 flex justify-between items-center text-xs text-slate-500 border-t border-slate-900">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className={`py-1 px-2.5 rounded ${
            currentIndex === 0 ? 'text-slate-800 cursor-not-allowed' : 'text-slate-400 hover:text-slate-200 underline'
          }`}
        >
          ◀ 前の問へ
        </button>
        <span className="font-mono text-[11px] text-slate-500">{currentQ.summary_tag}</span>
        <button
          onClick={handleNext}
          disabled={currentIndex === questions.length - 1}
          className={`py-1 px-2.5 rounded ${
            currentIndex === questions.length - 1 ? 'text-slate-800 cursor-not-allowed' : 'text-slate-400 hover:text-slate-200 underline'
          }`}
        >
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

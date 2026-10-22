'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Supabase クライアント
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

function TantoPracticeContent() {
  const searchParams = useSearchParams();
  const summaryParam = searchParams.get('summary') || 'DAY001_CAPACITY';

  const [questions, setQuestions] = useState<TantoQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [streak, setStreak] = useState(0);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadQuestions() {
      setLoading(true);
      const { data, error } = await supabase
        .from('tanto_questions')
        .select('*')
        .eq('summary_tag', summaryParam)
        .order('id', { ascending: true })
        .limit(30);

      if (data && !error && data.length > 0) {
        setQuestions(data);
      } else {
        // フォールバック: トピック名で検索
        const { data: fallbackData } = await supabase
          .from('tanto_questions')
          .select('*')
          .in('topic', ['行為能力', '意思能力', '詐術'])
          .limit(30);
        if (fallbackData) setQuestions(fallbackData);
      }
      setLoading(false);
    }
    loadQuestions();
  }, [summaryParam]);

  const currentQ = questions[currentIndex];

  const handleSelect = (choice: boolean) => {
    if (isAnswered || !currentQ) return;

    setSelectedAnswer(choice);
    setIsAnswered(true);

    const isCorrect = choice === currentQ.correct_answer;
    setStats((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));
    setStreak((prev) => (isCorrect ? prev + 1 : 0));
  };

  const handleNext = () => {
    setSelectedAnswer(null);
    setIsAnswered(false);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      alert(`🎉 演習完了！ 正解数: ${stats.correct + (selectedAnswer === currentQ.correct_answer ? 1 : 0)} / ${questions.length}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400 font-mono text-sm">
        問題を読み込み中...
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-slate-300 p-6 text-center">
        <p className="text-lg font-bold mb-2">該当する問題が見つかりません</p>
        <p className="text-xs text-slate-500">Supabase の tanto_questions にデータを投入してください。</p>
      </div>
    );
  }

  const isCorrect = selectedAnswer === currentQ.correct_answer;
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 max-w-md mx-auto select-none">
      {/* 上部ヘッダー（日程表SUMMARY連携・定着率） */}
      <header className="border-b border-slate-800 pb-3 pt-1">
        <div className="flex justify-between items-center text-xs text-slate-400">
          <span className="bg-slate-800 px-2 py-0.5 rounded font-mono text-indigo-400">
            {currentQ.summary_tag}
          </span>
          <span className="font-semibold text-slate-300">
            {currentIndex + 1} / {questions.length} 問
          </span>
          <span className={`font-bold ${accuracy >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
            定着率: {accuracy}%
          </span>
        </div>
      </header>

      {/* 問題文カード */}
      <main className="my-auto py-4">
        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
              {currentQ.topic}
            </span>
            {streak >= 3 && (
              <span className="text-xs text-amber-400 font-bold ml-auto animate-pulse">
                🔥 {streak} 連続正解
              </span>
            )}
          </div>

          <p className="text-base sm:text-lg leading-relaxed text-slate-100 font-normal">
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
                <span className="text-xs font-semibold text-emerald-300 mt-1">正しい</span>
              </button>
              <button
                onClick={() => handleSelect(false)}
                className="h-20 bg-rose-950/40 hover:bg-rose-900/60 active:scale-95 border-2 border-rose-500/50 rounded-2xl flex flex-col items-center justify-center transition shadow-lg"
              >
                <span className="text-3xl font-black text-rose-400">✕</span>
                <span className="text-xs font-semibold text-rose-300 mt-1">誤り</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 animate-in fade-in duration-150">
              {/* 正誤判定ヘッダー */}
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

                {/* 答案作成に直結する規範 */}
                {currentQ.point_rule && (
                  <div className="mt-2.5 p-2.5 bg-slate-900/95 rounded-lg border border-amber-500/30 text-xs text-amber-200/90 leading-relaxed">
                    <span className="font-semibold block text-amber-400 mb-0.5">【判例規範・当てはめ基準】</span>
                    {currentQ.point_rule}
                  </div>
                )}

                {/* 理由付け・解説 */}
                <p className="mt-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
                  {currentQ.explanation}
                </p>
              </div>

              {/* 次へ進むボタン */}
              <button
                onClick={handleNext}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 active:scale-98 rounded-xl font-bold text-white shadow-lg transition"
              >
                {currentIndex < questions.length - 1 ? '次の肢へ進む →' : '演習結果を確認する'}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* フッター */}
      <footer className="text-center text-[10px] text-slate-600 pb-1">
        短答肢別速攻演習 • 予備試験対策
      </footer>
    </div>
  );
}

export default function TantoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-400 p-4">読み込み中...</div>}>
      <TantoPracticeContent />
    </Suspense>
  );
}

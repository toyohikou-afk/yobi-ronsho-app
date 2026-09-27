'use client';

import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';

export default function Home() {
  // === タブ切り替え ('tantou' or 'ronsho') ===
  const [activeTab, setActiveTab] = useState<'tantou' | 'ronsho'>('tantou');

  // === 短答ドリル用ステート ===
  const [questions, setQuestions] = useState<any[]>([]); // 全問題リスト
  const [currentIndex, setCurrentIndex] = useState(0); // 現在の問題のインデックス
  const [loading, setLoading] = useState(true);
  const [userAnswer, setUserAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  
  // フィルター用
  const [years, setYears] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [onlyFrequent, setOnlyFrequent] = useState(false);

  // 編集用モーダルの状態
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);

  // === 論文（論証カード）用ステート ===
  const [prompt, setPrompt] = useState('【会社法】取締役の競業避止義務（356条1項1号）の該当性と損害額の算定について、判例をベースに出力して。');
  const [result, setResult] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cards, setCards] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editIssue, setEditIssue] = useState('');
  const [editNorm, setEditNorm] = useState('');
  const [editCriteria, setEditCriteria] = useState('');

  // ==========================================
  // 短答ドリル系の処理
  // ==========================================
  // 年度・科目リストの取得
  const fetchFilterOptions = async () => {
    const { data: yearData } = await supabase.from('tantou_questions').select('year').not('year', 'is', null);
    if (yearData) {
      const uniqueYears = Array.from(new Set(yearData.map(item => item.year))).sort().reverse();
      setYears(uniqueYears);
    }
    const { data: subjData } = await supabase.from('tantou_questions').select('subject').not('answer', 'eq', '');
    if (subjData) {
      const uniqueSubjs = Array.from(new Set(subjData.map(item => item.subject))).sort();
      setSubjects(uniqueSubjs);
    }
  };

  // 問題リストの取得（表記ゆれ対応の柔軟なフィルター付き）
  const fetchQuestionsList = async () => {
    setLoading(true);
    setIsAnswered(false);
    setUserAnswer('');

    let query = supabase.from('tantou_questions').select('*').neq('answer', '').order('id', { ascending: true });

    // 表記ゆれ（令和7, 令和7年, 令和7年度）を吸収するため部分一致（ilike）で検索
    if (selectedYear !== 'ALL') {
      const cleanYear = selectedYear.replace(/年度|年/g, '');
      query = query.ilike('year', `%${cleanYear}%`);
    }

    if (selectedSubject !== 'ALL') {
      query = query.eq('subject', selectedSubject);
    }

    if (onlyFrequent) {
      query = query.eq('is_frequent', 1);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      setQuestions([]);
    } else {
      setQuestions(data);
      setCurrentIndex(0); // フィルター変更時は最初の問題へ
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchQuestionsList();
  }, [selectedYear, selectedSubject, onlyFrequent]);

  const question = questions.length > 0 ? questions[currentIndex] : null;

  const addNum = (n: number) => setUserAnswer(prev => prev + String(n));
  const clearNum = () => setUserAnswer('');
  
  const submitAnswer = () => {
    if (!userAnswer || !question) return;
    const correctAns = question.answer.replace(/[^0-9]/g, '');
    setIsCorrect(userAnswer === correctAns);
    setIsAnswered(true);
  };

  // 前へ・次へ移動
  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsAnswered(false);
      setUserAnswer('');
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsAnswered(false);
      setUserAnswer('');
    }
  };

  // 削除機能
  const handleDeleteQuestion = async (id: number) => {
    if (!confirm('本当にこの問題を削除しますか？')) return;

    const { error } = await supabase.from('tantou_questions').delete().eq('id', id);

    if (error) {
      alert('削除に失敗しました: ' + error.message);
    } else {
      alert('削除しました');
      const updated = questions.filter((q) => q.id !== id);
      setQuestions(updated);
      if (currentIndex >= updated.length && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    }
  };

  // 更新（編集保存）機能
  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;

    const { error } = await supabase
      .from('tantou_questions')
      .update({
        question_text: editingQuestion.question_text,
        answer: editingQuestion.answer,
        subject: editingQuestion.subject,
        year: editingQuestion.year,
        question_num: editingQuestion.question_num,
      })
      .eq('id', editingQuestion.id);

    if (error) {
      alert('更新に失敗しました: ' + error.message);
    } else {
      alert('更新しました');
      setQuestions(
        questions.map((q) => (q.id === editingQuestion.id ? editingQuestion : q))
      );
      setEditingQuestion(null);
    }
  };

  // 短答からAI論文タブへの連携
  const handleSendToAI = () => {
    if (!question) return;
    const formattedYear = question.year.includes('年') ? question.year : `${question.year}年度`;
    const newPrompt = `以下の短答過去問（${formattedYear} ${question.subject}）について、関連する論点を抽出し、論証カード（規範定立と当てはめ基準）を作成してください。\n\n【問題】\n${question.question_text}`;
    setPrompt(newPrompt);
    setActiveTab('ronsho');
    window.scrollTo(0, 0);
  };

  // ==========================================
  // 論文（論証カード）系の処理
  // ==========================================
  const fetchCards = async () => {
    const { data } = await supabase.from('ronsho_cards').select('*').order('created_at', { ascending: false });
    if (data) setCards(data);
  };

  useEffect(() => {
    fetchCards();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error('APIエラー');
      setResult(await res.json());
    } catch (e) {
      alert('生成に失敗しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      const item = Array.isArray(result) ? result[0] : result;
      await supabase.from('ronsho_cards').insert([{
        subject: item.subject || item.科目 || '未設定',
        issue: item.topic || item.issue || item.論点 || '未設定',
        norm: item.norm || item.規範定立 || '',
        criteria: Array.isArray(item.application_criteria) ? item.application_criteria.join('\n') : (item.application_criteria || ''),
        raw_data: result
      }]);
      alert('✅ 保存しました！');
      setResult(null);
      fetchCards();
    } catch (e) {
      alert('❌ 保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCard = async (id: number) => {
    if (!confirm('本当に削除しますか？')) return;
    await supabase.from('ronsho_cards').delete().eq('id', id);
    fetchCards();
  };

  const startEditingCard = (card: any, s: string, i: string, n: string, c: string) => {
    setEditingId(card.id); setEditSubject(s); setEditIssue(i); setEditNorm(n); setEditCriteria(c);
  };

  const handleUpdateCard = async (id: number) => {
    await supabase.from('ronsho_cards').update({ subject: editSubject, issue: editIssue, norm: editNorm, criteria: editCriteria }).eq('id', id);
    alert('✏️ 更新しました！');
    setEditingId(null);
    fetchCards();
  };

  // テンキーボタン数の判定
  let maxButtons = 8;
  let isTwoBtns = false;
  if (question) {
    const qText = question.question_text || '';
    if (qText.includes('1を、誤っている場合には2') || qText.includes('場合には1')) { maxButtons = 2; isTwoBtns = true; }
    else if (qText.includes('1から6')) maxButtons = 6;
    else if (qText.includes('1から5')) maxButtons = 5;
  }

  // 年度表示を綺麗にするヘルパー
  const displayYear = question ? (question.year.includes('年') ? question.year : `${question.year}年度`) : '';

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '15px', maxWidth: '800px', margin: 'auto', backgroundColor: '#f5f6fa', color: '#333', minHeight: '100vh', boxSizing: 'border-box' }}>
      
      {/* --- ヘッダー ＆ タブ切り替え --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e1e8ed', paddingBottom: '12px', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '22px', color: '#2c3e50', margin: 0 }}>予備試験 学習システム</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('tantou')}
            style={{ padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'tantou' ? '#4a69bd' : '#fff', color: activeTab === 'tantou' ? '#fff' : '#4a69bd', border: '1px solid #4a69bd' }}
          >
            短答過去問 (yobi_db)
          </button>
          <button
            onClick={() => setActiveTab('ronsho')}
            style={{ padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'ronsho' ? '#4a69bd' : '#fff', color: activeTab === 'ronsho' ? '#fff' : '#4a69bd', border: '1px solid #4a69bd' }}
          >
            論文・論証カード (anki)
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. 短答過去問タブ                                         */}
      {/* ========================================================= */}
      {activeTab === 'tantou' && (
        <div>
          {/* フィルターパネル */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between', border: '2px solid #4a69bd' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #4a69bd', fontSize: '14px', background: '#fff', color: '#2c3e50', fontWeight: 'bold', cursor: 'pointer' }}>
                <option value="ALL">📅 すべての年度</option>
                {years.map(y => <option key={y} value={y}>{y.includes('年') ? y : `${y}年`}</option>)}
              </select>
              <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #4a69bd', fontSize: '14px', background: '#fff', color: '#2c3e50', fontWeight: 'bold', cursor: 'pointer' }}>
                <option value="ALL">📚 すべての科目</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={onlyFrequent} onChange={(e) => setOnlyFrequent(e.target.checked)} /> ⭐ 頻出
              </label>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', fontWeight: 'bold', color: '#7f8fa6' }}>読み込み中...</div>
          ) : !question ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#e84118', fontWeight: 'bold' }}>条件に一致する問題がありません。</div>
          ) : (
            <>
              {/* 問題文ボックス */}
              <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', marginBottom: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', borderLeft: '5px solid #4a69bd' }}>
                <h3 style={{ color: '#4a69bd', fontSize: '18px', marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>【{question.subject} 第{question.question_num}問】({displayYear})</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', background: '#e3f2fd', color: '#0d47a1', padding: '2px 8px', borderRadius: '4px' }}>ID: {question.id}</span>
                    <button
                      onClick={() => setEditingQuestion(question)}
                      style={{ padding: '2px 8px', fontSize: '12px', background: '#fbc531', color: '#2c3e50', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(question.id)}
                      style={{ padding: '2px 8px', fontSize: '12px', background: '#e84118', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      削除
                    </button>
                  </div>
                </h3>
                <div style={{ fontSize: '16px', lineHeight: '1.8', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', color: '#333' }}>
                  {question.question_text}
                </div>
              </div>

              {/* 前へ・次へページネーションボタン */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: currentIndex === 0 ? '#dcdde1' : '#fff', color: currentIndex === 0 ? '#7f8fa6' : '#2c3e50', border: '1px solid #b2bec3', cursor: currentIndex === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                >
                  &lt; 前の問題
                </button>
                <span style={{ alignSelf: 'center', fontSize: '14px', fontWeight: 'bold', color: '#7f8fa6' }}>
                  {currentIndex + 1} / {questions.length}
                </span>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === questions.length - 1}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: currentIndex === questions.length - 1 ? '#dcdde1' : '#fff', color: currentIndex === questions.length - 1 ? '#7f8fa6' : '#2c3e50', border: '1px solid #b2bec3', cursor: currentIndex === questions.length - 1 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                >
                  次の問題 &gt;
                </button>
              </div>

              {/* 解答入力・判定エリア */}
              {!isAnswered ? (
                <div>
                  <input
                    type="text"
                    readOnly
                    value={userAnswer}
                    placeholder="解答"
                    style={{ width: '100%', maxWidth: '300px', padding: '15px', fontSize: '28px', textAlign: 'center', border: '2px solid #4a69bd', borderRadius: '8px', margin: '0 auto 15px auto', display: 'block', letterSpacing: '5px', background: '#fff', fontWeight: 'bold', color: '#2c3e50', boxSizing: 'border-box' }}
                  />
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginBottom: '15px', maxWidth: '400px', margin: '0 auto 15px auto' }}>
                    {Array.from({ length: maxButtons }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => addNum(n)}
                        style={{ flex: isTwoBtns ? '1 1 calc(50% - 10px)' : '1 1 calc(25% - 10px)', minWidth: '60px', padding: '15px', fontSize: '24px', fontWeight: 'bold', backgroundColor: '#fff', color: '#4a69bd', border: '2px solid #4a69bd', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', maxWidth: '300px', margin: '0 auto' }}>
                    <button onClick={clearNum} style={{ flex: 1, padding: '15px', fontSize: '18px', border: 'none', borderRadius: '10px', background: '#7f8fa6', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>クリア</button>
                    <button onClick={submitAnswer} style={{ flex: 2, padding: '15px', fontSize: '18px', border: 'none', borderRadius: '10px', background: '#e84118', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>解答を送信</button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                  {isCorrect ? (
                    <p style={{ color: '#44bd32', fontSize: '32px', fontWeight: 'bold', margin: 0 }}>⭕️ 大正解！！</p>
                  ) : (
                    <div>
                      <p style={{ color: '#e84118', fontSize: '32px', fontWeight: 'bold', margin: 0 }}>❌ 不正解...</p>
                      <p style={{ fontSize: '20px', margin: '10px 0' }}>あなたの解答: <b style={{ letterSpacing: '2px' }}>{userAnswer}</b><br />正解は <b style={{ letterSpacing: '2px' }}>{question.answer.replace(/[^0-9]/g, '')}</b> です</p>
                    </div>
                  )}

                  {/* AI連携ボタン */}
                  <div style={{ marginTop: '20px' }}>
                    <button onClick={handleSendToAI} style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                      ✨ この問題をAIで「論証カード」にする
                    </button>
                  </div>

                  <button onClick={handleNext} style={{ backgroundColor: '#44bd32', color: 'white', width: '100%', maxWidth: '300px', padding: '15px', fontSize: '20px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', marginTop: '20px' }}>次の問題へ</button>
                </div>
              )}

              {/* 解説アコーディオン */}
              {isAnswered && (
                <div style={{ marginTop: '20px' }}>
                  {['a', 'b', 'c', 'd', 'e'].map((char, idx) => {
                    const exp = question[`explanation_${char}`];
                    if (!exp) return null;
                    const labels = ['ア', 'イ', 'ウ', 'エ', 'オ'];
                    return (
                      <details key={char} style={{ marginTop: '10px', border: '1px solid #ccc', borderRadius: '5px', background: '#fff' }}>
                        <summary style={{ padding: '10px', background: '#f0f8ff', fontWeight: 'bold', cursor: 'pointer' }}>{labels[idx]} の解説を見る</summary>
                        <p style={{ padding: '15px', margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#333' }}>{exp}</p>
                      </details>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. 論文・論証カードタブ                                   */}
      {/* ========================================================= */}
      {activeTab === 'ronsho' && (
        <div>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: '20px', border: '2px solid #4a69bd' }}>
            <label style={{ display: 'block', fontSize: '15px', fontWeight: 'bold', marginBottom: '8px', color: '#2c3e50' }}>論文プロンプト入力</label>
            <textarea
              style={{ width: '100%', padding: '12px', fontSize: '15px', border: '1px solid #4a69bd', borderRadius: '8px', height: '120px', boxSizing: 'border-box', color: '#333' }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              style={{ marginTop: '12px', background: '#4a69bd', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {isGenerating ? 'AI生成中...' : 'JSONデータを生成'}
            </button>

            {result && (
              <div style={{ marginTop: '20px', borderTop: '1px dashed #ccc', paddingTop: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>生成結果プレビュー</h4>
                <pre style={{ background: '#2d3436', color: '#55efc4', padding: '12px', borderRadius: '8px', fontSize: '13px', overflowX: 'auto' }}>
                  {JSON.stringify(result, null, 2)}
                </pre>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{ marginTop: '10px', background: '#e84118', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
                >
                  {isSaving ? '保存中...' : 'データベースに保存する'}
                </button>
              </div>
            )}
          </div>

          <h3 style={{ color: '#2c3e50', borderBottom: '2px solid #4a69bd', paddingBottom: '5px' }}>📚 蓄積された論証カード ({cards.length}件)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
            {cards.map((card) => {
              const raw = card.raw_data;
              const rawItem = Array.isArray(raw) ? raw[0] : (raw || {});
              const s = card.subject || rawItem.subject || rawItem.科目 || '未設定';
              const i = card.issue || rawItem.topic || rawItem.issue || rawItem.論点 || '（論点記載なし）';
              const n = card.norm || rawItem.norm || rawItem.規範定立 || '（規範データなし）';
              const rawC = card.criteria || rawItem.application_criteria || rawItem.当てはめ基準;
              const c = Array.isArray(rawC) ? rawC.join('\n') : (rawC || '（当てはめ基準記載なし）');
              const isEditing = editingId === card.id;

              return (
                <div key={card.id} style={{ background: '#fff', padding: '18px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #dcdde1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    {isEditing ? (
                      <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #4a69bd', borderRadius: '4px' }} />
                    ) : (
                      <span style={{ background: '#4a69bd', color: '#fff', fontSize: '12px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>{s}</span>
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {isEditing ? (
                        <>
                          <button onClick={() => handleUpdateCard(card.id)} style={{ background: '#44bd32', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>保存</button>
                          <button onClick={() => setEditingId(null)} style={{ background: '#7f8fa6', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>取消</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditingCard(card, s, i, n, c)} style={{ background: '#fbc531', color: '#2c3e50', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>編集</button>
                          <button onClick={() => handleDeleteCard(card.id)} style={{ background: '#e84118', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>削除</button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <input type="text" value={editIssue} onChange={(e) => setEditIssue(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #4a69bd', borderRadius: '4px', marginBottom: '10px', boxSizing: 'border-box' }} />
                  ) : (
                    <h4 style={{ color: '#2c3e50', margin: '0 0 12px 0', fontSize: '17px' }}>論点: {i}</h4>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', border: '1px solid #e1e8ed' }}>
                      <strong style={{ display: 'block', fontSize: '12px', color: '#4a69bd', marginBottom: '5px' }}>【規範定立】</strong>
                      {isEditing ? (
                        <textarea value={editNorm} onChange={(e) => setEditNorm(e.target.value)} style={{ width: '100%', height: '80px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                      ) : (
                        <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: '1.5', color: '#333' }} dangerouslySetInnerHTML={{ __html: n }} />
                      )}
                    </div>
                    <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', border: '1px solid #e1e8ed' }}>
                      <strong style={{ display: 'block', fontSize: '12px', color: '#4a69bd', marginBottom: '5px' }}>【当てはめ基準】</strong>
                      {isEditing ? (
                        <textarea value={editCriteria} onChange={(e) => setEditCriteria(e.target.value)} style={{ width: '100%', height: '80px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                      ) : (
                        <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: '1.5', color: '#333' }} dangerouslySetInnerHTML={{ __html: c }} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- 編集モーダル --- */}
      {editingQuestion && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, color: '#2c3e50' }}>問題の編集</h3>
            <form onSubmit={handleUpdateQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>科目</label>
                <input
                  type="text"
                  value={editingQuestion.subject}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, subject: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>問題番号</label>
                <input
                  type="number"
                  value={editingQuestion.question_num}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, question_num: Number(e.target.value) })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>問題文</label>
                <textarea
                  rows={8}
                  value={editingQuestion.question_text}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>正解</label>
                <input
                  type="text"
                  value={editingQuestion.answer}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, answer: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  style={{ padding: '8px 16px', background: '#7f8fa6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 16px', background: '#4a69bd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

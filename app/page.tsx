'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';

export default function Home() {
  // === 管理者フラグ ===
  const [isAdmin, setIsAdmin] = useState(false);

  // === タブ切り替え ('tantou' or 'ronsho') ===
  const [activeTab, setActiveTab] = useState<'tantou' | 'ronsho'>('tantou');

  // === 短答ドリル用ステート ===
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userAnswer, setUserAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // 正答率カウンター用ステート
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [correctAttempts, setCorrectAttempts] = useState(0);

  // 復習（間違えた問題）管理用ステート
  const [mistakeIds, setMistakeIds] = useState<number[]>([]);
  const [onlyMistake, setOnlyMistake] = useState(false);

  // ア〜オ個別入力用ステート
  const [isMultiChoiceMode, setIsMultiChoiceMode] = useState(false);
  const [activeItemCount, setActiveItemCount] = useState<number>(5); // 3, 4, 5
  const [subAnswers, setSubAnswers] = useState<{ [key: string]: string }>({
    ア: '', イ: '', ウ: '', エ: '', オ: ''
  });
  
  // フィルター用
  const [years, setYears] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [onlyFrequent, setOnlyFrequent] = useState(false);

  // 編集用モーダル
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);

  // === 論文（論証カード）用ステート ===
  const [prompt, setPrompt] = useState('【会社法】取締役の競業避止義務（356条1項1号）の該当性と損害額の算定について、判例をベースに出力して。');
  const [result, setResult] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cards, setCards] = useState<any[]>([]);
  
  // 論文カードフィルター＆検索用
  const [selectedCardSubject, setSelectedCardSubject] = useState('ALL');
  const [cardSearchKeyword, setCardSearchKeyword] = useState('');

  // カード編集用
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editArticleNum, setEditArticleNum] = useState('');
  const [editKihan, setEditKihan] = useState('');
  const [editAtehame, setEditAtehame] = useState('');

  // ==========================================
  // サーバーAPI経由での安全な管理者認証 (/api/generate を利用)
  // ==========================================
  useEffect(() => {
    const verifyPasscode = async (passcode: string) => {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode }),
        });

        if (res.status === 401) {
          alert('❌ パスワードが一致しませんでした。');
          return;
        }

        const data = await res.json();
        if (data.success) {
          localStorage.setItem('yobi_is_admin', 'true');
          setIsAdmin(true);
          alert('🔑 管理者権限を有効化しました（このブラウザに記憶されます）');
        } else {
          alert(`❌ 認証エラー: ${data.error || '通信に失敗しました'}`);
        }
      } catch (e: any) {
        alert(`通信解析エラー: ${e.message}`);
      }
    };

    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const queryPass = params.get('admin');

        // URLに ?admin=xxx がある場合はサーバーAPIで安全に検証
        if (queryPass) {
          window.history.replaceState({}, '', window.location.pathname);
          verifyPasscode(queryPass);
        } else if (params.get('logout') === 'true') {
          localStorage.removeItem('yobi_is_admin');
          setIsAdmin(false);
          window.history.replaceState({}, '', window.location.pathname);
          alert('🔒 管理者権限を解除しました');
        } else if (localStorage.getItem('yobi_is_admin') === 'true') {
          setIsAdmin(true);
        }
      }

      // 復習リストの復元
      const saved = localStorage.getItem('yobi_mistake_ids');
      if (saved) {
        setMistakeIds(JSON.parse(saved));
      }
    } catch (e) {
      console.error('ストレージ読み込みエラー:', e);
    }
  }, []);

  const toggleMistake = (id: number) => {
    setMistakeIds((prev) => {
      const exists = prev.includes(id);
      const updated = exists ? prev.filter((item) => item !== id) : [...prev, id];
      localStorage.setItem('yobi_mistake_ids', JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearAllMistakes = () => {
    if (!confirm(`復習リスト（間違えた問題: ${mistakeIds.length}件）をすべてクリアしますか？`)) return;
    setMistakeIds([]);
    localStorage.removeItem('yobi_mistake_ids');
    setOnlyMistake(false);
  };

  const handleResetScore = () => {
    if (!confirm('今回のスコア（正解数・解答数）をリセットしますか？')) return;
    setTotalAttempts(0);
    setCorrectAttempts(0);
  };

  // ==========================================
  // 短答ドリル系の処理
  // ==========================================
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

  const fetchQuestionsList = async () => {
    setLoading(true);
    setIsAnswered(false);
    setUserAnswer('');
    setSubAnswers({ ア: '', イ: '', ウ: '', エ: '', オ: '' });

    let query = supabase.from('tantou_questions').select('*').neq('answer', '').order('id', { ascending: true });

    if (selectedYear !== 'ALL') {
      const cleanYear = selectedYear.replace(/年度|年/g, '');
      query = query.ilike('year', `%${cleanYear}%`);
    }
    if (selectedSubject !== 'ALL') query = query.eq('subject', selectedSubject);
    if (onlyFrequent) query = query.eq('is_frequent', 1);

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      setQuestions([]);
    } else {
      let filtered = data;
      if (onlyMistake) {
        filtered = filtered.filter((q) => mistakeIds.includes(q.id));
      }
      setQuestions(filtered);
      setCurrentIndex(0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchQuestionsList();
  }, [selectedYear, selectedSubject, onlyFrequent, onlyMistake]);

  const question = questions.length > 0 ? questions[currentIndex] : null;

  useEffect(() => {
    if (question) {
      const qText = question.question_text || '';
      const ansDigits = (question.answer || '').replace(/[^0-9]/g, '');

      const looksLikeMulti = (qText.includes('正しい場合には1') || qText.includes('場合には1')) &&
                             (qText.includes('ア') || qText.includes('記述'));

      setIsMultiChoiceMode(looksLikeMulti);

      if (ansDigits.length >= 3 && ansDigits.length <= 5) {
        setActiveItemCount(ansDigits.length);
      } else if (!qText.includes('エ') && !qText.includes('オ')) {
        setActiveItemCount(3);
      } else if (!qText.includes('オ')) {
        setActiveItemCount(4);
      } else {
        setActiveItemCount(5);
      }

      setSubAnswers({ ア: '', イ: '', ウ: '', エ: '', オ: '' });
      setUserAnswer('');
      setIsAnswered(false);
    }
  }, [currentIndex, question]);

  const allLabels = ['ア', 'イ', 'ウ', 'エ', 'オ'];
  const currentLabels = allLabels.slice(0, activeItemCount);

  const addNum = (n: number) => setUserAnswer(prev => prev + String(n));
  const clearNum = () => setUserAnswer('');

  const handleSelectSub = (label: string, val: string) => {
    setSubAnswers(prev => ({ ...prev, [label]: val }));
  };
  
  const submitAnswer = () => {
    if (!question) return;

    let finalAnswer = userAnswer;
    if (isMultiChoiceMode) {
      finalAnswer = currentLabels.map(k => subAnswers[k]).join('');
      if (finalAnswer.length < activeItemCount) {
        alert(`${currentLabels[0]}から${currentLabels[currentLabels.length - 1]}まですべて選択してください。`);
        return;
      }
    }

    if (!finalAnswer) return;

    const correctAns = question.answer.replace(/[^0-9]/g, '');
    const correct = finalAnswer === correctAns;
    setIsCorrect(correct);
    setUserAnswer(finalAnswer);
    setIsAnswered(true);

    setTotalAttempts(prev => prev + 1);
    if (correct) {
      setCorrectAttempts(prev => prev + 1);
    }

    if (!correct && !mistakeIds.includes(question.id)) {
      const updated = [...mistakeIds, question.id];
      setMistakeIds(updated);
      localStorage.setItem('yobi_mistake_ids', JSON.stringify(updated));
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsAnswered(false);
      setUserAnswer('');
      setSubAnswers({ ア: '', イ: '', ウ: '', エ: '', オ: '' });
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsAnswered(false);
      setUserAnswer('');
      setSubAnswers({ ア: '', イ: '', ウ: '', エ: '', オ: '' });
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!isAdmin) return;
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

  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingQuestion) return;

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
      setQuestions(questions.map((q) => (q.id === editingQuestion.id ? editingQuestion : q)));
      setEditingQuestion(null);
    }
  };

  const handleSendToAI = () => {
    if (!question) return;
    const formattedYear = question.year.includes('年') ? question.year : `${question.year}年度`;
    const newPrompt = `以下の短答過去問（${formattedYear} ${question.subject}）について、関連する論点を抽出し、判例の立場に立った規範定立と明確な当てはめ基準を含めた論証カードを作成してください。\n\n【問題】\n${question.question_text}`;
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

  const cardSubjects = useMemo(() => {
    const subs = cards.map((c) => {
      const raw = c.raw_data;
      const rawItem = Array.isArray(raw) ? raw[0] : (raw || {});
      return c.subject || rawItem.subject || rawItem.科目;
    }).filter(Boolean);
    return Array.from(new Set(subs)).sort();
  }, [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const raw = card.raw_data;
      const rawItem = Array.isArray(raw) ? raw[0] : (raw || {});
      const s = card.subject || rawItem.subject || rawItem.科目 || '';
      const t = card.title || card.issue || rawItem.topic || rawItem.issue || rawItem.論点 || '';
      const a = card.article_num || rawItem.article_num || rawItem.条文 || '';
      const k = card.kihan || card.norm || rawItem.norm || rawItem.規範定立 || '';
      const rawAt = card.atehame || card.criteria || rawItem.application_criteria || rawItem.当てはめ基準;
      const at = Array.isArray(rawAt) ? rawAt.join(' ') : (rawAt || '');

      if (selectedCardSubject !== 'ALL' && s !== selectedCardSubject) return false;

      if (cardSearchKeyword.trim() !== '') {
        const kw = cardSearchKeyword.trim().toLowerCase();
        const targetText = `${s} ${t} ${a} ${k} ${at}`.toLowerCase();
        if (!targetText.includes(kw)) return false;
      }

      return true;
    });
  }, [cards, selectedCardSubject, cardSearchKeyword]);

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
    if (!isAdmin || !result) return;
    setIsSaving(true);
    try {
      const item = Array.isArray(result) ? result[0] : result;
      await supabase.from('ronsho_cards').insert([{
        subject: item.subject || item.科目 || '未設定',
        title: item.topic || item.issue || item.論点 || item.title || '未設定',
        article_num: item.article_num || item.条文 || '',
        kihan: item.norm || item.規範定立 || item.kihan || '',
        atehame: Array.isArray(item.application_criteria) ? item.application_criteria.join('\n') : (item.application_criteria || item.atehame || item.当てはめ基準 || ''),
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
    if (!isAdmin) return;
    if (!confirm('本当に削除しますか？')) return;
    await supabase.from('ronsho_cards').delete().eq('id', id);
    fetchCards();
  };

  const startEditingCard = (card: any, s: string, t: string, a: string, k: string, at: string) => {
    if (!isAdmin) return;
    setEditingId(card.id);
    setEditSubject(s);
    setEditTitle(t);
    setEditArticleNum(a);
    setEditKihan(k);
    setEditAtehame(at);
  };

  const handleUpdateCard = async (id: number) => {
    if (!isAdmin) return;
    await supabase.from('ronsho_cards').update({
      subject: editSubject,
      title: editTitle,
      article_num: editArticleNum,
      kihan: editKihan,
      atehame: editAtehame
    }).eq('id', id);
    alert('✏️ 更新しました！');
    setEditingId(null);
    fetchCards();
  };

  let maxButtons = 8;
  let isTwoBtns = false;
  if (question) {
    const qText = question.question_text || '';
    if (qText.includes('1を、誤っている場合には2') || qText.includes('場合には1')) { maxButtons = 2; isTwoBtns = true; }
    else if (qText.includes('1から6')) maxButtons = 6;
    else if (qText.includes('1から5')) maxButtons = 5;
  }

  const displayYear = question ? (question.year.includes('年') ? question.year : `${question.year}年度`) : '';
  const isMarkedMistake = question ? mistakeIds.includes(question.id) : false;

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '15px', maxWidth: '800px', margin: 'auto', backgroundColor: '#f5f6fa', color: '#333', minHeight: '100vh', boxSizing: 'border-box' }}>
      
      {/* ヘッダー ＆ タブ切り替え */}
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

      {/* 1. 短答過去問タブ */}
      {activeTab === 'tantou' && (
        <div>
          {/* フィルターパネル */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', border: '2px solid #4a69bd' }}>
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
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={onlyFrequent} onChange={(e) => setOnlyFrequent(e.target.checked)} /> ⭐ 頻出
              </label>
              
              <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#e84118', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: onlyMistake ? '#ffeaa7' : 'transparent', padding: '3px 8px', borderRadius: '5px' }}>
                <input type="checkbox" checked={onlyMistake} onChange={(e) => setOnlyMistake(e.target.checked)} /> ❌ 間違えた問題 ({mistakeIds.length})
              </label>
            </div>
          </div>

          {/* 成績カウンター ＆ 復習一括リセットバー */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #dcdde1', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2c3e50' }}>
                📊 今回の成績: 正解 <span style={{ color: '#44bd32', fontSize: '16px' }}>{correctAttempts}</span> / 解答 <span style={{ fontSize: '16px' }}>{totalAttempts}</span>
                {totalAttempts > 0 && (
                  <span style={{ marginLeft: '8px', color: '#4a69bd', fontSize: '14px' }}>
                    ({Math.round((correctAttempts / totalAttempts) * 100)}%)
                  </span>
                )}
              </span>
              {totalAttempts > 0 && (
                <button
                  onClick={handleResetScore}
                  style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #b2bec3', background: '#f5f6fa', color: '#636e72', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  スコアリセット
                </button>
              )}
            </div>

            {mistakeIds.length > 0 && (
              <button
                onClick={handleClearAllMistakes}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '5px', border: '1px solid #e84118', background: '#fff', color: '#e84118', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🗑️ 復習リストを全リセット ({mistakeIds.length}件)
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', fontWeight: 'bold', color: '#7f8fa6' }}>読み込み中...</div>
          ) : !question ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#e84118', fontWeight: 'bold' }}>
              {onlyMistake ? '現在、間違えた問題（復習対象）はありません！🎉' : '条件に一致する問題がありません。'}
            </div>
          ) : (
            <>
              {/* 問題文ボックス */}
              <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', marginBottom: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', borderLeft: isMarkedMistake ? '5px solid #e84118' : '5px solid #4a69bd' }}>
                <h3 style={{ color: '#4a69bd', fontSize: '18px', marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span>【{question.subject} 第{question.question_num}問】({displayYear})</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      onClick={() => toggleMistake(question.id)}
                      style={{
                        padding: '3px 9px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        borderRadius: '4px',
                        border: isMarkedMistake ? '1px solid #e84118' : '1px solid #b2bec3',
                        background: isMarkedMistake ? '#ffeaa7' : '#f5f6fa',
                        color: isMarkedMistake ? '#d63031' : '#636e72',
                        cursor: 'pointer'
                      }}
                    >
                      {isMarkedMistake ? '🔖 復習中' : '☆ 復習に追加'}
                    </button>
                    <span style={{ fontSize: '12px', background: '#e3f2fd', color: '#0d47a1', padding: '2px 8px', borderRadius: '4px' }}>ID: {question.id}</span>
                    
                    {/* 管理者のみ編集・削除ボタンを表示 */}
                    {isAdmin && (
                      <>
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
                      </>
                    )}
                  </div>
                </h3>
                <div style={{ fontSize: '16px', lineHeight: '1.8', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', color: '#333' }}>
                  {question.question_text}
                </div>
              </div>

              {/* 前へ・次へページネーションボタン */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
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

              {/* 解答形式手動切り替えバー */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                <button
                  onClick={() => setIsMultiChoiceMode(!isMultiChoiceMode)}
                  style={{ fontSize: '12px', background: '#ecf0f1', border: '1px solid #bdc3c7', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', color: '#2c3e50', fontWeight: 'bold' }}
                >
                  ⚙️ 解答欄切替: {isMultiChoiceMode ? `ア〜${currentLabels[currentLabels.length - 1]}個別選択中` : '通常テンキー入力中'} (手動で変更)
                </button>
              </div>

              {/* 解答入力・判定エリア */}
              {!isAnswered ? (
                <div>
                  {isMultiChoiceMode ? (
                    <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '2px solid #4a69bd', maxWidth: '440px', margin: '0 auto 15px auto', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #dcdde1', paddingBottom: '8px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#4a69bd' }}>
                          個別判定 (1: 正 / 2: 誤)
                        </span>
                        
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {[3, 4, 5].map((cnt) => (
                            <button
                              key={cnt}
                              onClick={() => setActiveItemCount(cnt)}
                              style={{
                                padding: '2px 6px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                borderRadius: '4px',
                                border: '1px solid #4a69bd',
                                background: activeItemCount === cnt ? '#4a69bd' : '#fff',
                                color: activeItemCount === cnt ? '#fff' : '#4a69bd',
                                cursor: 'pointer'
                              }}
                            >
                              {cnt}肢
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {currentLabels.map((label) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: '#f8f9fa', borderRadius: '6px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '16px', width: '30px', color: '#2c3e50' }}>{label}</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleSelectSub(label, '1')}
                                style={{
                                  padding: '8px 18px',
                                  fontSize: '15px',
                                  fontWeight: 'bold',
                                  borderRadius: '6px',
                                  border: '2px solid #4a69bd',
                                  background: subAnswers[label] === '1' ? '#4a69bd' : '#fff',
                                  color: subAnswers[label] === '1' ? '#fff' : '#4a69bd',
                                  cursor: 'pointer'
                                }}
                              >
                                1 (正)
                              </button>
                              <button
                                onClick={() => handleSelectSub(label, '2')}
                                style={{
                                  padding: '8px 18px',
                                  fontSize: '15px',
                                  fontWeight: 'bold',
                                  borderRadius: '6px',
                                  border: '2px solid #e84118',
                                  background: subAnswers[label] === '2' ? '#e84118' : '#fff',
                                  color: subAnswers[label] === '2' ? '#fff' : '#e84118',
                                  cursor: 'pointer'
                                }}
                              >
                                2 (誤)
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={submitAnswer}
                        style={{ width: '100%', marginTop: '15px', padding: '14px', fontSize: '18px', border: 'none', borderRadius: '8px', background: '#e84118', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        解答を送信
                      </button>
                    </div>
                  ) : (
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
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                  {isCorrect ? (
                    <div>
                      <p style={{ color: '#44bd32', fontSize: '32px', fontWeight: 'bold', margin: 0 }}>⭕️ 大正解！！</p>
                      {isMarkedMistake && (
                        <button
                          onClick={() => toggleMistake(question.id)}
                          style={{ marginTop: '10px', background: '#e3f2fd', color: '#0d47a1', border: '1px solid #90caf9', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                        >
                          🎉 克服できたので復習リストから外す
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p style={{ color: '#e84118', fontSize: '32px', fontWeight: 'bold', margin: 0 }}>❌ 不正解...</p>
                      <div style={{ margin: '8px 0', fontSize: '13px', color: '#d63031', fontWeight: 'bold' }}>
                        🔖 復習リストに自動登録しました
                      </div>
                      <p style={{ fontSize: '18px', margin: '10px 0' }}>
                        あなたの解答: <b style={{ letterSpacing: '2px' }}>{userAnswer}</b><br />
                        正解は <b style={{ letterSpacing: '2px' }}>{question.answer.replace(/[^0-9]/g, '')}</b> です
                      </p>

                      {question.answer.replace(/[^0-9]/g, '').length >= 3 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '12px 0', flexWrap: 'wrap' }}>
                          {allLabels.slice(0, question.answer.replace(/[^0-9]/g, '').length).map((lbl, i) => {
                            const correctChar = question.answer.replace(/[^0-9]/g, '')[i];
                            const userChar = userAnswer[i] || '-';
                            const match = userChar === correctChar;
                            return (
                              <span key={lbl} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '13px', background: match ? '#e8f8f5' : '#fdedec', border: `1px solid ${match ? '#2ecc71' : '#e74c3c'}`, fontWeight: 'bold' }}>
                                {lbl}: {userChar} (正解 {correctChar}) {match ? '⭕️' : '❌'}
                              </span>
                            );
                          })}
                        </div>
                      )}
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

      {/* 2. 論文・論証カードタブ */}
      {activeTab === 'ronsho' && (
        <div>
          {/* 生成入力ボックス */}
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
                
                {/* 管理者のみ保存ボタンを表示 */}
                {isAdmin && (
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{ marginTop: '10px', background: '#e84118', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
                  >
                    {isSaving ? '保存中...' : 'データベースに保存する'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 論文カード フィルター＆検索バー */}
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '2px solid #4a69bd', marginBottom: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '1 1 200px' }}>
              <select
                value={selectedCardSubject}
                onChange={(e) => setSelectedCardSubject(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #4a69bd', fontSize: '14px', background: '#fff', color: '#2c3e50', fontWeight: 'bold', cursor: 'pointer' }}
              >
                <option value="ALL">📚 すべての科目</option>
                {cardSubjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: '2 1 260px' }}>
              <input
                type="text"
                value={cardSearchKeyword}
                onChange={(e) => setCardSearchKeyword(e.target.value)}
                placeholder="🔍 論点・条文・規範・当てはめを検索..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #b2bec3', fontSize: '14px', boxSizing: 'border-box' }}
              />
              {cardSearchKeyword && (
                <button
                  onClick={() => setCardSearchKeyword('')}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #b2bec3', background: '#f5f6fa', color: '#636e72', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                >
                  クリア
                </button>
              )}
            </div>
          </div>

          {/* カード一覧ヘッダー */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #4a69bd', paddingBottom: '6px', marginBottom: '15px' }}>
            <h3 style={{ color: '#2c3e50', margin: 0 }}>📚 蓄積された論証カード</h3>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#7f8fa6' }}>
              表示中: <span style={{ color: '#4a69bd', fontSize: '15px' }}>{filteredCards.length}</span> / 全 {cards.length} 件
            </span>
          </div>

          {filteredCards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: '10px', color: '#7f8fa6', fontWeight: 'bold' }}>
              条件に一致する論証カードが見つかりません。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {filteredCards.map((card) => {
                const raw = card.raw_data;
                const rawItem = Array.isArray(raw) ? raw[0] : (raw || {});
                
                const s = card.subject || rawItem.subject || rawItem.科目 || '未設定';
                const t = card.title || card.issue || rawItem.topic || rawItem.issue || rawItem.論点 || '（論点記載なし）';
                const a = card.article_num || rawItem.article_num || rawItem.条文 || '';
                const k = card.kihan || card.norm || rawItem.norm || rawItem.規範定立 || '（規範データなし）';
                const rawAt = card.atehame || card.criteria || rawItem.application_criteria || rawItem.当てはめ基準;
                const at = Array.isArray(rawAt) ? rawAt.join('\n') : (rawAt || '（当てはめ基準記載なし）');
                
                const isEditing = editingId === card.id;

                return (
                  <div key={card.id} style={{ background: '#fff', padding: '18px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #dcdde1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {isEditing ? (
                          <>
                            <input type="text" placeholder="科目" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #4a69bd', borderRadius: '4px', width: '80px' }} />
                            <input type="text" placeholder="条文番号" value={editArticleNum} onChange={(e) => setEditArticleNum(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #4a69bd', borderRadius: '4px', width: '100px' }} />
                          </>
                        ) : (
                          <>
                            <span style={{ background: '#4a69bd', color: '#fff', fontSize: '12px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>{s}</span>
                            {a && <span style={{ background: '#e3f2fd', color: '#0d47a1', fontSize: '12px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>{a}</span>}
                          </>
                        )}
                      </div>
                      
                      {/* 管理者のみ編集・削除ボタンを表示 */}
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {isEditing ? (
                            <>
                              <button onClick={() => handleUpdateCard(card.id)} style={{ background: '#44bd32', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>保存</button>
                              <button onClick={() => setEditingId(null)} style={{ background: '#7f8fa6', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>取消</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEditingCard(card, s, t, a, k, at)} style={{ background: '#fbc531', color: '#2c3e50', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>編集</button>
                              <button onClick={() => handleDeleteCard(card.id)} style={{ background: '#e84118', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>削除</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <input type="text" placeholder="論点・タイトル" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #4a69bd', borderRadius: '4px', marginBottom: '10px', boxSizing: 'border-box' }} />
                    ) : (
                      <h4 style={{ color: '#2c3e50', margin: '0 0 12px 0', fontSize: '17px' }}>論点: {t}</h4>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', border: '1px solid #e1e8ed' }}>
                        <strong style={{ display: 'block', fontSize: '12px', color: '#4a69bd', marginBottom: '5px' }}>【規範定立】</strong>
                        {isEditing ? (
                          <textarea value={editKihan} onChange={(e) => setEditKihan(e.target.value)} style={{ width: '100%', height: '80px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                        ) : (
                          <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: '1.5', color: '#333' }} dangerouslySetInnerHTML={{ __html: k }} />
                        )}
                      </div>
                      <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', border: '1px solid #e1e8ed' }}>
                        <strong style={{ display: 'block', fontSize: '12px', color: '#4a69bd', marginBottom: '5px' }}>【当てはめ基準】</strong>
                        {isEditing ? (
                          <textarea value={editAtehame} onChange={(e) => setEditAtehame(e.target.value)} style={{ width: '100%', height: '80px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                        ) : (
                          <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: '1.5', color: '#333' }} dangerouslySetInnerHTML={{ __html: at }} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 編集モーダル（管理者のみ） */}
      {isAdmin && editingQuestion && (
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

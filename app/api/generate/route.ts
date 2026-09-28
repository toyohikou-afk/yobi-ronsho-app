import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ==========================================
    // 1. 管理者パスワード照合処理（passcodeが送られてきた場合）
    // ==========================================
    if (body.passcode !== undefined) {
      const serverPassword = process.env.ADMIN_PASSWORD;

      if (!serverPassword) {
        return NextResponse.json(
          { success: false, error: 'VercelにADMIN_PASSWORDが設定されていません' },
          { status: 500 }
        );
      }

      if (body.passcode === serverPassword) {
        return NextResponse.json({ success: true });
      }

      return NextResponse.json({ success: false }, { status: 401 });
    }

    // ==========================================
    // 2. AI論証生成処理（promptが送られてきた場合）
    // ==========================================
    const { prompt } = body;
    const ollamaUrl = process.env.OLLAMA_URL || process.env.NEXT_PUBLIC_OLLAMA_URL || 'http://127.0.0.1:11434';
    console.log("Using Ollama URL:", ollamaUrl);

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'yobishiken-ai',
        prompt: prompt,
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let text = data.response.trim();
    
    if (text.startsWith('```json')) text = text.replace(/^```json\n?/, '');
    if (text.startsWith('```')) text = text.replace(/^```\n?/, '');
    text = text.replace(/\n?```$/, '');

    try {
      return NextResponse.json(JSON.parse(text));
    } catch (e) {
      return NextResponse.json({ _warning: "JSON解析失敗", raw_text: text });
    }
  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

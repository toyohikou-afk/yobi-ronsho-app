import { NextResponse } from 'next/server';

// ブラウザで直接URLを開いたときの動作確認用
export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'verify-admin API is active' });
}

// 管理者認証の照合処理
export async function POST(request: Request) {
  try {
    const { passcode } = await request.json();
    const serverPassword = process.env.ADMIN_PASSWORD;

    // VercelにADMIN_PASSWORDが未設定の場合
    if (!serverPassword) {
      return NextResponse.json(
        { success: false, error: 'ADMIN_PASSWORDが未設定です' },
        { status: 500 }
      );
    }

    // パスワード照合
    if (passcode === serverPassword) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ success: false, error: '通信解析エラー' }, { status: 400 });
  }
}

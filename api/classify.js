const { GoogleGenerativeAI } = require('@google/generative-ai');

// Gemini API設定
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyAyYD8RkEekz6xaSJLgAVHqPwmSGfqZEro');

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData, fileName, mimeType } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Geminiモデルを取得
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 分類用のプロンプト
    const prompt = `この画像・PDFファイルを分析し、会計資料として最も適切なカテゴリを判定してください。

選択肢: [請求書, 領収書, 契約書, 給与明細, 税務書類, 銀行取引明細, 会計帳簿, その他]

重要な判定ルール:
- ファイルの内容を詳しく分析してください
- 画像内のテキスト、レイアウト、表形式などを詳しく分析してください
- 最も適切なカテゴリを一つ選択してください
- 内容が判断できない場合や、どのカテゴリにも該当しない場合は「その他」を選択してください

回答形式: 以下のJSON形式で回答してください
{
  "category": "選択したカテゴリ名",
  "confidence": 0.95,
  "reason": "判定理由"
}`;

    // 画像データを準備
    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: mimeType || 'image/jpeg'
      }
    };

    // Gemini APIに送信
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // JSONレスポンスを解析
    let classificationResult;
    try {
      // JSON部分を抽出
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        classificationResult = JSON.parse(jsonMatch[0]);
      } else {
        // JSON形式でない場合はフォールバック
        const category = text.trim().replace(/[「」]/g, '');
        classificationResult = {
          category: category || 'その他',
          confidence: 0.8,
          reason: 'AI分析結果'
        };
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      classificationResult = {
        category: 'その他',
        confidence: 0.5,
        reason: '解析エラー'
      };
    }

    // ログ記録
    const logEntry = {
      timestamp: new Date().toISOString(),
      fileName: fileName,
      category: classificationResult.category,
      confidence: classificationResult.confidence,
      reason: classificationResult.reason
    };

    console.log('Classification result:', logEntry);

    res.status(200).json({
      success: true,
      result: classificationResult,
      log: logEntry
    });

  } catch (error) {
    console.error('Classification error:', error);
    res.status(500).json({
      success: false,
      error: '分類処理中にエラーが発生しました',
      details: error.message
    });
  }
}

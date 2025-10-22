// テスト用コールバックエンドポイント
module.exports = async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    const html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>テストコールバック</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: green; }
        </style>
      </head>
      <body>
        <h1>テストコールバック</h1>
        <p class="success">✅ コールバックエンドポイントが正常に動作しています！</p>
        <p>クエリパラメータ: ${JSON.stringify(req.query)}</p>
      </body>
      </html>
    `;
    res.status(200).send(html);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};

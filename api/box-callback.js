// Box認証コールバック
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
    const { code, state, error } = req.query;

    if (error) {
      // エラーページ
      const html = `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Box認証エラー</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: red; }
            .success { color: green; }
          </style>
        </head>
        <body>
          <h1>Box認証エラー</h1>
          <p class="error">認証に失敗しました: ${error}</p>
          <p>このウィンドウを閉じて、もう一度お試しください。</p>
        </body>
        </html>
      `;
      res.status(400).send(html);
      return;
    }

    if (code) {
      // 認証成功ページ
      const html = `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Box認証完了</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: green; }
            .code { background: #f0f0f0; padding: 10px; margin: 20px; border-radius: 5px; }
            button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
            button:hover { background: #0056b3; }
          </style>
        </head>
        <body>
          <h1>Box認証完了</h1>
          <p class="success">認証が完了しました！</p>
          <p>認証コード:</p>
          <div class="code" id="code">${code}</div>
          <button onclick="copyCode()">コードをコピー</button>
          <p>このウィンドウを閉じて、メインアプリケーションに戻ってください。</p>
          
          <script>
            function copyCode() {
              const code = document.getElementById('code').textContent;
              navigator.clipboard.writeText(code).then(() => {
                alert('認証コードをコピーしました！');
              });
            }
            
            // 親ウィンドウにメッセージを送信
            if (window.opener) {
              window.opener.postMessage({
                type: 'BOX_AUTH_SUCCESS',
                code: '${code}'
              }, '*');
            }
          </script>
        </body>
        </html>
      `;
      res.status(200).send(html);
    } else {
      // パラメータなし
      const html = `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Box認証</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          </style>
        </head>
        <body>
          <h1>Box認証</h1>
          <p>認証パラメータが見つかりません。</p>
        </body>
        </html>
      `;
      res.status(400).send(html);
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};

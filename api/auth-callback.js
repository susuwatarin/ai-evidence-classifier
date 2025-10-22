module.exports = async function handler(req, res) {
  // 認証コードを取得
  const { code, state } = req.query;
  
  console.log('認証コールバック受信:', { code, state });
  
  if (!code) {
    return res.status(400).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
          <h2 style="color: #f44336;">認証エラー</h2>
          <p>認証コードが取得できませんでした。</p>
          <p>URL: ${req.url}</p>
          <button onclick="window.close()" style="padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer;">閉じる</button>
        </body>
      </html>
    `);
  }
  
  // 親ウィンドウに認証コードを送信
  res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
        <h2 style="color: #4CAF50;">認証完了</h2>
        <p>認証コード: <strong>${code}</strong></p>
        <p>このコードをコピーして、元の画面のプロンプトに貼り付けてください。</p>
        <button onclick="navigator.clipboard.writeText('${code}')" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 10px;">コードをコピー</button>
        <button onclick="window.close()" style="padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 10px;">閉じる</button>
        <script>
          // 親ウィンドウに認証コードを送信
          if (window.opener) {
            window.opener.postMessage({
              type: 'BOX_AUTH_SUCCESS',
              code: '${code}'
            }, '*');
          }
          // 5秒後に自動で閉じる
          setTimeout(() => {
            window.close();
          }, 5000);
        </script>
      </body>
    </html>
  `);
};

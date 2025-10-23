// Box認証API
const axios = require('axios');

// Box API設定（プロトタイプ用）
const BOX_CLIENT_ID = 'hi1wa1jasaijl3z1d1n9id6hhv1t7ket';
const BOX_CLIENT_SECRET = 'p2z1jhKgtC15FJ2hnFT9aJL68YmumVCG';
const BOX_REDIRECT_URI = 'https://ai-evidence-classifier-61015202.vercel.app/api/box-callback';

module.exports = async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      // 認証URL生成
      const authUrl = `https://account.box.com/api/oauth2/authorize?` +
        `response_type=code&` +
        `client_id=${BOX_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(BOX_REDIRECT_URI)}&` +
        `state=box_auth_${Date.now()}`;

      res.status(200).json({
        success: true,
        authUrl: authUrl,
        message: 'Box認証URLを生成しました'
      });

    } else if (req.method === 'POST') {
      // 認証コードをアクセストークンに交換
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: '認証コードが必要です'
        });
      }

      // URLエンコードされたデータを作成
      const tokenData = new URLSearchParams();
      tokenData.append('grant_type', 'authorization_code');
      tokenData.append('code', code);
      tokenData.append('client_id', BOX_CLIENT_ID);
      tokenData.append('client_secret', BOX_CLIENT_SECRET);

      console.log('Box認証リクエスト:', {
        url: 'https://api.box.com/oauth2/token',
        data: tokenData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const tokenResponse = await axios.post('https://api.box.com/oauth2/token', tokenData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log('Box認証レスポンス:', tokenResponse.data);

      if (tokenResponse.data.access_token) {
        res.status(200).json({
          success: true,
          accessToken: tokenResponse.data.access_token,
          refreshToken: tokenResponse.data.refresh_token,
          expiresIn: tokenResponse.data.expires_in,
          message: 'Box認証が完了しました'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'アクセストークンの取得に失敗しました'
        });
      }

    } else {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
    }

  } catch (error) {
    console.error('Box認証エラー:', error);
    
    // より詳細なエラー情報を提供
    let errorMessage = 'Box認証でエラーが発生しました';
    if (error.response) {
      console.error('Box API レスポンスエラー:', error.response.data);
      errorMessage += `: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
    } else if (error.request) {
      console.error('Box API リクエストエラー:', error.request);
      errorMessage += ': リクエストが送信できませんでした';
    } else {
      errorMessage += `: ${error.message}`;
    }
    
    // デバッグ用の詳細情報を追加
    console.error('エラー詳細:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    });
    
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};

const axios = require('axios');

// Box API設定（プロトタイプ用 - 実際の値に置き換えてください）
const BOX_CLIENT_ID = process.env.BOX_CLIENT_ID || 'hi1wa1jasaijl3z1d1n9id6hhv1t7ket';
const BOX_CLIENT_SECRET = process.env.BOX_CLIENT_SECRET || 'p2z1jhKgtC15FJ2hnFT9aJL68YmumVCG';
const BOX_REDIRECT_URI = process.env.BOX_REDIRECT_URI || 'https://ai-evidence-classifier-61015202-73622n8rh-susuwatarins-projects.vercel.app/auth/callback';

module.exports = async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      // Box認証URL生成
      const authUrl = `https://account.box.com/api/oauth2/authorize?` +
        `response_type=code&` +
        `client_id=${BOX_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(BOX_REDIRECT_URI)}&` +
        `state=${Date.now()}`;

      res.status(200).json({
        success: true,
        authUrl: authUrl
      });

    } else if (req.method === 'POST') {
      // アクセストークン取得
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'Authorization code is required'
        });
      }

      const tokenResponse = await axios.post('https://api.box.com/oauth2/token', {
        grant_type: 'authorization_code',
        code: code,
        client_id: BOX_CLIENT_ID,
        client_secret: BOX_CLIENT_SECRET,
        redirect_uri: BOX_REDIRECT_URI
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      res.status(200).json({
        success: true,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in
      });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Box auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Box認証エラーが発生しました',
      details: error.message
    });
  }
};

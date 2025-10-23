// Boxフォルダ管理API
const axios = require('axios');

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
      // フォルダ一覧取得
      const { accessToken, folderId = '0' } = req.query;

      if (!accessToken) {
        return res.status(400).json({
          success: false,
          error: 'アクセストークンが必要です'
        });
      }

      // Box APIでフォルダ情報を取得
      const folderResponse = await axios.get(`https://api.box.com/2.0/folders/${folderId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          fields: 'id,name,type,parent,created_at,modified_at,size'
        }
      });

      // フォルダ内のアイテムを取得
      const itemsResponse = await axios.get(`https://api.box.com/2.0/folders/${folderId}/items`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          fields: 'id,name,type,parent,created_at,modified_at,size',
          limit: 1000
        }
      });

      // フォルダとファイルを分類
      const folders = itemsResponse.data.entries.filter(item => item.type === 'folder');
      const files = itemsResponse.data.entries.filter(item => item.type === 'file');

      res.status(200).json({
        success: true,
        folder: folderResponse.data,
        folders: folders,
        files: files,
        totalCount: itemsResponse.data.total_count
      });

    } else if (req.method === 'POST') {
      // フォルダ作成
      const { accessToken, parentId, folderName } = req.body;

      if (!accessToken || !parentId || !folderName) {
        return res.status(400).json({
          success: false,
          error: '必要なパラメータが不足しています'
        });
      }

      const createResponse = await axios.post('https://api.box.com/2.0/folders', {
        name: folderName,
        parent: {
          id: parentId
        }
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      res.status(200).json({
        success: true,
        folder: createResponse.data,
        message: 'フォルダが作成されました'
      });

    } else {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
    }

  } catch (error) {
    console.error('BoxフォルダAPIエラー:', error);
    
    let errorMessage = 'Boxフォルダ操作でエラーが発生しました';
    if (error.response) {
      console.error('Box API レスポンスエラー:', error.response.data);
      errorMessage += `: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
    } else if (error.request) {
      console.error('Box API リクエストエラー:', error.request);
      errorMessage += ': リクエストが送信できませんでした';
    } else {
      errorMessage += `: ${error.message}`;
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};

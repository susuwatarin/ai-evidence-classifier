const axios = require('axios');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'POST') {
        const { accessToken, parentFolderId } = req.body;

        if (!accessToken || !parentFolderId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Access token and parent folder ID are required' 
            });
        }

        try {
            // 親フォルダ内のアイテムを取得
            const itemsResponse = await axios.get(`https://api.box.com/2.0/folders/${parentFolderId}/items?fields=id,name,type,size`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const items = itemsResponse.data.entries;
            const existingFolders = items.filter(item => item.type === 'folder');
            const existingFolderNames = existingFolders.map(f => f.name);

            // 必須フォルダの定義
            const requiredFolders = ['未振分', 'その他', '【setting】'];
            const missingFolders = [];

            // 必須フォルダの存在確認
            for (const required of requiredFolders) {
                if (!existingFolderNames.includes(required)) {
                    missingFolders.push(required);
                }
            }

            // 振分先フォルダの取得（必須フォルダ以外）
            const destinationFolders = existingFolders.filter(folder => 
                !requiredFolders.includes(folder.name)
            );

            // 不足フォルダがある場合は作成
            const createdFolders = [];
            if (missingFolders.length > 0) {
                for (const folderName of missingFolders) {
                    try {
                        const createResponse = await axios.post(`https://api.box.com/2.0/folders`, {
                            name: folderName,
                            parent: {
                                id: parentFolderId
                            }
                        }, {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        createdFolders.push({
                            name: folderName,
                            id: createResponse.data.id
                        });
                    } catch (createError) {
                        console.error(`フォルダ作成エラー (${folderName}):`, createError.response?.data || createError.message);
                        // フォルダ作成に失敗しても処理を継続
                    }
                }
            }

            // 【setting】フォルダ内に追加プロンプトファイルを作成
            let additionalPromptCreated = false;
            if (missingFolders.includes('【setting】') || existingFolderNames.includes('【setting】')) {
                const settingFolder = createdFolders.find(f => f.name === '【setting】') || 
                                    existingFolders.find(f => f.name === '【setting】');
                
                if (settingFolder) {
                    try {
                        // 追加プロンプトファイルの内容
                        const promptContent = `// 追加プロンプト設定ファイル
//
// ## 使用方法：
// 1. 実際に使用する指示は、そのまま記述してください
// 2. 使用しない行は「//」でコメントアウトしてください
//
// ## 記述例：
// 「○○株式会社」からの書類は全て「重要書類」フォルダに分類してください。
// 金額が10万円以上の書類は「高額取引」フォルダを優先してください。
// 交通費関連の書類は「交通費」フォルダに分類してください。
`;

                        // ファイルをアップロード
                        const uploadResponse = await axios.post(`https://api.box.com/2.0/files/content`, 
                            `name=追加プロンプト.txt&parent_id=${settingFolder.id}`, 
                            {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/x-www-form-urlencoded'
                                }
                            }
                        );

                        additionalPromptCreated = true;
                    } catch (promptError) {
                        console.error('追加プロンプトファイル作成エラー:', promptError.response?.data || promptError.message);
                    }
                }
            }

            res.status(200).json({
                success: true,
                requiredFolders: requiredFolders,
                existingFolders: existingFolderNames,
                missingFolders: missingFolders,
                createdFolders: createdFolders,
                destinationFolders: destinationFolders.map(folder => ({
                    id: folder.id,
                    name: folder.name
                })),
                additionalPromptCreated: additionalPromptCreated,
                message: missingFolders.length > 0 ? 
                    `必須フォルダを作成しました: ${createdFolders.map(f => f.name).join(', ')}` :
                    '必須フォルダは既に存在します'
            });

        } catch (error) {
            console.error('必須フォルダチェックエラー:', error.response?.data || error.message);
            res.status(error.response?.status || 500).json({
                success: false,
                error: error.response?.data || error.message
            });
        }
    } else {
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
};

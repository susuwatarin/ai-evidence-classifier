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

            // 【setting】フォルダ内の構造を作成
            let settingStructureCreated = false;
            if (missingFolders.includes('【setting】') || existingFolderNames.includes('【setting】')) {
                const settingFolder = createdFolders.find(f => f.name === '【setting】') || 
                                    existingFolders.find(f => f.name === '【setting】');
                
                if (settingFolder) {
                    try {
                        // 【setting】フォルダ内のアイテムを取得
                        const settingItemsResponse = await axios.get(`https://api.box.com/2.0/folders/${settingFolder.id}/items?fields=id,name,type`, {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`
                            }
                        });

                        const settingItems = settingItemsResponse.data.entries;
                        const existingSettingFolders = settingItems.filter(item => item.type === 'folder');
                        const existingSettingFiles = settingItems.filter(item => item.type === 'file');
                        const existingSettingFolderNames = existingSettingFolders.map(f => f.name);

                        // 必要なサブフォルダを作成（logフォルダのみ）
                        const requiredSubFolders = ['log'];
                        const createdSubFolders = [];

                        for (const subFolderName of requiredSubFolders) {
                            if (!existingSettingFolderNames.includes(subFolderName)) {
                                try {
                                    const subFolderResponse = await axios.post(`https://api.box.com/2.0/folders`, {
                                        name: subFolderName,
                                        parent: {
                                            id: settingFolder.id
                                        }
                                    }, {
                                        headers: {
                                            'Authorization': `Bearer ${accessToken}`,
                                            'Content-Type': 'application/json'
                                        }
                                    });

                                    createdSubFolders.push({
                                        name: subFolderName,
                                        id: subFolderResponse.data.id
                                    });
                                } catch (subFolderError) {
                                    console.error(`サブフォルダ作成エラー (${subFolderName}):`, subFolderError.response?.data || subFolderError.message);
                                }
                            }
                        }

                        // 振分先フォルダごとのサンプルフォルダを作成
                        const sampleFoldersCreated = [];
                        for (const destFolder of destinationFolders) {
                            const sampleFolderName = `${destFolder.name}_samples`;
                            if (!existingSettingFolderNames.includes(sampleFolderName)) {
                                try {
                                    const sampleFolderResponse = await axios.post(`https://api.box.com/2.0/folders`, {
                                        name: sampleFolderName,
                                        parent: {
                                            id: settingFolder.id
                                        }
                                    }, {
                                        headers: {
                                            'Authorization': `Bearer ${accessToken}`,
                                            'Content-Type': 'application/json'
                                        }
                                    });

                                    sampleFoldersCreated.push({
                                        name: sampleFolderName,
                                        id: sampleFolderResponse.data.id,
                                        parentFolder: destFolder.name
                                    });
                                } catch (sampleError) {
                                    console.error(`サンプルフォルダ作成エラー (${sampleFolderName}):`, sampleError.response?.data || sampleError.message);
                                }
                            }
                        }

                        // 追加プロンプトファイルを作成
                        let additionalPromptCreated = false;
                        const existingPromptFile = existingSettingFiles.find(f => f.name === '追加プロンプト.txt');
                        if (!existingPromptFile) {
                            try {
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

                                // Box APIファイルアップロード（2段階アップロード）
                                // 1. アップロードセッションを作成
                                const sessionResponse = await axios.post(`https://upload.box.com/api/2.0/files/upload_sessions`, {
                                    folder_id: settingFolder.id,
                                    file_size: Buffer.byteLength(promptContent, 'utf8'),
                                    file_name: '追加プロンプト.txt'
                                }, {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json'
                                    }
                                });

                                const sessionId = sessionResponse.data.id;
                                const uploadUrl = sessionResponse.data.upload_urls.upload_url;

                                // 2. ファイルをアップロード
                                const uploadResponse = await axios.put(uploadUrl, promptContent, {
                                    headers: {
                                        'Content-Type': 'text/plain'
                                    }
                                });

                                // 3. アップロードセッションをコミット
                                const commitResponse = await axios.post(`https://upload.box.com/api/2.0/files/upload_sessions/${sessionId}/commit`, {
                                    attributes: {
                                        name: '追加プロンプト.txt',
                                        parent: {
                                            id: settingFolder.id
                                        }
                                    }
                                }, {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json'
                                    }
                                });

                                additionalPromptCreated = true;
                            } catch (promptError) {
                                console.error('追加プロンプトファイル作成エラー:', promptError.response?.data || promptError.message);
                            }
                        } else {
                            additionalPromptCreated = true; // 既に存在する場合
                        }

                        settingStructureCreated = true;

                    } catch (structureError) {
                        console.error('【setting】フォルダ構造作成エラー:', structureError.response?.data || structureError.message);
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
                settingStructureCreated: settingStructureCreated,
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

const axios = require('axios');
const FormData = require('form-data');

// Google Gemini API設定
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyC...'; // 実際のAPIキーに置き換え
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
            console.log('振分処理開始:', { parentFolderId });

            // 1. 親フォルダ内の構造を取得
            const folderStructure = await getFolderStructure(accessToken, parentFolderId);
            console.log('フォルダ構造取得完了:', folderStructure);

            // 2. 未振分フォルダからファイルを取得
            const unsortedFiles = await getUnsortedFiles(accessToken, folderStructure.unsortedFolderId);
            console.log('未振分ファイル取得完了:', unsortedFiles.length, '件');

            if (unsortedFiles.length === 0) {
                return res.status(200).json({
                    success: true,
                    message: '未振分フォルダにファイルがありません',
                    processedFiles: 0,
                    results: []
                });
            }

            // 3. 追加プロンプトを取得
            const additionalPrompt = await getAdditionalPrompt(accessToken, folderStructure.settingFolderId);
            console.log('追加プロンプト取得完了:', additionalPrompt ? 'あり' : 'なし');

            // 4. 各ファイルをAI分析して分類
            const results = [];
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < unsortedFiles.length; i++) {
                const file = unsortedFiles[i];
                console.log(`ファイル処理中 (${i + 1}/${unsortedFiles.length}):`, file.name);

                try {
                    const classification = await classifyFile(accessToken, file, folderStructure.destinationFolders, additionalPrompt);
                    
                    if (classification.success) {
                        // ファイルを移動
                        await moveFile(accessToken, file.id, classification.targetFolderId);
                        successCount++;
                        
                        results.push({
                            fileName: file.name,
                            originalFolder: '未振分',
                            targetFolder: classification.targetFolderName,
                            classification: classification.category,
                            reasoning: classification.reasoning,
                            status: 'success',
                            confidence: classification.confidence
                        });
                    } else {
                        errorCount++;
                        results.push({
                            fileName: file.name,
                            originalFolder: '未振分',
                            targetFolder: 'その他',
                            classification: '分類失敗',
                            reasoning: classification.error || 'AI分析に失敗しました',
                            status: 'error',
                            error: classification.error
                        });
                    }
                } catch (error) {
                    console.error('ファイル処理エラー:', file.name, error.message);
                    errorCount++;
                    results.push({
                        fileName: file.name,
                        originalFolder: '未振分',
                        targetFolder: 'その他',
                        classification: 'エラー',
                        reasoning: `処理エラー: ${error.message}`,
                        status: 'error',
                        error: error.message
                    });
                }
            }

            // 5. ログファイルを生成
            await createLogFile(accessToken, folderStructure.settingFolderId, results);

            console.log('振分処理完了:', { successCount, errorCount, totalFiles: unsortedFiles.length });

            res.status(200).json({
                success: true,
                message: `振分処理が完了しました。成功: ${successCount}件, エラー: ${errorCount}件`,
                processedFiles: unsortedFiles.length,
                successCount,
                errorCount,
                results
            });

        } catch (error) {
            console.error('振分処理エラー:', error);
            res.status(500).json({
                success: false,
                error: '振分処理でエラーが発生しました: ' + error.message
            });
        }
    } else {
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
};

// フォルダ構造を取得
async function getFolderStructure(accessToken, parentFolderId) {
    const response = await axios.get(`https://api.box.com/2.0/folders/${parentFolderId}/items?fields=id,name,type`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const folders = response.data.entries.filter(item => item.type === 'folder');
    
    const unsortedFolder = folders.find(f => f.name === '未振分');
    const settingFolder = folders.find(f => f.name === '【setting】');
    const otherFolder = folders.find(f => f.name === 'その他');
    
    const destinationFolders = folders.filter(f => 
        !['未振分', '【setting】', 'その他'].includes(f.name)
    );

    if (!unsortedFolder) {
        throw new Error('未振分フォルダが見つかりません');
    }

    return {
        unsortedFolderId: unsortedFolder.id,
        settingFolderId: settingFolder?.id,
        otherFolderId: otherFolder?.id,
        destinationFolders: destinationFolders
    };
}

// 未振分フォルダからファイルを取得
async function getUnsortedFiles(accessToken, unsortedFolderId) {
    const response = await axios.get(`https://api.box.com/2.0/folders/${unsortedFolderId}/items?fields=id,name,type,size`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    return response.data.entries.filter(item => 
        item.type === 'file' && 
        ['png', 'jpg', 'jpeg', 'gif', 'pdf'].some(ext => 
            item.name.toLowerCase().endsWith('.' + ext)
        )
    );
}

// 追加プロンプトを取得
async function getAdditionalPrompt(accessToken, settingFolderId) {
    if (!settingFolderId) return null;

    try {
        const response = await axios.get(`https://api.box.com/2.0/folders/${settingFolderId}/items?fields=id,name,type`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const promptFile = response.data.entries.find(item => 
            item.type === 'file' && 
            ['追加プロンプト.txt', '追加プロンプト', 'additional_prompt.txt', 'additional_prompt'].includes(item.name)
        );

        if (!promptFile) return null;

        // ファイル内容を取得
        const fileResponse = await axios.get(`https://api.box.com/2.0/files/${promptFile.id}/content`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const content = fileResponse.data;
        const lines = content.split('\n');
        
        // コメントアウトされていない行を抽出
        const validLines = lines.filter(line => 
            line.trim() && !line.trim().startsWith('//')
        );

        return validLines.join('\n');
    } catch (error) {
        console.error('追加プロンプト取得エラー:', error.message);
        return null;
    }
}

// ファイルをAI分析して分類
async function classifyFile(accessToken, file, destinationFolders, additionalPrompt) {
    try {
        // ファイル内容を取得（Base64エンコード）
        const fileContent = await getFileContent(accessToken, file.id);
        
        // 分類用プロンプトを構築
        const prompt = buildClassificationPrompt(file.name, destinationFolders, additionalPrompt);
        
        // Gemini APIに送信
        const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: getMimeType(file.name),
                            data: fileContent
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1000
            }
        });

        const result = response.data.candidates[0].content.parts[0].text;
        console.log('AI分析結果:', result);

        // 結果をパース
        return parseClassificationResult(result, destinationFolders);

    } catch (error) {
        console.error('AI分析エラー:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ファイル内容を取得
async function getFileContent(accessToken, fileId) {
    const response = await axios.get(`https://api.box.com/2.0/files/${fileId}/content`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        responseType: 'arraybuffer'
    });
    
    return Buffer.from(response.data).toString('base64');
}

// 分類用プロンプトを構築
function buildClassificationPrompt(fileName, destinationFolders, additionalPrompt) {
    const folderNames = destinationFolders.map(f => f.name).join('、');
    
    let prompt = `以下の会計資料を分析し、適切なフォルダに分類してください。

ファイル名: ${fileName}
利用可能なフォルダ: ${folderNames}、その他

分類ルール:
1. 請求書、領収書、契約書、給与明細、税務書類、銀行取引明細などの会計資料を適切に分類
2. 明確に分類できない場合は「その他」を選択
3. 最も適切なフォルダ名を1つだけ回答してください

`;

    if (additionalPrompt) {
        prompt += `追加の分類ルール:\n${additionalPrompt}\n\n`;
    }

    prompt += `回答形式:
1. 分類結果: [フォルダ名]
2. 分類理由: [なぜそのフォルダに分類したかの具体的な理由を簡潔に説明]

例:
分類結果: 請求書
分類理由: 文書に「請求書」の文字が明記されており、請求金額と支払期限が記載されているため`;

    return prompt;
}

// 分類結果をパース
function parseClassificationResult(result, destinationFolders) {
    console.log('AI分析結果（パース前）:', result);
    
    // 分類結果と理由を抽出
    const classificationMatch = result.match(/分類結果:\s*(.+)/i);
    const reasoningMatch = result.match(/分類理由:\s*(.+)/i);
    
    const classification = classificationMatch ? classificationMatch[1].trim() : result.trim();
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '理由が取得できませんでした';
    
    console.log('抽出された分類:', classification);
    console.log('抽出された理由:', reasoning);
    
    // 利用可能なフォルダと照合
    const targetFolder = destinationFolders.find(f => 
        f.name === classification || 
        f.name.includes(classification) || 
        classification.includes(f.name)
    );

    if (targetFolder) {
        return {
            success: true,
            targetFolderId: targetFolder.id,
            targetFolderName: targetFolder.name,
            category: classification,
            reasoning: reasoning,
            confidence: 0.8
        };
    } else {
        return {
            success: true,
            targetFolderId: null, // その他フォルダに移動
            targetFolderName: 'その他',
            category: classification,
            reasoning: reasoning,
            confidence: 0.3
        };
    }
}

// ファイルを移動
async function moveFile(accessToken, fileId, targetFolderId) {
    if (!targetFolderId) return; // その他フォルダの場合は移動しない

    await axios.put(`https://api.box.com/2.0/files/${fileId}`, {
        parent: { id: targetFolderId }
    }, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
}

// ログファイルを生成
async function createLogFile(accessToken, settingFolderId, results) {
    if (!settingFolderId) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const csvContent = generateCSVLog(results, timestamp);
    
    // logフォルダを取得
    const logFolderResponse = await axios.get(`https://api.box.com/2.0/folders/${settingFolderId}/items?fields=id,name,type`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const logFolder = logFolderResponse.data.entries.find(item => 
        item.type === 'folder' && item.name === 'log'
    );
    
    if (!logFolder) return;

    // CSVファイルをアップロード
    const form = new FormData();
    const attributes = {
        name: `process_log_${timestamp}.csv`,
        parent: { id: logFolder.id }
    };
    form.append('attributes', JSON.stringify(attributes));
    form.append('file', Buffer.from(csvContent, 'utf8'), {
        filename: `process_log_${timestamp}.csv`,
        contentType: 'text/csv; charset=utf-8'
    });

    await axios.post('https://upload.box.com/api/2.0/files/content', form, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...form.getHeaders()
        }
    });
}

// CSVログを生成
function generateCSVLog(results, timestamp) {
    const headers = ['処理日時', 'ファイル名', '元フォルダ', '振分先フォルダ', '分類結果', '分類理由', 'ステータス', 'エラー内容'];
    const rows = results.map(result => [
        timestamp,
        result.fileName,
        result.originalFolder,
        result.targetFolder,
        result.classification,
        result.reasoning || '',
        result.status,
        result.error || ''
    ]);
    
    return [headers, ...rows].map(row => 
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
}

// MIMEタイプを取得
function getMimeType(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    const mimeTypes = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'pdf': 'application/pdf'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

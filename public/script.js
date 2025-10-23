// グローバル変数
let selectedFiles = [];
let classificationResults = [];
let isProcessing = false;
let processingStats = {
    total: 0,
    completed: 0,
    success: 0,
    error: 0
};

// Box連携変数
let boxAccessToken = null;
let boxRefreshToken = null;
let boxTokenExpiry = null;
let currentFolderId = null;


// DOM要素の取得
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const selectedFilesDiv = document.getElementById('selectedFiles');
const fileList = document.getElementById('fileList');
const classifyBtn = document.getElementById('classifyBtn');
const progressArea = document.getElementById('progressArea');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultsArea = document.getElementById('resultsArea');
const resultsList = document.getElementById('resultsList');
const downloadBtn = document.getElementById('downloadBtn');

// ページ読み込み時にトークン情報を復元
function restoreBoxAuth() {
    const storedToken = localStorage.getItem('boxAccessToken');
    const storedRefreshToken = localStorage.getItem('boxRefreshToken');
    const storedExpiry = localStorage.getItem('boxTokenExpiry');
    
    if (storedToken && storedRefreshToken && storedExpiry) {
        boxAccessToken = storedToken;
        boxRefreshToken = storedRefreshToken;
        boxTokenExpiry = parseInt(storedExpiry);
        
        // トークンが有効かチェック
        if (Date.now() < boxTokenExpiry) {
            updateAuthStatus(true);
        } else {
            // 期限切れの場合はクリア
            clearBoxAuth();
        }
    }
}

// 認証情報をクリア
function clearBoxAuth() {
    boxAccessToken = null;
    boxRefreshToken = null;
    boxTokenExpiry = null;
    localStorage.removeItem('boxAccessToken');
    localStorage.removeItem('boxRefreshToken');
    localStorage.removeItem('boxTokenExpiry');
    
    // 親フォルダ詳細情報エリアを非表示
    const detailsArea = document.getElementById('parentFolderDetails');
    if (detailsArea) {
        detailsArea.style.display = 'none';
    }
    
    updateAuthStatus(false);
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    restoreBoxAuth(); // ページ読み込み時に認証状態を復元
});

function setupEventListeners() {
    // ドラッグ&ドロップイベント
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    // ファイル選択イベント
    fileInput.addEventListener('change', handleFileSelect);
    
    // クリックイベント
    uploadArea.addEventListener('click', () => fileInput.click());
}

// ドラッグオーバー処理
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

// ドラッグリーブ処理
function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

// ドロップ処理
function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
}

// ファイル選択処理
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
}

// ファイル追加処理
function addFiles(files) {
    const validFiles = files.filter(file => {
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'application/pdf'];
        return validTypes.includes(file.type) || 
               file.name.toLowerCase().match(/\.(png|jpg|jpeg|gif|pdf)$/);
    });
    
    if (validFiles.length === 0) {
        alert('対応していないファイル形式です。PNG、JPG、JPEG、GIF、PDFファイルを選択してください。');
        return;
    }
    
    selectedFiles = [...selectedFiles, ...validFiles];
    updateFileList();
    showSelectedFiles();
}

// ファイルリスト更新
function updateFileList() {
    fileList.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item fade-in';
        fileItem.innerHTML = `
            <div class="file-icon">${getFileIcon(file.type)}</div>
            <div class="file-details">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
            <button class="remove-btn" onclick="removeFile(${index})">×</button>
        `;
        fileList.appendChild(fileItem);
    });
}

// ファイルアイコン取得
function getFileIcon(type) {
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📄';
    return '📁';
}

// ファイルサイズフォーマット
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ファイル削除
function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
    
    if (selectedFiles.length === 0) {
        hideSelectedFiles();
    }
}

// 選択されたファイル表示
function showSelectedFiles() {
    selectedFilesDiv.style.display = 'block';
    selectedFilesDiv.classList.add('fade-in');
}

// 選択されたファイル非表示
function hideSelectedFiles() {
    selectedFilesDiv.style.display = 'none';
}

// 分類開始
async function startClassification() {
    if (selectedFiles.length === 0) {
        alert('ファイルを選択してください。');
        return;
    }
    
    if (isProcessing) {
        alert('処理中です。完了までお待ちください。');
        return;
    }
    
    isProcessing = true;
    classifyBtn.disabled = true;
    showProgress();
    classificationResults = [];
    
    // 統計情報をリセット
    processingStats = {
        total: selectedFiles.length,
        completed: 0,
        success: 0,
        error: 0
    };
    
    try {
        // 並列処理の設定
        const maxConcurrent = Math.min(3, selectedFiles.length); // 最大3つまで並列処理
        const batches = [];
        
        // ファイルをバッチに分割
        for (let i = 0; i < selectedFiles.length; i += maxConcurrent) {
            batches.push(selectedFiles.slice(i, i + maxConcurrent));
        }
        
        // バッチごとに処理
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            
            // バッチ内のファイルを並列処理
            const batchPromises = batch.map(file => processFile(file));
            await Promise.all(batchPromises);
            
            // バッチ間の待機（API制限対策）
            if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        updateProgress(processingStats.completed, processingStats.total, '完了！');
        showResults();
        
    } catch (error) {
        console.error('Classification error:', error);
        alert('分類処理中にエラーが発生しました: ' + error.message);
        hideProgress();
    } finally {
        isProcessing = false;
        classifyBtn.disabled = false;
    }
}

// 個別ファイル処理
async function processFile(file) {
    try {
        updateProgress(processingStats.completed, processingStats.total, 
            `処理中: ${file.name} (${processingStats.completed + 1}/${processingStats.total})`);
        
        const result = await classifyFile(file);
        classificationResults.push(result);
        
        processingStats.completed++;
        processingStats.success++;
        
        updateProgress(processingStats.completed, processingStats.total, 
            `完了: ${file.name} (${processingStats.completed}/${processingStats.total})`);
        
    } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        
        // エラーでも結果に追加
        classificationResults.push({
            fileName: file.name,
            category: 'その他',
            confidence: 0,
            reason: '処理エラー: ' + error.message,
            timestamp: new Date().toISOString(),
            status: 'error'
        });
        
        processingStats.completed++;
        processingStats.error++;
        
        updateProgress(processingStats.completed, processingStats.total, 
            `エラー: ${file.name} (${processingStats.completed}/${processingStats.total})`);
    }
}

// ファイル分類
async function classifyFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            try {
                const base64 = e.target.result.split(',')[1];
                const mimeType = file.type;
                
                const response = await fetch('/api/classify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        imageData: base64,
                        fileName: file.name,
                        mimeType: mimeType
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.success) {
                    resolve({
                        fileName: file.name,
                        category: data.result.category,
                        confidence: data.result.confidence,
                        reason: data.result.reason,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    throw new Error(data.error || 'Unknown error');
                }
                
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
    });
}

// 進捗表示
function showProgress() {
    progressArea.style.display = 'block';
    progressArea.classList.add('fade-in');
    document.getElementById('progressStats').style.display = 'flex';
}

// 進捗更新
function updateProgress(current, total, text) {
    const percentage = (current / total) * 100;
    progressFill.style.width = percentage + '%';
    progressText.textContent = text;
    
    // 統計情報を更新
    document.getElementById('completedCount').textContent = current;
    document.getElementById('successCount').textContent = processingStats.success;
    document.getElementById('errorCount').textContent = processingStats.error;
}

// 進捗非表示
function hideProgress() {
    progressArea.style.display = 'none';
    document.getElementById('progressStats').style.display = 'none';
}

// 結果表示
function showResults() {
    resultsList.innerHTML = '';
    
    // 処理結果のサマリーを表示
    const summaryItem = document.createElement('div');
    summaryItem.className = 'result-summary';
    summaryItem.innerHTML = `
        <h4>処理結果サマリー</h4>
        <div class="summary-stats">
            <span class="summary-item">総ファイル数: ${processingStats.total}</span>
            <span class="summary-item success">成功: ${processingStats.success}</span>
            <span class="summary-item error">エラー: ${processingStats.error}</span>
            <span class="summary-item">成功率: ${((processingStats.success / processingStats.total) * 100).toFixed(1)}%</span>
        </div>
    `;
    resultsList.appendChild(summaryItem);
    
    classificationResults.forEach((result, index) => {
        const resultItem = document.createElement('div');
        resultItem.className = `result-item fade-in ${result.status === 'error' ? 'error' : ''}`;
        resultItem.innerHTML = `
            <div class="result-icon">${getCategoryIcon(result.category)}</div>
            <div class="result-details">
                <div class="result-file-name">${result.fileName}</div>
                <div class="result-category">${result.category}</div>
                <div class="result-confidence">信頼度: ${(result.confidence * 100).toFixed(1)}%</div>
                <div class="result-reason">${result.reason}</div>
                ${result.status === 'error' ? '<div class="error-badge">エラー</div>' : ''}
            </div>
        `;
        resultsList.appendChild(resultItem);
    });
    
    resultsArea.style.display = 'block';
    resultsArea.classList.add('fade-in');
    hideProgress();
    classifyBtn.disabled = false;
}

// カテゴリアイコン取得
function getCategoryIcon(category) {
    const icons = {
        '請求書': '🧾',
        '領収書': '🧾',
        '契約書': '📋',
        '給与明細': '💰',
        '税務書類': '📊',
        '銀行取引明細': '🏦',
        '会計帳簿': '📚',
        'その他': '📄'
    };
    return icons[category] || '📄';
}

// 結果ダウンロード
function downloadResults() {
    if (classificationResults.length === 0) {
        alert('ダウンロードする結果がありません。');
        return;
    }
    
    // CSVデータ作成
    const csvHeader = 'ファイル名,分類結果,信頼度,判定理由,処理日時\n';
    const csvData = classificationResults.map(result => {
        return [
            `"${result.fileName}"`,
            `"${result.category}"`,
            `"${(result.confidence * 100).toFixed(1)}%"`,
            `"${result.reason}"`,
            `"${result.timestamp}"`
        ].join(',');
    }).join('\n');
    
    const csvContent = csvHeader + csvData;
    
    // ファイルダウンロード
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `classification_results_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// アプリリセット
function resetApp() {
    selectedFiles = [];
    classificationResults = [];
    fileInput.value = '';
    hideSelectedFiles();
    hideProgress();
    resultsArea.style.display = 'none';
    classifyBtn.disabled = false;
}

// ==================== Box認証機能 ====================

// Box認証開始
async function authenticateBox() {
    try {
        // 認証URLを取得
        const response = await fetch('/api/box-auth', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`認証URL取得に失敗: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.authUrl) {
            // 新しいウィンドウでBox認証を開く
            const authWindow = window.open(
                data.authUrl,
                'boxAuth',
                'width=600,height=700,scrollbars=yes,resizable=yes'
            );
            
            if (!authWindow) {
                alert('ポップアップがブロックされました。ポップアップを許可してください。');
                return;
            }
            
            // 認証完了を監視
            let authCompleted = false;
            
            const handleMessage = (event) => {
                if (event.data && event.data.type === 'BOX_AUTH_SUCCESS' && !authCompleted) {
                    authCompleted = true;
                    completeBoxAuth(event.data.code);
                    window.removeEventListener('message', handleMessage);
                }
            };
            window.addEventListener('message', handleMessage);
            
            // ウィンドウが閉じられた場合の処理
            const checkAuth = setInterval(() => {
                if (authWindow.closed && !authCompleted) {
                    clearInterval(checkAuth);
                    window.removeEventListener('message', handleMessage);
                    showMessage('認証がキャンセルされました', 'warning');
                }
            }, 1000);
            
        } else {
            throw new Error('認証URLが取得できませんでした');
        }
        
    } catch (error) {
        showMessage('Box認証に失敗しました: ' + error.message, 'error');
    }
}

// Box認証完了処理
async function completeBoxAuth(code) {
    try {
        if (!code || typeof code !== 'string' || code.trim().length === 0) {
            throw new Error('認証コードが無効です');
        }
        
        if (boxAccessToken) {
            return;
        }
        
        const response = await fetch('/api/box-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code: code })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`トークン取得に失敗: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.accessToken) {
            boxAccessToken = data.accessToken;
            boxRefreshToken = data.refreshToken;
            boxTokenExpiry = Date.now() + (data.expiresIn * 1000);
            
            // トークン情報をローカルストレージに保存
            localStorage.setItem('boxAccessToken', data.accessToken);
            localStorage.setItem('boxRefreshToken', data.refreshToken);
            localStorage.setItem('boxTokenExpiry', boxTokenExpiry.toString());
            
            updateAuthStatus(true);
            showMessage('Box認証が完了しました！', 'success');
        } else {
            throw new Error(data.error || 'アクセストークンが取得できませんでした');
        }
        
    } catch (error) {
        showMessage('認証完了に失敗しました: ' + error.message, 'error');
    }
}

// メッセージ表示機能
function showMessage(message, type = 'info') {
    // 既存のメッセージエリアを取得または作成
    let messageArea = document.getElementById('messageArea');
    if (!messageArea) {
        messageArea = document.createElement('div');
        messageArea.id = 'messageArea';
        messageArea.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(messageArea);
    }
    
    // メッセージタイプに応じてスタイルを設定
    const styles = {
        success: 'background-color: #4CAF50;',
        error: 'background-color: #f44336;',
        warning: 'background-color: #ff9800;',
        info: 'background-color: #2196F3;'
    };
    
    messageArea.textContent = message;
    messageArea.style.cssText += styles[type] || styles.info;
    
    // 3秒後に自動で非表示
    setTimeout(() => {
        if (messageArea && messageArea.parentNode) {
            messageArea.parentNode.removeChild(messageArea);
        }
    }, 3000);
}

// トークン更新機能
async function refreshBoxToken() {
    try {
        if (!boxRefreshToken) {
            throw new Error('リフレッシュトークンがありません');
        }

        const response = await fetch('/api/box-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                refreshToken: boxRefreshToken,
                action: 'refresh'
            })
        });

        if (!response.ok) {
            throw new Error('トークン更新に失敗しました');
        }

        const data = await response.json();
        
        if (data.success && data.accessToken) {
            boxAccessToken = data.accessToken;
            boxRefreshToken = data.refreshToken || boxRefreshToken;
            boxTokenExpiry = Date.now() + (data.expiresIn * 1000);
            
            // ローカルストレージも更新
            localStorage.setItem('boxAccessToken', data.accessToken);
            localStorage.setItem('boxRefreshToken', boxRefreshToken);
            localStorage.setItem('boxTokenExpiry', boxTokenExpiry.toString());
            
            return true;
        } else {
            throw new Error(data.error || 'トークン更新に失敗しました');
        }
    } catch (error) {
        console.error('トークン更新エラー:', error);
        return false;
    }
}

// 有効なアクセストークンを取得（必要に応じて更新）
async function getValidBoxToken() {
    if (!boxAccessToken) {
        return null;
    }

    // トークンの有効期限をチェック（5分前から更新）
    if (boxTokenExpiry && Date.now() >= (boxTokenExpiry - 5 * 60 * 1000)) {
        const refreshed = await refreshBoxToken();
        if (!refreshed) {
            // 更新に失敗した場合は再認証が必要
            boxAccessToken = null;
            boxRefreshToken = null;
            boxTokenExpiry = null;
            updateAuthStatus(false);
            showMessage('認証の有効期限が切れました。再認証してください。', 'warning');
            return null;
        }
    }

    return boxAccessToken;
}

// 認証状態の更新
function updateAuthStatus(isAuthenticated) {
    const authStatus = document.getElementById('authStatus');
    const folderSection = document.getElementById('folderSection');
    
    if (isAuthenticated) {
        authStatus.innerHTML = `
            <p style="color: green;">✅ Box認証済み</p>
            <button onclick="logoutBox()">ログアウト</button>
        `;
        folderSection.style.display = 'block';
        
        // フォルダブラウザを表示
        const folderBrowser = document.getElementById('folderBrowser');
        if (folderBrowser) {
            folderBrowser.style.display = 'block';
        }
    } else {
        authStatus.innerHTML = `
            <p>Boxにログインしてください</p>
            <button class="auth-btn" onclick="authenticateBox()">🔐 Boxにログイン</button>
        `;
        folderSection.style.display = 'none';
        
        // フォルダブラウザを非表示
        const folderBrowser = document.getElementById('folderBrowser');
        if (folderBrowser) {
            folderBrowser.style.display = 'none';
        }
    }
}

// Boxログアウト
function logoutBox() {
    clearBoxAuth();
    currentFolderId = null;
    showMessage('Boxからログアウトしました', 'info');
}

// フォルダ一覧取得
async function getBoxFolders(folderId = '0') {
    try {
        const accessToken = await getValidBoxToken();
        if (!accessToken) {
            showMessage('Box認証が必要です', 'error');
            return null;
        }

        const response = await fetch(`/api/box-folders?accessToken=${accessToken}&folderId=${folderId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`フォルダ取得に失敗: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success) {
            return data;
        } else {
            throw new Error(data.error || 'フォルダ情報の取得に失敗しました');
        }
    } catch (error) {
        showMessage('フォルダ取得エラー: ' + error.message, 'error');
        return null;
    }
}

// フォルダ一覧を表示（Windowsエクスプローラー風）
async function displayBoxFolders(folderId = '0', parentPath = '') {
    // ルートフォルダの場合は履歴をリセット
    if (folderId === '0') {
        navigationHistory = [];
    }
    
    const folderData = await getBoxFolders(folderId);
    if (!folderData) return;

    // 現在のパスを更新
    const currentPath = parentPath ? `${parentPath} > ${folderData.folder.name}` : folderData.folder.name;
    
    // フォルダ情報を表示
    const folderInfo = document.getElementById('folderInfo');
    if (folderInfo) {
        folderInfo.innerHTML = `
            <h5>現在のフォルダ: ${folderData.folder.name}</h5>
            <p>パス: ${currentPath}</p>
            <p>フォルダ数: ${folderData.folders.length} | ファイル数: ${folderData.files.length}</p>
        `;
    }

    // フォルダツリーを表示
    const folderList = document.getElementById('folderList');
    if (folderList) {
        folderList.innerHTML = '';
        
        // パンくずリストを追加
        if (navigationHistory.length > 0) {
            const breadcrumb = document.createElement('div');
            breadcrumb.className = 'breadcrumb';
            
            let breadcrumbHTML = `<span onclick="displayBoxFolders('0')">🏠 ルート</span>`;
            
            navigationHistory.forEach((folder, index) => {
                breadcrumbHTML += `<span onclick="navigateToBreadcrumb(${index})"> > ${folder.name}</span>`;
            });
            
            breadcrumb.innerHTML = breadcrumbHTML;
            folderList.appendChild(breadcrumb);
        }
        
        // フォルダ一覧を表示
        folderData.folders.forEach(folder => {
            const folderItem = document.createElement('div');
            folderItem.className = 'folder-item';
            folderItem.innerHTML = `
                <div class="folder-name" onclick="navigateToFolder('${folder.id}', '${currentPath}')">
                    📁 ${folder.name}
                </div>
                <div class="folder-actions">
                    <button onclick="setAsParentFolder('${folder.id}', '${folder.name}')">親フォルダに設定</button>
                </div>
            `;
            folderList.appendChild(folderItem);
        });
        
        // ファイル一覧も表示（折りたたみ可能）
        if (folderData.files.length > 0) {
            const filesHeader = document.createElement('div');
            filesHeader.className = 'files-header';
            filesHeader.innerHTML = `
                <div class="files-toggle" onclick="toggleFiles()">
                    📄 ファイル (${folderData.files.length}個) <span id="filesToggle">▲</span>
                </div>
            `;
            folderList.appendChild(filesHeader);
            
            const filesList = document.createElement('div');
            filesList.id = 'filesList';
            filesList.className = 'files-list';
            filesList.style.display = 'block'; // 初期表示をブロックに変更
            
            folderData.files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.innerHTML = `
                    <div class="file-name">
                        📄 ${file.name}
                    </div>
                    <div class="file-size">
                        ${formatFileSize(file.size)}
                    </div>
                `;
                filesList.appendChild(fileItem);
            });
            
            folderList.appendChild(filesList);
        }
    }
}

// フォルダに移動
async function navigateToFolder(folderId, parentPath = '') {
    // ナビゲーション履歴を更新
    const folderData = await getBoxFolders(folderId);
    if (folderData) {
        updateNavigationHistory(folderId, folderData.folder.name, parentPath);
    }
    
    await displayBoxFolders(folderId, parentPath);
}

// ファイルサイズをフォーマット
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ファイル一覧の表示/非表示を切り替え
function toggleFiles() {
    const filesList = document.getElementById('filesList');
    const filesToggle = document.getElementById('filesToggle');
    
    if (filesList && filesToggle) {
        if (filesList.style.display === 'none') {
            filesList.style.display = 'block';
            filesToggle.textContent = '▲';
        } else {
            filesList.style.display = 'none';
            filesToggle.textContent = '▼';
        }
    }
}

// パンくずリストのナビゲーション
let navigationHistory = [];

function navigateToBreadcrumb(index) {
    if (index < navigationHistory.length) {
        const targetFolder = navigationHistory[index];
        navigationHistory = navigationHistory.slice(0, index + 1);
        displayBoxFolders(targetFolder.id, targetFolder.path);
    }
}

// ナビゲーション履歴を更新
function updateNavigationHistory(folderId, folderName, parentPath) {
    const currentPath = parentPath ? `${parentPath} > ${folderName}` : folderName;
    navigationHistory.push({
        id: folderId,
        name: folderName,
        path: currentPath
    });
}

// 親フォルダに設定
async function setAsParentFolder(folderId, folderName) {
    currentFolderId = folderId;
    
    // UIを更新
    const folderInfo = document.getElementById('folderInfo');
    if (folderInfo) {
        folderInfo.innerHTML = `
            <h5>親フォルダ設定完了</h5>
            <p>📁 ${folderName} (ID: ${folderId})</p>
            <button onclick="checkRequiredFolders()">必須フォルダをチェック</button>
        `;
    }
    
    // 親フォルダの詳細情報を表示
    await displayParentFolderDetails(folderId);
    
    showMessage(`親フォルダを設定しました: ${folderName}`, 'success');
}

// 親フォルダ詳細情報を表示
async function displayParentFolderDetails(folderId) {
    try {
        const folderData = await getBoxFolders(folderId);
        if (!folderData) {
            showMessage('フォルダ情報の取得に失敗しました', 'error');
            return;
        }

        // 詳細情報エリアを表示
        const detailsArea = document.getElementById('parentFolderDetails');
        if (detailsArea) {
            detailsArea.style.display = 'block';
        }

        // 基本情報を設定
        document.getElementById('parentFolderName').textContent = folderData.folder.name;
        document.getElementById('parentFolderIdDisplay').textContent = folderData.folder.id;
        document.getElementById('parentFolderCreated').textContent = formatDate(folderData.folder.created_at);
        document.getElementById('parentFolderModified').textContent = formatDate(folderData.folder.modified_at);

        // 統計情報を設定
        document.getElementById('subFoldersCount').textContent = folderData.folders.length;
        document.getElementById('filesCount').textContent = folderData.files.length;

        // 子フォルダ一覧を表示
        const subFoldersList = document.getElementById('subFoldersList');
        if (subFoldersList) {
            subFoldersList.innerHTML = '';
            if (folderData.folders.length > 0) {
                folderData.folders.forEach(folder => {
                    const folderItem = document.createElement('div');
                    folderItem.className = 'item-detail';
                    folderItem.innerHTML = `
                        <span class="item-name">📁 ${folder.name}</span>
                        <span class="item-meta">ID: ${folder.id}</span>
                    `;
                    subFoldersList.appendChild(folderItem);
                });
            } else {
                subFoldersList.innerHTML = '<p style="color: #6c757d; font-style: italic;">子フォルダはありません</p>';
            }
        }

        // ファイル一覧を表示
        const filesListDetails = document.getElementById('filesListDetails');
        if (filesListDetails) {
            filesListDetails.innerHTML = '';
            if (folderData.files.length > 0) {
                folderData.files.forEach(file => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'item-detail';
                    fileItem.innerHTML = `
                        <span class="item-name">📄 ${file.name}</span>
                        <span class="item-meta">${formatFileSize(file.size)}</span>
                    `;
                    filesListDetails.appendChild(fileItem);
                });
            } else {
                filesListDetails.innerHTML = '<p style="color: #6c757d; font-style: italic;">ファイルはありません</p>';
            }
        }

    } catch (error) {
        console.error('親フォルダ詳細情報の取得エラー:', error);
        showMessage('親フォルダ詳細情報の取得に失敗しました', 'error');
    }
}

// 日付をフォーマット
function formatDate(dateString) {
    if (!dateString) return '不明';
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 親フォルダ設定（既存の関数を更新）
async function setParentFolder() {
    const folderInput = document.getElementById('parentFolderInput');
    const folderId = folderInput.value.trim();
    
    if (!folderId) {
        showMessage('フォルダIDまたはURLを入力してください', 'error');
        return;
    }
    
    // フォルダIDを抽出（URLからIDを抽出）
    let actualFolderId = folderId;
    if (folderId.includes('box.com/folder/')) {
        const match = folderId.match(/\/folder\/(\d+)/);
        if (match) {
            actualFolderId = match[1];
        }
    }
    
    // フォルダ情報を取得して設定
    const folderData = await getBoxFolders(actualFolderId);
    if (folderData) {
        await setAsParentFolder(actualFolderId, folderData.folder.name);
    }
}

// 必須フォルダのチェック（プレースホルダー）
async function checkRequiredFolders() {
    // TODO: 必須フォルダの存在確認
    console.log('必須フォルダをチェック中...');
    alert('必須フォルダチェック機能は次のステップで実装します');
}


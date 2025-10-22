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

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
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

// Box認証機能
async function authenticateBox() {
    try {
        const response = await fetch('/api/box-auth', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 新しいウィンドウでBox認証を開く
            const authWindow = window.open(data.authUrl, 'boxAuth', 'width=600,height=600');
            
            // 認証完了を監視
            const checkAuth = setInterval(async () => {
                try {
                    if (authWindow.closed) {
                        clearInterval(checkAuth);
                        // 認証コードを取得（実際の実装では、コールバックURLから取得）
                        const code = prompt('認証コードを入力してください:');
                        if (code) {
                            await completeBoxAuth(code);
                        }
                    }
                } catch (error) {
                    console.error('Auth check error:', error);
                }
            }, 1000);
            
        } else {
            showNotification('Box認証URLの取得に失敗しました', 'error');
        }
    } catch (error) {
        console.error('Box auth error:', error);
        showNotification('Box認証エラーが発生しました', 'error');
    }
}

// Box認証完了処理
async function completeBoxAuth(code) {
    try {
        const response = await fetch('/api/box-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
        });
        
        const data = await response.json();
        
        if (data.success) {
            boxAccessToken = data.accessToken;
            updateAuthStatus(true);
            showNotification('Box認証が完了しました', 'success');
        } else {
            showNotification('Box認証に失敗しました: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Box auth completion error:', error);
        showNotification('Box認証完了処理でエラーが発生しました', 'error');
    }
}

// 認証ステータス更新
function updateAuthStatus(isAuthenticated) {
    const authStatus = document.getElementById('authStatus');
    const folderSection = document.getElementById('folderSection');
    const boxSection = document.getElementById('boxSection');
    
    if (isAuthenticated) {
        authStatus.innerHTML = `
            <p style="color: green;">✅ Box認証済み</p>
            <button onclick="logoutBox()">ログアウト</button>
        `;
        folderSection.style.display = 'block';
        boxSection.style.display = 'block';
    } else {
        authStatus.innerHTML = `
            <p>Boxにログインしてください</p>
            <button class="auth-btn" onclick="authenticateBox()">🔐 Boxにログイン</button>
        `;
        folderSection.style.display = 'none';
    }
}

// Boxログアウト
function logoutBox() {
    boxAccessToken = null;
    currentFolderId = null;
    updateAuthStatus(false);
    showNotification('Boxからログアウトしました', 'info');
}

// 親フォルダ設定（プレースホルダー）
async function setParentFolder() {
    showNotification('フォルダ設定機能は次のステップで実装します', 'info');
}

// 必須フォルダチェック（プレースホルダー）
async function checkRequiredFolders() {
    showNotification('必須フォルダチェック機能は次のステップで実装します', 'info');
}

// ユーティリティ関数
function showNotification(message, type = 'info') {
    // 簡単な通知表示（必要に応じて実装）
    console.log(`${type.toUpperCase()}: ${message}`);
}

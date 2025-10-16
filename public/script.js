// グローバル変数
let selectedFiles = [];
let classificationResults = [];

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
    
    classifyBtn.disabled = true;
    showProgress();
    classificationResults = [];
    
    try {
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            updateProgress(i + 1, selectedFiles.length, `処理中: ${file.name}`);
            
            const result = await classifyFile(file);
            classificationResults.push(result);
            
            // 少し待機（API制限対策）
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        updateProgress(selectedFiles.length, selectedFiles.length, '完了！');
        showResults();
        
    } catch (error) {
        console.error('Classification error:', error);
        alert('分類処理中にエラーが発生しました: ' + error.message);
        hideProgress();
        classifyBtn.disabled = false;
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
}

// 進捗更新
function updateProgress(current, total, text) {
    const percentage = (current / total) * 100;
    progressFill.style.width = percentage + '%';
    progressText.textContent = text;
}

// 進捗非表示
function hideProgress() {
    progressArea.style.display = 'none';
}

// 結果表示
function showResults() {
    resultsList.innerHTML = '';
    
    classificationResults.forEach((result, index) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item fade-in';
        resultItem.innerHTML = `
            <div class="result-icon">${getCategoryIcon(result.category)}</div>
            <div class="result-details">
                <div class="result-file-name">${result.fileName}</div>
                <div class="result-category">${result.category}</div>
                <div class="result-confidence">信頼度: ${(result.confidence * 100).toFixed(1)}%</div>
                <div class="result-reason">${result.reason}</div>
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

// ユーティリティ関数
function showNotification(message, type = 'info') {
    // 簡単な通知表示（必要に応じて実装）
    console.log(`${type.toUpperCase()}: ${message}`);
}

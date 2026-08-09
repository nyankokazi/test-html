const { jsPDF } = window.jspdf;

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileListContainer = document.getElementById("fileList");
const btnConvert = document.getElementById("btnConvert");
const btnClear = document.getElementById("btnClear");
const btnDownload = document.getElementById("btnDownload");
const btnOpenNewTab = document.getElementById("btnOpenNewTab");
const outputFileNameInput = document.getElementById("outputFileName");
const previewArea = document.getElementById("previewArea");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeIcon = document.getElementById("themeIcon");
const themeText = document.getElementById("themeText");
const btnToggleSort = document.getElementById("btnToggleSort");

let fileQueue = [];
let addedCounter = 1;
let currentGeneratedPdf = null;
let activeObjectUrl = null;

// ソート比較用関数
const compareByNameAsc = (a, b) =>
    a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
    });
const compareByNameDesc = (a, b) =>
    b.name.localeCompare(a.name, undefined, {
        numeric: true,
        sensitivity: "base",
    });
const compareByAddedDesc = (a, b) => b.addOrder - a.addOrder;
const compareByAddedAsc = (a, b) => a.addOrder - b.addOrder;

let sortMode = 0;
const sortModes = [
    { label: "名前順 (A→Z / 0→9)", fn: compareByNameAsc },
    { label: "名前逆順 (Z→A / 9→0)", fn: compareByNameDesc },
    { label: "追加順 (新しい順)", fn: compareByAddedDesc },
    { label: "追加順 (古い順)", fn: compareByAddedAsc },
];

// --- SessionStorage を利用したダークモード状態管理 ---
function applyTheme(theme) {
    if (theme === "dark") {
        document.body.setAttribute("data-theme", "dark");
        themeIcon.textContent = "☀️";
        themeText.textContent = "ライトモード";
        sessionStorage.setItem("app-theme", "dark");
    } else {
        document.body.removeAttribute("data-theme");
        themeIcon.textContent = "🌙";
        themeText.textContent = "ダークモード";
        sessionStorage.setItem("app-theme", "light");
    }
}

const savedTheme = sessionStorage.getItem("app-theme") || "light";
applyTheme(savedTheme);

themeToggleBtn.addEventListener("click", () => {
    const isDark = document.body.getAttribute("data-theme") === "dark";
    applyTheme(isDark ? "light" : "dark");
});

// --- 共通接頭辞 (LCP) の抽出処理 ---
function extractCleanCommonPrefix(fileNames) {
    if (fileNames.length === 0) return "";
    let names = fileNames.map((f) => f.replace(/\.[^/.]+$/, ""));
    let prefix = names[0];

    for (let i = 1; i < names.length; i++) {
        while (names[i].indexOf(prefix) !== 0) {
            prefix = prefix.substring(0, prefix.length - 1);
            if (prefix === "") break;
        }
    }

    prefix = prefix.replace(/[_ \-\(\[\s]+[0-9A-Za-z_ \-\(\)\[\]]*$/, "");
    prefix = prefix.replace(/[_ \-\(\[]+$/, "");

    return prefix.trim();
}

function autoSetPlaceholderName() {
    if (fileQueue.length > 0) {
        const names = fileQueue.map((f) => f.name);
        const cleanPrefix = extractCleanCommonPrefix(names);
        outputFileNameInput.placeholder = cleanPrefix
            ? `共通部分: ${cleanPrefix}`
            : "共通部分なし (出力名: converted.pdf)";
    }
}

function resolveOutputFileName() {
    let filename = outputFileNameInput.value.trim();
    if (!filename) {
        const names = fileQueue.map((f) => f.name);
        filename = extractCleanCommonPrefix(names) || "converted";
    }
    if (!filename.endsWith(".pdf")) {
        filename += ".pdf";
    }
    return filename;
}

function updateNameBasedIds() {
    const tempSorted = [...fileQueue].sort(compareByNameAsc);
    tempSorted.forEach((file, index) => {
        file.nameIndex = index + 1;
    });
}

// --- ドロップ＆ファイル選択処理 ---
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        handleFiles(e.target.files);
        fileInput.value = "";
    }
});

function handleFiles(files) {
    const imageFiles = Array.from(files).filter((file) =>
        file.type.startsWith("image/"),
    );
    if (imageFiles.length === 0) {
        alert("画像ファイル (PNG, JPG, WebP等) を選択してください。");
        return;
    }

    imageFiles.forEach((file) => {
        file.previewUrl = URL.createObjectURL(file);
        file.addOrder = addedCounter++;
        fileQueue.push(file);
    });

    updateNameBasedIds();
    applyCurrentSort();
    autoSetPlaceholderName();
    updateUI();
}

function removeFile(index) {
    URL.revokeObjectURL(fileQueue[index].previewUrl);
    fileQueue.splice(index, 1);
    updateNameBasedIds();
    autoSetPlaceholderName();
    updateUI();
}

function clearActivePreviewUrl() {
    if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
    }
}

btnClear.addEventListener("click", () => {
    fileQueue.forEach((file) => URL.revokeObjectURL(file.previewUrl));
    fileQueue = [];
    addedCounter = 1;
    outputFileNameInput.placeholder = "例: my_document";
    currentGeneratedPdf = null;
    clearActivePreviewUrl();
    btnDownload.style.display = "none";
    btnOpenNewTab.style.display = "none";
    previewArea.innerHTML =
        '<div class="no-preview">PDFを生成するとここに表示されます</div>';
    updateUI();
});

// --- ワンボタン並び替え切替 ---
btnToggleSort.addEventListener("click", () => {
    sortMode = (sortMode + 1) % sortModes.length;
    applyCurrentSort();
    updateUI();
});

function applyCurrentSort() {
    fileQueue.sort(sortModes[sortMode].fn);
    btnToggleSort.textContent = `🔄 並び替え: ${sortModes[sortMode].label}`;
}

// --- Drag & Drop 手動リスト並び替え ---
let draggedIndex = null;
let placeholderElement = null;

function createPlaceholder() {
    const el = document.createElement("div");
    el.className = "drag-placeholder";
    return el;
}

function handleDragStart(e) {
    draggedIndex = Number(this.dataset.index);
    this.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    placeholderElement = createPlaceholder();
}

function handleListDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (draggedIndex === null) return;

    const targetItem = e.target.closest(".file-item");
    if (
        targetItem &&
        targetItem !== placeholderElement &&
        !targetItem.classList.contains("dragging")
    ) {
        const rect = targetItem.getBoundingClientRect();
        const offset = e.clientY - rect.top;

        if (offset > rect.height / 2) {
            targetItem.after(placeholderElement);
        } else {
            targetItem.before(placeholderElement);
        }
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    if (draggedIndex === null || !placeholderElement) return;

    const children = Array.from(fileListContainer.children);
    const placeholderIndex = children.indexOf(placeholderElement);

    if (placeholderIndex !== -1) {
        const draggedItem = fileQueue.splice(draggedIndex, 1)[0];
        let newIndex = 0;
        for (let i = 0; i < placeholderIndex; i++) {
            if (
                !children[i].classList.contains("dragging") &&
                children[i] !== placeholderElement
            ) {
                newIndex++;
            }
        }
        fileQueue.splice(newIndex, 0, draggedItem);
    }

    cleanupDrag();
    updateUI();
}

function handleDragEnd() {
    cleanupDrag();
    updateUI();
}

function cleanupDrag() {
    if (placeholderElement && placeholderElement.parentNode) {
        placeholderElement.parentNode.removeChild(placeholderElement);
    }
    placeholderElement = null;
    draggedIndex = null;
}

fileListContainer.addEventListener("dragover", handleListDragOver);
fileListContainer.addEventListener("drop", handleDrop);

// --- UI描画処理 ---
function updateUI() {
    fileListContainer.innerHTML = "";

    fileQueue.forEach((file, index) => {
        const item = document.createElement("div");
        item.className = "file-item";
        item.draggable = true;
        item.dataset.index = index;

        item.innerHTML = `
        <div class="file-info">
          <span class="drag-handle">⋮⋮</span>
          <span class="badge" title="現在のページ順">${index + 1}</span>
          <img src="${file.previewUrl}" class="thumb" alt="thumb">
          <span class="file-name">${escapeHtml(file.name)}</span>
          <span class="orig-badge" title="名前順の固有ID">ID: ${file.nameIndex}</span>
        </div>
        <button class="btn-remove" onclick="removeFile(${index})" title="削除">✕</button>
      `;

        item.addEventListener("dragstart", handleDragStart);
        item.addEventListener("dragend", handleDragEnd);

        fileListContainer.appendChild(item);
    });

    const hasFiles = fileQueue.length > 0;
    btnConvert.disabled = !hasFiles;
    btnClear.disabled = !hasFiles;
}

function escapeHtml(str) {
    return str.replace(
        /[&<>"']/g,
        (m) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;",
            })[m],
    );
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let format = "PNG";
                if (file.type === "image/jpeg" || file.type === "image/jpg") {
                    format = "JPEG";
                }
                resolve({
                    imgData: e.target.result,
                    width: img.width,
                    height: img.height,
                    format: format,
                });
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 10));

// --- 別タブで開く処理 ---
function openPdfInNewTab() {
    if (activeObjectUrl) {
        window.open(activeObjectUrl, "_blank");
    }
}

btnOpenNewTab.addEventListener("click", openPdfInNewTab);

// --- PDF生成・直接プレビュー描画 ---
btnConvert.addEventListener("click", async () => {
    if (fileQueue.length === 0) return;

    btnConvert.disabled = true;
    btnDownload.style.display = "none";
    btnOpenNewTab.style.display = "none";

    previewArea.innerHTML = `
      <div class="no-preview">
        <div class="progress-box">
          <div class="progress-text" id="progressText">PDFを生成中... (0 / ${fileQueue.length})</div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="progressBarFill"></div>
          </div>
        </div>
      </div>
    `;

    const progressText = document.getElementById("progressText");
    const progressBarFill = document.getElementById("progressBarFill");

    try {
        let pdf = null;
        const total = fileQueue.length;

        for (let i = 0; i < total; i++) {
            await yieldToUI();

            const currentNum = i + 1;
            const percent = Math.round((currentNum / total) * 100);

            btnConvert.textContent = `変換中... (${percent}%)`;
            if (progressText)
                progressText.textContent = `ページを処理中... (${currentNum} / ${total})`;
            if (progressBarFill) progressBarFill.style.width = `${percent}%`;

            const { imgData, width, height, format } = await loadImage(
                fileQueue[i],
            );
            const orientation = width > height ? "landscape" : "portrait";

            if (i === 0) {
                pdf = new jsPDF({
                    orientation: orientation,
                    unit: "px",
                    format: [width, height],
                });
            } else {
                pdf.addPage([width, height], orientation);
            }

            pdf.addImage(imgData, format, 0, 0, width, height);
        }

        currentGeneratedPdf = pdf;
        clearActivePreviewUrl();

        if (progressText)
            progressText.textContent = "プレビューをレンダリング中...";
        await yieldToUI();

        const pdfArrayBuffer = pdf.output("arraybuffer");
        const pdfBlob = new Blob([pdfArrayBuffer], {
            type: "application/pdf",
        });
        activeObjectUrl = URL.createObjectURL(pdfBlob);

        // 条件判断を行わず、そのまま iframe を描画
        previewArea.innerHTML = `<iframe class="pdf-frame" src="${activeObjectUrl}#toolbar=1"></iframe>`;

        // 常に別タブ表示ボタンとダウンロードボタンを表示
        btnDownload.style.display = "inline-flex";
        btnOpenNewTab.style.display = "inline-flex";
    } catch (error) {
        console.error(error);
        alert("PDFの生成中にエラーが発生しました。");
        previewArea.innerHTML =
            '<div class="no-preview">PDF生成に失敗しました。</div>';
    } finally {
        btnConvert.disabled = false;
        btnConvert.textContent = "PDFを作成・プレビュー";
    }
});

// --- ダウンロード実行 ---
btnDownload.addEventListener("click", () => {
    if (currentGeneratedPdf) {
        const finalFileName = resolveOutputFileName();
        currentGeneratedPdf.save(finalFileName);
    }
});

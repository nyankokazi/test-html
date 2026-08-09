const inputElement = document.getElementById("input");

// 1. ページ読み込み時：保存されている値があれば value に設定する
const savedValue = sessionStorage.getItem("input");
if (savedValue !== null) {
    inputElement.value = savedValue;
}

// 2. 文字入力時：入力された内容（.value）を保存する
inputElement.addEventListener("input", () => {
    sessionStorage.setItem("input", inputElement.value);
});
let InputValue = document.getElementById("input");
let item = sessionStorage.setItem("input", InputValue);
function items() {
    InputValue.value = sessionStorage.getItem("input");
}
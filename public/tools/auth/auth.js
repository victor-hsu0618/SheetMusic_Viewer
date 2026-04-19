const ADMIN_PASSWORD = "scoreflow_admin_2026"; // 建議隨後改為環境變數或更安全的機制

export function checkAuth() {
    if (localStorage.getItem("admin_authorized") === ADMIN_PASSWORD) {
        return true;
    }
    
    const password = prompt("此為管理員專用工具，請輸入密碼：");
    if (password === ADMIN_PASSWORD) {
        localStorage.setItem("admin_authorized", ADMIN_PASSWORD);
        return true;
    } else {
        alert("驗證失敗，即將返回首頁");
        window.location.href = "/";
        return false;
    }
}

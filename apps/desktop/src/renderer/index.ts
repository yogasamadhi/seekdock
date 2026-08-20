const params = new URLSearchParams(window.location.search);
const state = params.get("state") ?? "starting";
const message = params.get("message");

const statusElement = document.querySelector<HTMLElement>("#status");
const detail = document.querySelector<HTMLElement>("#detail");
const restart = document.querySelector<HTMLAnchorElement>("#restart");

if (!statusElement || !detail || !restart) {
  throw new Error("SeekDock shell is missing required elements");
}

if (state === "failed") {
  statusElement.textContent = "DeepSeek Harness 启动失败";
  detail.textContent = message ?? "运行时异常退出，请查看 SeekDock 日志。";
  detail.hidden = false;
  restart.hidden = false;
} else if (state === "restarting") {
  statusElement.textContent = "正在重新启动 DeepSeek Harness…";
} else {
  statusElement.textContent = "正在启动 DeepSeek Harness…";
}

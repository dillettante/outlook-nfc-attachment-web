import {
  MAX_ATTACHMENT_BYTES,
  assertAttachableFile,
  fileKey,
  formatBytes,
  getNormalizationForm,
  mergeFiles,
  toFileArray
} from "./nfc.mjs";

// Mac Outlook은 첨부 API의 콜백을 영영 돌려주지 않는 알려진 버그가 있다(office-js#6264).
// 시간 제한이 없으면 파일 하나가 멎을 때 뒤의 파일이 전부 함께 막힌다.
const ATTACH_TIMEOUT_MS = 60_000;

const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector("#drop-zone");
const attachButton = document.querySelector("#attach-button");
const clearButton = document.querySelector("#clear-button");
const fileListBox = document.querySelector("#file-list");
const selectionSummary = document.querySelector("#selection-summary");
const statusBox = document.querySelector("#status");
const activityList = document.querySelector("#activity-list");

let outlookReady = false;
let pendingFiles = [];

function setStatus(message, kind = "info") {
  statusBox.textContent = message;
  statusBox.dataset.kind = kind;
}

function appendActivity(message, kind = "ok") {
  const item = document.createElement("li");
  item.textContent = message;
  item.dataset.kind = kind;
  activityList.append(item);
}

function selectedFiles() {
  return pendingFiles;
}

// 고를 때마다 갈아치우지 않고 목록에 쌓는다. 파일 선택창은 한 번에 하나의 폴더만
// 보여 주므로, 여러 폴더에 흩어진 파일을 붙이려면 나눠 고를 수 있어야 한다.
function addFiles(fileList) {
  pendingFiles = mergeFiles(pendingFiles, toFileArray(fileList));
  updateSelection();
}

function removeFile(target) {
  const key = fileKey(target);
  pendingFiles = pendingFiles.filter((file) => fileKey(file) !== key);
  updateSelection();
}

function renderFileList() {
  fileListBox.replaceChildren();

  for (const file of selectedFiles()) {
    const row = document.createElement("li");
    const name = document.createElement("span");
    const size = document.createElement("span");
    const remove = document.createElement("button");

    name.className = "file-name";
    name.textContent = file.name.normalize("NFC");
    size.className = "file-size";
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${file.name} 선택 해제`);
    remove.addEventListener("click", () => removeFile(file));

    if (file.size > MAX_ATTACHMENT_BYTES) {
      row.dataset.kind = "error";
      size.textContent = `${formatBytes(file.size)} · 한도 초과`;
    } else {
      size.textContent = formatBytes(file.size);
    }

    row.append(name, size, remove);
    fileListBox.append(row);
  }
}

function updateSelection() {
  const files = selectedFiles();
  const attachable = files.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
  const overCount = files.length - attachable.length;

  renderFileList();

  if (files.length === 0) {
    selectionSummary.textContent = "선택된 파일 없음";
  } else {
    const totalBytes = attachable.reduce((sum, file) => sum + file.size, 0);
    selectionSummary.textContent =
      `${files.length}개 선택 · 첨부 대상 ${attachable.length}개 · ${formatBytes(totalBytes)}`;
  }

  clearButton.disabled = files.length === 0;
  attachButton.disabled = !outlookReady || attachable.length === 0;

  if (!outlookReady) {
    return;
  }

  if (overCount > 0) {
    setStatus(
      `${overCount}개는 한도를 넘어 제외됩니다. 나머지 ${attachable.length}개만 첨부합니다.`,
      "error"
    );
  } else {
    setStatus("파일을 선택한 뒤 NFC 첨부를 누르세요.", "ready");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const result = String(reader.result ?? "");
      const separatorIndex = result.indexOf(",");
      if (separatorIndex < 0) {
        reject(new Error(`${file.name}: Base64 변환 결과가 올바르지 않습니다.`));
        return;
      }
      resolve(result.slice(separatorIndex + 1));
    });

    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error(`${file.name}: 파일을 읽지 못했습니다.`));
    });

    reader.readAsDataURL(file);
  });
}

function addAttachment(base64, attachmentName) {
  return new Promise((resolve, reject) => {
    const item = Office.context.mailbox.item;
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${attachmentName}: Outlook이 60초 안에 응답하지 않아 건너뜁니다.`
        )
      );
    }, ATTACH_TIMEOUT_MS);

    item.addFileAttachmentFromBase64Async(
      base64,
      attachmentName,
      (result) => {
        clearTimeout(timer);

        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value);
          return;
        }

        reject(
          new Error(
            result.error?.message ??
            `${attachmentName}: Outlook 첨부 API가 실패했습니다.`
          )
        );
      }
    );
  });
}

// Mac Outlook은 붙인 첨부가 조용히 사라지는 버그도 보고돼 있다(office-js#5616).
// 그래서 붙였다는 응답만 믿지 않고, 실제로 몇 개가 남았는지 세어 대조한다.
function countAttachments() {
  return new Promise((resolve) => {
    const item = Office.context.mailbox.item;

    if (typeof item?.getAttachmentsAsync !== "function") {
      resolve(null);
      return;
    }

    item.getAttachmentsAsync((result) => {
      resolve(
        result.status === Office.AsyncResultStatus.Succeeded
          ? result.value.length
          : null
      );
    });
  });
}

async function attachSelectedFiles() {
  const files = selectedFiles();
  attachButton.disabled = true;
  clearButton.disabled = true;
  fileInput.disabled = true;
  activityList.replaceChildren();

  const before = await countAttachments();
  const failed = [];
  let successCount = 0;

  for (const [index, file] of files.entries()) {
    const progress = `(${index + 1}/${files.length})`;

    try {
      const originalForm = getNormalizationForm(file.name);
      const normalizedName = assertAttachableFile(file);
      setStatus(`${progress} ${normalizedName} 읽는 중…`, "working");

      const base64 = await fileToBase64(file);
      setStatus(`${progress} ${normalizedName} Outlook에 첨부 중…`, "working");
      await addAttachment(base64, normalizedName);

      const changed = normalizedName !== file.name;
      const detail = changed
        ? `NFC 변환 완료 (${originalForm} → NFC)`
        : "이미 NFC 또는 정규화 중립";
      appendActivity(`${normalizedName} — ${detail}`);
      successCount += 1;
    } catch (error) {
      appendActivity(error.message, "error");
      failed.push(file);
    }
  }

  // 실패한 파일은 목록에 남긴다. 다시 고를 필요 없이 버튼만 누르면 재시도된다.
  fileInput.value = "";
  pendingFiles = failed;
  fileInput.disabled = false;
  updateSelection();

  const after = await countAttachments();
  const landed = before === null || after === null ? null : after - before;

  if (landed !== null && landed !== successCount) {
    appendActivity(
      `Outlook에 실제로 남은 첨부는 ${landed}개입니다 (첨부 성공 ${successCount}개). ` +
      "Mac Outlook이 첨부를 되돌린 것으로 보입니다. 메일 창에서 직접 확인하세요.",
      "error"
    );
    setStatus(
      `${successCount}개를 붙였으나 ${landed}개만 남았습니다. 첨부 목록을 확인하세요.`,
      "error"
    );
    return;
  }

  if (failed.length === 0) {
    setStatus(`${successCount}개 파일을 NFC 파일명으로 첨부했습니다.`, "success");
  } else {
    setStatus(
      `${successCount}/${files.length}개 첨부 완료. 실패한 ${failed.length}개는 목록에 남겨 두었습니다.`,
      "error"
    );
  }
}

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function showDropTarget(event) {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "copy";
  dropZone.classList.add("is-dragover");
}

function hideDropTarget(event) {
  if (event.relatedTarget && dropZone.contains(event.relatedTarget)) {
    return;
  }

  dropZone.classList.remove("is-dragover");
}

function acceptDroppedFiles(event) {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  dropZone.classList.remove("is-dragover");

  const before = pendingFiles.length;
  fileInput.value = "";
  addFiles(event.dataTransfer.files);

  if (pendingFiles.length === before) {
    setStatus(
      "새로 추가된 파일이 없습니다. 폴더가 아닌 파일인지, 이미 목록에 있는지 확인하세요.",
      "error"
    );
  }
}

function preventWindowFileDrop(event) {
  if (isFileDrag(event)) {
    event.preventDefault();
  }
}

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  // 값을 비워야 같은 파일을 지웠다가 다시 골랐을 때도 change가 다시 뜬다.
  fileInput.value = "";
});
clearButton.addEventListener("click", () => {
  pendingFiles = [];
  fileInput.value = "";
  activityList.replaceChildren();
  updateSelection();
});
dropZone.addEventListener("dragenter", showDropTarget);
dropZone.addEventListener("dragover", showDropTarget);
dropZone.addEventListener("dragleave", hideDropTarget);
dropZone.addEventListener("drop", acceptDroppedFiles);
window.addEventListener("dragover", preventWindowFileDrop);
window.addEventListener("drop", preventWindowFileDrop);
attachButton.addEventListener("click", attachSelectedFiles);

if (typeof Office === "undefined") {
  setStatus("Office.js를 불러오지 못했습니다.", "error");
} else {
  Office.onReady(() => {
    const item = Office.context?.mailbox?.item;
    const apiAvailable =
      Office.context.requirements.isSetSupported("Mailbox", "1.8") &&
      typeof item?.addFileAttachmentFromBase64Async === "function";

    if (!apiAvailable) {
      setStatus("이 Outlook 또는 메일 계정은 필요한 첨부 API를 지원하지 않습니다.", "error");
      return;
    }

    outlookReady = true;
    updateSelection();
  });
}

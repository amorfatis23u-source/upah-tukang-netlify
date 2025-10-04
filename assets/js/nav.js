const STORAGE_KEY = "upah:new_counter";
let memoryCounter = 0;

function incrementFromStorage() {
  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  const parsedValue = Number.parseInt(rawValue ?? "", 10);
  const safeCurrent = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
  const nextValue = safeCurrent + 1;
  window.localStorage.setItem(STORAGE_KEY, String(nextValue));
  return nextValue;
}

export function getNextFormIndex() {
  if (typeof window === "undefined") {
    memoryCounter += 1;
    return memoryCounter;
  }

  try {
    return incrementFromStorage();
  } catch (error) {
    memoryCounter += 1;
    return memoryCounter;
  }
}

export function openNewFormAutoClose() {
  const nextIndex = getNextFormIndex();
  const targetUrl = `form.html?new=${encodeURIComponent(nextIndex)}&session=autoclose`;

  if (typeof window !== "undefined") {
    try {
      if (window.location && typeof window.location.href === "string") {
        window.location.href = targetUrl;
      } else {
        window.open(targetUrl, "_self");
      }
    } catch (error) {
      window.open(targetUrl, "_self");
    }
  }

  return targetUrl;
}

// public/js/sessionTimer.js

function initSessionTimer(options = {}) {
  const {
    containerId = "sessionTimer",
    summaryId = "sessionTimerSummary",
    detailsId = "sessionTimerDetails",
    displayId = "sessionTimerDisplay",
    displayTriggerId = "sessionTimerDisplayTrigger",
    resetId = "sessionTimerReset",
    storageKeyPrefix = "builderSession",
    autoPauseAfterMs = 20000
  } = options;

  const ACTIVITY_THROTTLE_MS = 250;
  const HOVER_BUFFER_PX = 120;
  const HOVER_CLOSE_DELAY_MS = 120;

  const containerEl = document.getElementById(containerId);
  const summaryEl = document.getElementById(summaryId);
  const detailsEl = document.getElementById(detailsId);
  const displayEl = document.getElementById(displayId);
  const displayTriggerEl = document.getElementById(displayTriggerId);
  const resetEl = document.getElementById(resetId);
  const longestEl = document.getElementById("sessionTimerLongest");
  const shortestEl = document.getElementById("sessionTimerShortest");
  const averageEl = document.getElementById("sessionTimerAverage");

  if (!displayEl) {
    console.warn(
      "[SessionTimer] Missing one or more required elements:",
      { displayId }
    );
    return;
  }

  const LS_KEY_ELAPSED = `${storageKeyPrefix}ElapsedMs`;
  const LS_KEY_RUNNING = `${storageKeyPrefix}Running`;
  const LS_KEY_STARTED = `${storageKeyPrefix}StartedAt`;

  let elapsedMs = Number(window.localStorage.getItem(LS_KEY_ELAPSED) || 0);
  let isRunning = window.localStorage.getItem(LS_KEY_RUNNING) === "1";
  let startedAtMs = Number(window.localStorage.getItem(LS_KEY_STARTED) || 0);
  let restoredFromRunningState = false;

  if (isRunning && startedAtMs) {
    elapsedMs += Math.max(0, Date.now() - startedAtMs);
    startedAtMs = 0;
    isRunning = false;
    restoredFromRunningState = true;
  }

  let intervalId = null;
  let inactivityTimeoutId = null;
  let lastActivitySignalAtMs = 0;
  let pendingHoverCloseActive = false;
  let pendingHoverCloseTimer = null;
  let pointerClientX = Number.NaN;
  let pointerClientY = Number.NaN;

  function supportsHoverOnly() {
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  function clearPendingHoverClose() {
    pendingHoverCloseActive = false;
    if (pendingHoverCloseTimer) {
      window.clearTimeout(pendingHoverCloseTimer);
      pendingHoverCloseTimer = null;
    }
  }

  function getInteractiveRect() {
    if (!containerEl) return null;

    const baseRect = containerEl.getBoundingClientRect();
    const rects = [baseRect];

    if (detailsEl) {
      rects.push(detailsEl.getBoundingClientRect());
    }

    if (resetEl && containerEl.classList.contains("is-open")) {
      rects.push(resetEl.getBoundingClientRect());
    }

    return {
      left: Math.min(...rects.map((rect) => rect.left)),
      right: Math.max(...rects.map((rect) => rect.right)),
      top: Math.min(...rects.map((rect) => rect.top)),
      bottom: Math.max(...rects.map((rect) => rect.bottom))
    };
  }

  function isPointerInsideHoverBuffer(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    const rect = getInteractiveRect();
    if (!rect) return false;

    return (
      clientX >= rect.left - HOVER_BUFFER_PX &&
      clientX <= rect.right + HOVER_BUFFER_PX &&
      clientY >= rect.top - HOVER_BUFFER_PX &&
      clientY <= rect.bottom + HOVER_BUFFER_PX
    );
  }

  function setExpanded(isExpanded) {
    if (containerEl) {
      containerEl.classList.toggle("is-open", !!isExpanded);
    }
    if (displayTriggerEl?.hasAttribute("aria-expanded")) {
      displayTriggerEl.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    }
  }

  function evaluatePendingHoverClose() {
    if (!pendingHoverCloseActive) return;
    if (!containerEl?.isConnected) {
      clearPendingHoverClose();
      return;
    }
    if (!supportsHoverOnly()) {
      clearPendingHoverClose();
      return;
    }
    if (containerEl.matches(":hover") || containerEl.matches(":focus-within")) {
      clearPendingHoverClose();
      return;
    }
    if (isPointerInsideHoverBuffer(pointerClientX, pointerClientY)) return;
    setExpanded(false);
    clearPendingHoverClose();
  }

  function schedulePendingHoverClose() {
    pendingHoverCloseActive = true;
    if (pendingHoverCloseTimer) return;
    pendingHoverCloseTimer = window.setTimeout(() => {
      pendingHoverCloseTimer = null;
      evaluatePendingHoverClose();
    }, HOVER_CLOSE_DELAY_MS);
  }

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    if (h > 0) {
      return (
        String(h).padStart(2, "0") +
        ":" +
        String(m).padStart(2, "0") +
        ":" +
        String(s).padStart(2, "0")
      );
    }
    return (
      String(m).padStart(2, "0") +
      ":" +
      String(s).padStart(2, "0")
    );
  }

  function getLiveMs() {
    const now = Date.now();
    if (isRunning && startedAtMs) {
      return elapsedMs + (now - startedAtMs);
    }
    return elapsedMs;
  }

  function render() {
    displayEl.textContent = formatTime(getLiveMs());
  }

  async function refreshStats() {
    if (!longestEl && !shortestEl && !averageEl) {
      return;
    }

    try {
      const res = await fetch("/api/stats/overview", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Stats request failed with ${res.status}`);

      const overview = await res.json();
      if (longestEl) longestEl.textContent = formatTime(overview.sessionTimeStats?.longestMs);
      if (shortestEl) shortestEl.textContent = formatTime(overview.sessionTimeStats?.shortestMs);
      if (averageEl) averageEl.textContent = formatTime(overview.sessionTimeStats?.averageMs);
    } catch (err) {
      console.warn("[SessionTimer] Failed to refresh quick stats:", err);
    }
  }

  function clearInactivityTimeout() {
    if (inactivityTimeoutId) {
      window.clearTimeout(inactivityTimeoutId);
      inactivityTimeoutId = null;
    }
  }

  function scheduleInactivityTimeout() {
    clearInactivityTimeout();
    if (!isRunning || !(autoPauseAfterMs > 0)) return;

    inactivityTimeoutId = window.setTimeout(() => {
      inactivityTimeoutId = null;
      pause();
    }, autoPauseAfterMs);
  }

  function persist() {
    window.localStorage.setItem(LS_KEY_ELAPSED, String(elapsedMs));
    window.localStorage.setItem(LS_KEY_RUNNING, isRunning ? "1" : "0");

    if (isRunning && startedAtMs) {
      window.localStorage.setItem(LS_KEY_STARTED, String(startedAtMs));
    } else {
      window.localStorage.removeItem(LS_KEY_STARTED);
    }
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    startedAtMs = Date.now();
    lastActivitySignalAtMs = startedAtMs;
    persist();
    render();
    scheduleInactivityTimeout();

    if (!intervalId) {
      intervalId = window.setInterval(render, 500);
    }
  }

  function pause() {
    if (!isRunning) return;
    const now = Date.now();
    elapsedMs += now - startedAtMs;
    startedAtMs = 0;
    isRunning = false;
    clearInactivityTimeout();
    persist();
    render();
  }

  function reset() {
    elapsedMs = 0;
    startedAtMs = 0;
    isRunning = false;
    clearInactivityTimeout();
    persist();
    render();
  }

  function markActivity({ resumeIfPaused = false, force = false } = {}) {
    const shouldResume = resumeIfPaused && !isRunning;
    if (!isRunning && !shouldResume) return;

    const now = Date.now();
    if (!force && !shouldResume && (now - lastActivitySignalAtMs) < ACTIVITY_THROTTLE_MS) {
      return;
    }

    if (shouldResume) {
      start();
      return;
    }

    lastActivitySignalAtMs = now;
    scheduleInactivityTimeout();
  }

  // Wire up controls
  if (displayTriggerEl && detailsEl && displayTriggerEl !== resetEl) {
    const triggerTag = String(displayTriggerEl.tagName || "").toUpperCase();
    if (triggerTag !== "A") {
      displayTriggerEl.addEventListener("click", (event) => {
        event.preventDefault();
        clearPendingHoverClose();
        setExpanded(!containerEl?.classList.contains("is-open"));
      });
    }
  }

  if (resetEl) {
    if (detailsEl) {
      resetEl.addEventListener("mouseenter", () => {
        clearPendingHoverClose();
        setExpanded(true);
      });

      resetEl.addEventListener("mouseleave", (event) => {
        if (!supportsHoverOnly()) return;
        pointerClientX = event.clientX;
        pointerClientY = event.clientY;
        schedulePendingHoverClose();
      });
    }

    resetEl.addEventListener("click", async () => {
      const scope = String(resetEl.dataset.resetScope || "").trim().toLowerCase();
      if (scope === "builder" && typeof window.resetBuilderWorkspace === "function") {
        await window.resetBuilderWorkspace();
        return;
      }

      if (scope !== "stats") {
        reset();
        return;
      }

      const ok = window.confirm("Reset all saved stats? This cannot be undone.");
      if (!ok) return;

      const originalText = resetEl.textContent;
      resetEl.disabled = true;
      resetEl.textContent = "Resetting...";
      try {
        const response = await fetch("/api/stats/reset", {
          method: "POST",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) {
          throw new Error(`Reset request failed with ${response.status}`);
        }
        await refreshStats();
      } catch (err) {
        window.alert(`Failed to reset stats: ${String(err?.message || err)}`);
      } finally {
        resetEl.disabled = false;
        resetEl.textContent = originalText;
      }
    });
  }

  if (containerEl && summaryEl && detailsEl) {
    containerEl.addEventListener("mouseenter", () => {
      if (!supportsHoverOnly()) return;
      clearPendingHoverClose();
      setExpanded(true);
    });

    containerEl.addEventListener("mouseleave", (event) => {
      if (!supportsHoverOnly()) return;
      pointerClientX = event.clientX;
      pointerClientY = event.clientY;
      schedulePendingHoverClose();
    });

    containerEl.addEventListener("focusin", () => {
      clearPendingHoverClose();
      setExpanded(true);
    });

    containerEl.addEventListener("focusout", () => {
      window.requestAnimationFrame(() => {
        if (containerEl.contains(document.activeElement)) return;

        if (supportsHoverOnly()) {
          if (containerEl.matches(":hover")) return;
          if (isPointerInsideHoverBuffer(pointerClientX, pointerClientY)) {
            schedulePendingHoverClose();
            return;
          }
          setExpanded(false);
          return;
        }

        setExpanded(false);
      });
    });

    document.addEventListener("mousemove", (event) => {
      pointerClientX = event.clientX;
      pointerClientY = event.clientY;
      if (pendingHoverCloseActive && !pendingHoverCloseTimer) {
        evaluatePendingHoverClose();
      }
    }, { passive: true });

    document.addEventListener("pointerdown", (event) => {
      if (containerEl.contains(event.target)) return;
      clearPendingHoverClose();
      setExpanded(false);
    });
  }

  if (autoPauseAfterMs > 0) {
    document.addEventListener("pointermove", () => {
      markActivity();
    }, { passive: true });

    document.addEventListener("pointerdown", () => {
      markActivity({ force: true });
    }, { passive: true });

    document.addEventListener("keydown", () => {
      markActivity({ force: true });
    });

    document.addEventListener("dragover", () => {
      markActivity();
    });

    document.addEventListener("drop", () => {
      markActivity({ force: true });
    });
  }

  // Restore state on load
  if (restoredFromRunningState) {
    persist();
  }

  render();
  refreshStats();

  return {
    start,
    pause,
    reset,
    refreshStats,
    markActivity,
    getElapsedMs: () => getLiveMs(),
    isRunning: () => isRunning
  };
}

if (typeof window !== "undefined") {
  window.initSessionTimer = initSessionTimer;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { initSessionTimer };
}

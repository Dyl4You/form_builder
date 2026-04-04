(function guidePageBootstrap() {
  const root = document.documentElement;
  const targetDurationSeconds = Math.max(1, Number(root.dataset.guideVideoTargetDuration) || 12);
  const previewVideos = Array.from(document.querySelectorAll('[data-guide-video-preview]'));

  function applyGuidePlaybackRate(video) {
    if (!(video instanceof HTMLVideoElement)) return;

    const syncRate = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration) return;

      const nextRate = Math.min(1.25, Math.max(0.35, duration / targetDurationSeconds));
      video.defaultPlaybackRate = nextRate;
      video.playbackRate = nextRate;
    };

    if (video.readyState >= 1) {
      syncRate();
    } else {
      video.addEventListener('loadedmetadata', syncRate, { once: true });
    }

    video.addEventListener('play', syncRate);
  }

  previewVideos.forEach((video) => {
    applyGuidePlaybackRate(video);
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
  });

  if (previewVideos.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (!(video instanceof HTMLVideoElement)) return;

        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
          if (video.currentTime > 0) {
            video.currentTime = 0;
          }
        }
      });
    }, {
      threshold: 0.45
    });

    previewVideos.forEach((video) => observer.observe(video));
  } else {
    previewVideos.forEach((video) => {
      video.play().catch(() => {});
    });
  }
})();

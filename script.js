(() => {
  /** @type {HTMLInputElement | null} */
  const folderInput = document.getElementById("folderInput");
  /** @type {HTMLButtonElement | null} */
  const reshuffleBtn = document.getElementById("reshuffleBtn");
  /** @type {HTMLSpanElement | null} */
  const statusText = document.getElementById("statusText");
  /** @type {HTMLSpanElement | null} */
  const counterText = document.getElementById("counterText");
  /** @type {HTMLVideoElement | null} */
  const videoLeft = document.getElementById("videoLeft");
  /** @type {HTMLVideoElement | null} */
  const videoRight = document.getElementById("videoRight");
  /** @type {HTMLDivElement | null} */
  const viewport = document.getElementById("videoViewport");

  if (
    !folderInput ||
    !reshuffleBtn ||
    !statusText ||
    !counterText ||
    !videoLeft ||
    !videoRight ||
    !viewport
  ) {
    console.error("初始化失败：缺少必要的 DOM 元素");
    return;
  }

  /** @type {File[]} */
  let playlist = [];
  let currentIndex = -1;
  let isRightHalf = false;
  let syncing = false;
  let isTransitioning = false;
  const HALF_FADE_DURATION = 400; // 单次淡入/淡出时长，整体叠化 ~0.8s，更快

  /** @param {FileList} fileList */
  function collectVideos(fileList) {
    const result = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type) continue;
      if (file.type.startsWith("video/")) {
        result.push(file);
      }
    }
    return result;
  }

  /** 原地 shuffle */
  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function updateCounter() {
    if (!playlist.length || currentIndex < 0) {
      counterText.textContent = "";
      return;
    }
    counterText.textContent = `第 ${currentIndex + 1} / ${playlist.length} 个`;
  }

  /** @param {string} msg */
  function setStatus(msg) {
    statusText.textContent = msg;
  }

  function resetHalfState() {
    isRightHalf = false;
    viewport.classList.remove("is-right");
    // 默认显示左半，右半隐藏
    videoLeft.style.opacity = "1";
    videoRight.style.opacity = "0";
  }

  /** 加载并播放当前索引的视频 */
  function loadCurrent() {
    if (!playlist.length || currentIndex < 0 || currentIndex >= playlist.length) {
      return;
    }
    const file = playlist[currentIndex];
    const url = URL.createObjectURL(file);

    // 释放旧 URL（两层用同一个 src，所以释放其中一个即可）
    const oldSrc = videoLeft.src;
    if (oldSrc) URL.revokeObjectURL(oldSrc);

    resetHalfState();
    videoLeft.src = url;
    videoRight.src = url;
    videoLeft.currentTime = 0;
    videoRight.currentTime = 0;

    // 只使用左声道播放声音，右侧仅用于画面叠化，避免“两个声音”
    videoLeft.muted = false;
    videoRight.muted = true;

    // 尝试自动播放
    const p1 = videoLeft.play();
    const p2 = videoRight.play();
    Promise.allSettled([p1, p2]).then((results) => {
      const anyRejected = results.some((r) => r.status === "rejected");
      if (anyRejected) {
        setStatus(`正在加载：${file.name}（点击视频以开始播放）`);
      } else {
        setStatus(`正在播放：${file.name}`);
      }
    });
    updateCounter();
  }

  function gotoNext() {
    if (!playlist.length) return;
    if (currentIndex < playlist.length - 1) {
      currentIndex++;
      loadCurrent();
    } else {
      setStatus("已经是最后一个视频了");
    }
  }

  function gotoPrev() {
    if (!playlist.length) return;
    if (currentIndex > 0) {
      currentIndex--;
      loadCurrent();
    } else {
      setStatus("已经是第一个视频了");
    }
  }

  // 处理文件夹上传
  folderInput.addEventListener("change", (e) => {
    const target = e.target;
    if (!target.files) return;
    const files = collectVideos(target.files);

    if (!files.length) {
      playlist = [];
      currentIndex = -1;
      setStatus("所选文件夹中没有检测到视频文件");
      updateCounter();
      reshuffleBtn.disabled = true;
      return;
    }

    playlist = files;
    shuffleInPlace(playlist);
    currentIndex = 0;
    reshuffleBtn.disabled = false;
    setStatus(`已加载 ${playlist.length} 个视频（随机顺序）`);
    loadCurrent();
  });

  // 重新随机
  reshuffleBtn.addEventListener("click", () => {
    if (!playlist.length) return;
    shuffleInPlace(playlist);
    currentIndex = 0;
    setStatus(`已重新随机排序，共 ${playlist.length} 个视频`);
    loadCurrent();
  });

  // 点击视频区域：在默认 / “裸” 之间叠化切换（不负责播放/暂停）
  viewport.addEventListener("click", () => {
    if (!videoLeft.src || isTransitioning) return;
    isTransitioning = true;

    if (!isRightHalf) {
      // 从左半切到右半：先淡入右，再淡出左
      videoRight.style.opacity = "1";
      setTimeout(() => {
        videoLeft.style.opacity = "0";
        isRightHalf = true;
        isTransitioning = false;
      }, HALF_FADE_DURATION);
    } else {
      // 从右半切回左半：先淡入左，再淡出右
      videoLeft.style.opacity = "1";
      setTimeout(() => {
        videoRight.style.opacity = "0";
        isRightHalf = false;
        isTransitioning = false;
      }, HALF_FADE_DURATION);
    }
  });

  // 滚轮切换视频（类似抖音的上下滑）
  let wheelLock = false;
  const WHEEL_COOLDOWN = 300; // ms

  window.addEventListener(
    "wheel",
    (e) => {
      if (!playlist.length) return;
      // 只在主要内容区域高度范围内时响应，避免页面其它地方误触
      const rect = viewport.getBoundingClientRect();
      const y = e.clientY;
      if (y < rect.top || y > rect.bottom) return;

      if (wheelLock) return;
      wheelLock = true;
      setTimeout(() => {
        wheelLock = false;
      }, WHEEL_COOLDOWN);

      if (e.deltaY > 0) {
        // 向下滚动 -> 下一个
        gotoNext();
      } else if (e.deltaY < 0) {
        // 向上滚动 -> 上一个
        gotoPrev();
      }
    },
    { passive: true }
  );

  // 触摸滑动切换视频
  let touchStartY = 0;
  let touchEndY = 0;
  const SWIPE_THRESHOLD = 60;

  viewport.addEventListener(
    "touchstart",
    (e) => {
      if (!playlist.length) return;
      if (e.touches.length !== 1) return;
      touchStartY = e.touches[0].clientY;
      touchEndY = touchStartY;
    },
    { passive: true }
  );

  viewport.addEventListener(
    "touchmove",
    (e) => {
      if (!playlist.length) return;
      if (e.touches.length !== 1) return;
      touchEndY = e.touches[0].clientY;
    },
    { passive: true }
  );

  viewport.addEventListener(
    "touchend",
    () => {
      if (!playlist.length) return;
      const deltaY = touchEndY - touchStartY;
      if (Math.abs(deltaY) < SWIPE_THRESHOLD) {
        return;
      }
      if (deltaY < 0) {
        // 向上滑动 -> 下一个
        gotoNext();
      } else {
        // 向下滑动 -> 上一个
        gotoPrev();
      }
    },
    { passive: true }
  );

  // 播放结束时保持当前视频循环播放（不自动切到下一个）
  videoLeft.loop = true;
  videoRight.loop = true;

  // 同步两层时间与播放状态，保证叠化时画面一致
  function syncRightToLeft() {
    if (syncing) return;
    syncing = true;
    try {
      const drift = Math.abs(videoRight.currentTime - videoLeft.currentTime);
      if (drift > 0.08 && !Number.isNaN(videoLeft.currentTime)) {
        videoRight.currentTime = videoLeft.currentTime;
      }
      if (videoLeft.paused !== videoRight.paused) {
        if (videoLeft.paused) videoRight.pause();
        else videoRight.play();
      }
      // 右侧完全静音，仅做画面；避免听到两路声音
      videoRight.muted = true;
      videoRight.volume = 0;
    } finally {
      syncing = false;
    }
  }

  videoLeft.addEventListener("timeupdate", syncRightToLeft);
  videoLeft.addEventListener("play", syncRightToLeft);
  videoLeft.addEventListener("pause", syncRightToLeft);
})();


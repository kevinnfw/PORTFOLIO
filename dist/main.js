(function () {
  'use strict';

  const TOTAL_FRAMES = 240;

  // Optimasi pemuatan gambar, tanpa mengurangi resolusi.
  const MAX_CONCURRENT_LOADS = 6;
const PRELOAD_BEHIND = 12;
const PRELOAD_AHEAD = 36;

  const canvas = document.getElementById('animation-canvas');

  if (!canvas) return;

  const ctx = canvas.getContext('2d', {
    alpha: false
  });

  if (!ctx) return;

  const images = new Array(TOTAL_FRAMES);
  const loadedFlags = new Array(TOTAL_FRAMES).fill(false);
  const loadingFlags = new Array(TOTAL_FRAMES).fill(false);

  const loadQueue = new Set();

  let activeLoads = 0;
  let currentFrame = 0;
  let targetFrame = 0;
  let lastDrawnIndex = -1;
  let lastQueueCenter = -1;
  let lastTime = 0;
  let needsResize = true;

  let lenisInstance = null;

  function getFrameSrc(index) {
    const frameNumber = String(index + 1).padStart(3, '0');

    return `/frames/ezgif-frame-${frameNumber}.jpg`;
  }

  // Resolusi Canvas tetap mengikuti kode asli.
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const targetWidth = Math.round(window.innerWidth * dpr);
    const targetHeight = Math.round(window.innerHeight * dpr);

    if (
      canvas.width !== targetWidth ||
      canvas.height !== targetHeight
    ) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }


  function drawFrame(index) {
  // Jangan menggambar frame yang belum selesai dimuat.
  if (!loadedFlags[index]) return false;

  const img = images[index];

  if (!img || !img.naturalWidth || !img.naturalHeight) {
    return false;
  }

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  const canvasRatio = canvasWidth / canvasHeight;
  const imageRatio = img.naturalWidth / img.naturalHeight;

  let drawW, drawH, drawX, drawY;

  if (canvasRatio > imageRatio) {
    drawW = canvasWidth;
    drawH = canvasWidth / imageRatio;
    drawX = 0;
    drawY = (canvasHeight - drawH) / 2;
  } else {
    drawH = canvasHeight;
    drawW = canvasHeight * imageRatio;
    drawX = (canvasWidth - drawW) / 2;
    drawY = 0;
  }

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  // Tandai berhasil hanya jika gambar benar-benar digambar.
  return true;
}

  function pumpLoadQueue() {
    while (
      activeLoads < MAX_CONCURRENT_LOADS &&
      loadQueue.size > 0
    ) {
      let bestIndex = -1;
      let bestDistance = Infinity;

      // Selalu pilih frame yang paling dekat dengan posisi scroll.
      for (const index of loadQueue) {
        const distance = Math.abs(index - targetFrame);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }

      if (bestIndex === -1) break;

      loadQueue.delete(bestIndex);

      if (
        loadedFlags[bestIndex] ||
        loadingFlags[bestIndex]
      ) {
        continue;
      }

      loadingFlags[bestIndex] = true;
      activeLoads++;

      const img = new Image();

      img.decoding = 'async';

      img.onload = function () {
        images[bestIndex] = img;
        loadedFlags[bestIndex] = true;
        loadingFlags[bestIndex] = false;
        activeLoads--;
        pumpLoadQueue();
      };

      img.onerror = function () {
        loadingFlags[bestIndex] = false;
        activeLoads--;

        // Jangan terus-menerus mengulang gambar yang gagal.
        pumpLoadQueue();
      };

      img.src = getFrameSrc(bestIndex);
      images[bestIndex] = img;
    }
  }

  function updatePreloadQueue(center) {
    if (center === lastQueueCenter) return;

    lastQueueCenter = center;

    const start = Math.max(0, center - PRELOAD_BEHIND);
    const end = Math.min(
      TOTAL_FRAMES - 1,
      center + PRELOAD_AHEAD
    );

    // Buang antrean lama yang jauh dari posisi scroll saat ini.
    for (const index of loadQueue) {
      if (index < start || index > end) {
        loadQueue.delete(index);
      }
    }

    // Muat frame di sekitar posisi scroll, bukan 240 gambar sekaligus.
    for (let i = start; i <= end; i++) {
      if (!loadedFlags[i] && !loadingFlags[i]) {
        loadQueue.add(i);
      }
    }

    pumpLoadQueue();
  }

  // Pertahankan Lenis dan konfigurasi scroll yang sudah ada.
  if (typeof window.Lenis !== 'undefined') {
    lenisInstance = new window.Lenis({
      duration: 1.2,
      easing: (t) =>
        Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5
    });

    window.__lenis = lenisInstance;
  }

  window.addEventListener('resize', function () {
    needsResize = true;
  }, { passive: true });

  function render(time) {
    requestAnimationFrame(render);

    // Hindari pekerjaan render saat tab tidak terlihat.
    if (document.hidden) {
      lastTime = 0;
      return;
    }

    if (lenisInstance) {
      lenisInstance.raf(time);
    }

    if (needsResize) {
      resizeCanvas();
      needsResize = false;
      lastDrawnIndex = -1;
    }

    let currentScroll =
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      window.scrollY ||
      0;

    if (
      lenisInstance &&
      typeof lenisInstance.scroll === 'number'
    ) {
      currentScroll = lenisInstance.scroll;
    }

    const maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight -
      window.innerHeight
    );

    const progress = Math.max(
      0,
      Math.min(1, currentScroll / maxScroll)
    );

    targetFrame = progress * (TOTAL_FRAMES - 1);

    const targetIndex = Math.min(
      TOTAL_FRAMES - 1,
      Math.max(0, Math.round(targetFrame))
    );

    // Pemuatan gambar mengikuti posisi scroll terbaru.
    updatePreloadQueue(targetIndex);

    // Perhitungan smoothing berdasarkan waktu, bukan jumlah frame
    // monitor, sehingga gerakan lebih konsisten pada perangkat berbeda.
    const delta = lastTime
      ? Math.min(time - lastTime, 50)
      : 16.67;

    lastTime = time;

    // Sinkronkan frame langsung dengan posisi scroll.
currentFrame = targetFrame;

    const frameIndex = Math.min(
      TOTAL_FRAMES - 1,
      Math.max(0, Math.round(currentFrame))
    );

    
    // Perbarui indeks hanya jika frame berhasil digambar.
    // Jika belum siap, pertahankan gambar terakhir dan coba lagi.
    if (frameIndex !== lastDrawnIndex) {
      const didDraw = drawFrame(frameIndex);

      if (didDraw) {
        lastDrawnIndex = frameIndex;
      }
    }
  } // <-- Penutup function render(time)

  // Siapkan Canvas dan mulai dari frame awal.
  resizeCanvas();
  updatePreloadQueue(0);

  requestAnimationFrame(render);
})(); // <-- Penutup IIFE animasi pertama

/* -------------------------------------------------------------
   Globe Express Style Interactive Showcase Carousel Controller
   ------------------------------------------------------------- */
(function initShowcaseSlider() {
  const slider = document.getElementById('showcase-slider');
  if (!slider) return;

  const bgLayers = slider.querySelectorAll('.slider-bg');
  const tagEl = document.getElementById('slide-tag');
  const headlineEl = document.getElementById('slide-headline');
  const descEl = document.getElementById('slide-desc');
  const discoverBtn = slider.querySelector('.slider-cta-pill');
  const counterEl = document.getElementById('slide-counter');
  const progressBar = document.getElementById('slider-progress-bar');
  const prevBtn = document.getElementById('slide-prev');
  const nextBtn = document.getElementById('slide-next');
  const draggableWrapper = document.getElementById('cards-draggable-wrapper');
  const cards = slider.querySelectorAll('.showcase-card');

  const slidesData = [
    {
      tag: 'Experience',
      headline: 'BEM FIK -<br />PUBLIC RELATIONS',
      fontClass: 'font-slide-0',
      desc: "Served as an Expert Staff Member of the Public Relations Division at the Faculty of Computer Science Student Executive Board (BEM FILKOM). Responsible for managing the Content Plan work program, including content planning, scheduling, and organizing content materials using Google Sheets, as well as developing content concepts and visual designs using Figma to support the organization's communication and publication activities.",
      counter: '01',
    },
    {
      tag: 'INTERNSHIP DISKOMINFO SEMARANG',
      headline: 'WEBSITE REBRANDING<br />SMP N 44 SEMARANG',
      fontClass: 'font-slide-1',
      desc: 'Redesigned and rebranded the website of SMP Negeri 44 Semarang during an internship at Diskominfo Kota Semarang, focusing on improving the website’s visual identity, content presentation, and overall user experience.',
      counter: '02',
    },
    {
      tag: 'ENTREPRENEURSHIP · ACCOUNT MANAGEMENT',
      headline: 'ONLINE GAMING ACCOUNT BUSINESS',
      fontClass: 'font-slide-2',
      desc: 'Managed the Instagram account @cuangamestore for a Mobile Legends account-selling business, handling account listings, pricing, customer communication, negotiations, transactions, and post-sale support.',
      counter: '03',
    },
    {
      tag: 'FINANCIAL CONTENT · TIKTOK',
      headline: 'INDONESIAN STOCK INFORMATION',
      fontClass: 'font-slide-1',
      desc: 'Managed and developed the TikTok account @tosorvest.id, focused on Indonesian stocks, producing content around stock news, market updates, and financial information for retail investors.',
      counter: '04',
    },
  ];

  let currentIndex = 0;
  let isTransitioning = false;

  function activateSlide(index, smoothScrollToCard = true) {
    if (isTransitioning) return;
    isTransitioning = true;

    // Wrap-around index
    currentIndex = (index + slidesData.length) % slidesData.length;
    const currentData = slidesData[currentIndex];
    const experienceLinks = [
  'https://www.instagram.com/bemfdkkudinus/',
  'https://www.instagram.com/diskominfokotasemarang?exln=MTV4ZDZtbGJnMWdsag==',
  '#',
  'https://www.tiktok.com/@tosorvest.id?_r=1&_t=ZS-9AseEsWl9J1'
];

if (discoverBtn) {
  discoverBtn.href = experienceLinks[currentIndex];
  discoverBtn.target = '_blank';
  discoverBtn.rel = 'noopener noreferrer';
}

    // 1. Cross-fade Background
    bgLayers.forEach((bg) => {
      const bgIdx = parseInt(bg.getAttribute('data-bg-index'), 10);
      if (bgIdx === currentIndex) {
        bg.classList.add('is-active');
      } else {
        bg.classList.remove('is-active');
      }
    });

    // 2. Animate Left Headline, Font, Description & Tag
    if (headlineEl && descEl && tagEl && counterEl) {
      headlineEl.classList.add('is-animating');
      descEl.classList.add('is-animating');

      setTimeout(() => {
        tagEl.innerHTML = currentData.tag;
        headlineEl.innerHTML = currentData.headline;

        // Remove old font classes and add current font class
        headlineEl.classList.remove('font-slide-0', 'font-slide-1', 'font-slide-2', 'font-slide-3');
        headlineEl.classList.add(currentData.fontClass);

        descEl.innerHTML = currentData.desc;
        counterEl.textContent = currentData.counter;

        headlineEl.classList.remove('is-animating');
        descEl.classList.remove('is-animating');
        isTransitioning = false;
      }, 180);
    } else {
      isTransitioning = false;
    }

    // 3. Update Progress Bar
    if (progressBar) {
      const percentage = ((currentIndex + 1) / slidesData.length) * 100;
      progressBar.style.width = `${percentage}%`;
    }

    // 4. Update Active Card Class
    cards.forEach((card) => {
      const cIdx = parseInt(card.getAttribute('data-index'), 10);
      if (cIdx === currentIndex) {
        card.classList.add('is-active');
        if (smoothScrollToCard && draggableWrapper) {
          // Scroll card into view inside draggable wrapper
          const cardLeft = card.offsetLeft - draggableWrapper.offsetLeft;
          const targetScroll = cardLeft - (draggableWrapper.clientWidth / 2) + (card.clientWidth / 2);
          draggableWrapper.scrollTo({
            left: Math.max(0, targetScroll),
            behavior: 'smooth',
          });
        }
      } else {
        card.classList.remove('is-active');
      }
    });
  }

  // Prev / Next button listeners
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      activateSlide(currentIndex - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      activateSlide(currentIndex + 1);
    });
  }

  // -------------------------------------------------------------
  // Draggable / Scrollable Cards Track Logic
  // -------------------------------------------------------------
  if (draggableWrapper) {
    let isMouseDown = false;
    let startX = 0;
    let scrollStart = 0;
    let dragDistance = 0;

    draggableWrapper.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      dragDistance = 0;
      draggableWrapper.classList.add('is-dragging');
      startX = e.pageX - draggableWrapper.offsetLeft;
      scrollStart = draggableWrapper.scrollLeft;
    });

    window.addEventListener('mouseup', () => {
      if (isMouseDown) {
        isMouseDown = false;
        draggableWrapper.classList.remove('is-dragging');
      }
    });

    draggableWrapper.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      e.preventDefault();
      const currentX = e.pageX - draggableWrapper.offsetLeft;
      const walk = (currentX - startX) * 1.5;
      dragDistance += Math.abs(walk);
      draggableWrapper.scrollLeft = scrollStart - walk;
    });

    // Touch support for mobile / tablets
    let touchStartX = 0;
    let touchScrollStart = 0;

    draggableWrapper.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].pageX;
        touchScrollStart = draggableWrapper.scrollLeft;
      }
    }, { passive: true });

    draggableWrapper.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const currentTouchX = e.touches[0].pageX;
        const walk = (currentTouchX - touchStartX) * 1.2;
        draggableWrapper.scrollLeft = touchScrollStart - walk;
      }
    }, { passive: true });

    // Card click event listener (distinguishes drag vs click)
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        if (dragDistance > 10) return; // user dragged, don't trigger click
        const cardIndex = parseInt(card.getAttribute('data-index'), 10);
        activateSlide(cardIndex);
      });
    });
  }
})();

/* -------------------------------------------------------------
   BEM FIK (Now BEM FDKK) Showcase Scroller Controller
   Interactive mouse drag, touch swipe, prev/next buttons & drag pill
   ------------------------------------------------------------- */
(function initBemWorksScroller() {
  const wrapper = document.getElementById('bem-scroller-wrapper');
  const track = document.getElementById('bem-track');
  const prevBtn = document.getElementById('bem-prev-btn');
  const nextBtn = document.getElementById('bem-next-btn');
  const dragPill = document.getElementById('bem-drag-pill');
  if (!wrapper || !track) return;

  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let hasDragged = false;

  const startDrag = (e) => {
    isDown = true;
    hasDragged = false;
    wrapper.classList.add('is-dragging');
    startX = e.pageX - wrapper.offsetLeft;
    scrollLeft = wrapper.scrollLeft;
  };

  const endDrag = () => {
    if (isDown) {
      isDown = false;
      wrapper.classList.remove('is-dragging');
    }
  };

  const moveDrag = (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - wrapper.offsetLeft;
    const walk = (x - startX) * 1.6;
    if (Math.abs(walk) > 6) hasDragged = true;
    wrapper.scrollLeft = scrollLeft - walk;
  };

  wrapper.addEventListener('mousedown', startDrag);
  if (dragPill) {
    dragPill.addEventListener('mousedown', startDrag);
  }

  window.addEventListener('mouseup', endDrag);
  wrapper.addEventListener('mousemove', moveDrag);

  // Prev / Next scroll buttons
  const scrollStep = 340; // width of card + gap
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      wrapper.scrollBy({ left: -scrollStep, behavior: 'smooth' });
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      wrapper.scrollBy({ left: scrollStep, behavior: 'smooth' });
    });
  }

  // Prevent link click when user was dragging
  wrapper.querySelectorAll('.btn-bem-discover').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
      }
    });
  });

  // Touch handling
  let touchStartX = 0;
  let touchScrollLeft = 0;

  wrapper.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].pageX;
      touchScrollLeft = wrapper.scrollLeft;
      hasDragged = false;
    }
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const touchX = e.touches[0].pageX;
      const walk = (touchX - touchStartX) * 1.3;
      if (Math.abs(walk) > 8) hasDragged = true;
      wrapper.scrollLeft = touchScrollLeft - walk;
    }
  }, { passive: true });
})();

/* -------------------------------------------------------------
   Projects Section: Editorial Kinetic Typography & 3D Floating Cards
   ------------------------------------------------------------- */
(function initProjectsMotionDesign() {
  const kineticHeader = document.getElementById('projects-kinetic-header');
  const titleStage = document.getElementById('kinetic-title-stage');
  const solidLayer = titleStage ? titleStage.querySelector('.layer-solid') : null;
  const outlineLayer = titleStage ? titleStage.querySelector('.layer-outline') : null;

  const scroller = document.getElementById('h-cards-scroller');
  const prevBtn = document.getElementById('h-card-prev');
  const nextBtn = document.getElementById('h-card-next');
  if (!scroller) return;

  const cards = Array.from(scroller.querySelectorAll('.h-card'));

  // 1. Kinetic Typography Entry Trigger & Parallax
  if (kineticHeader) {
    const headerObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            kineticHeader.classList.add('is-in-view');
          }
        });
      },
      { threshold: 0.15 }
    );
    headerObserver.observe(kineticHeader);
  }

  // 2. Card Entry Animation with Small Stagger
  const cardObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          cards.forEach((card, idx) => {
            setTimeout(() => {
              card.classList.add('is-revealed');
            }, idx * 90);
          });
          cardObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  cardObserver.observe(scroller);

  // 3. Fan Deck Cluster Motion System (Matching Reference Image & Video)
  // Cards fan out over compass dial: center card is upright & elevated, flanking cards fan left & right
  const compassDialSvg = document.querySelector('.compass-dial-svg');

  const cardStates = cards.map(() => ({
    isHovered: false,
    tiltX: 0,
    tiltY: 0,
  }));

  // Desktop Cursor 3D Tilt
  const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (isFinePointer) {
    cards.forEach((card, idx) => {
      card.addEventListener('mouseenter', () => {
        cardStates[idx].isHovered = true;
      });

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const normX = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        const normY = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
        cardStates[idx].tiltX = -normY * 6;
        cardStates[idx].tiltY = normX * 6;
      });

      card.addEventListener('mouseleave', () => {
        cardStates[idx].isHovered = false;
        cardStates[idx].tiltX = 0;
        cardStates[idx].tiltY = 0;
      });
    });
  }

  // 4. Interactive Card Fan System
  let activeFloatIndex = 2; // Default active card (Card 2 center front)
  let targetIndex = 2;
  let isUserInteracting = false;
  let lastInteractionTime = 0;

  // Click card to bring to center front
  cards.forEach((card, idx) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.h-card-link') || e.target.closest('.h-card-arrow')) {
        return; // Allow direct link navigation
      }
      targetIndex = idx;
      lastInteractionTime = performance.now();
    });
  });

  // Fan Deck Animation Loop
  function updateFloatingCards(time) {
    // Smooth damping towards target index
    activeFloatIndex += (targetIndex - activeFloatIndex) * 0.085;

    // Check if user hovered any card
    const anyHovered = cardStates.some((s) => s.isHovered);

    // Continuous smooth idle sway matching Pinterest video reference
    let idleSway = 0;
    if (!anyHovered && !isUserInteracting && performance.now() - lastInteractionTime > 800) {
      idleSway = Math.sin(time * 0.0013) * 4.2; // degrees
    }

    // Responsive spread calculations
    const isMobile = window.innerWidth <= 768;
    const spreadX = isMobile ? 110 : 165;
    const spreadAngle = isMobile ? 14 : 18.5;
    const apexLift = isMobile ? -20 : -28;

    cards.forEach((card, idx) => {
      if (!card.classList.contains('is-revealed')) return;

      const state = cardStates[idx];
      // Offset relative to active center card
      const offset = idx - activeFloatIndex;
      const absOff = Math.abs(offset);
      const sign = Math.sign(offset) || 1;

      // Base rotation along the fan arc plus gentle idle sway
      const baseRotZ = (offset * spreadAngle) + idleSway;

      // Horizontal fan displacement
      const tx = sign * Math.pow(absOff, 0.94) * spreadX;

      // Vertical arc drop + elevated center card
      const curveY = Math.pow(absOff, 1.45) * (isMobile ? 22 : 30);
      const lift = absOff < 0.85 ? (1 - absOff / 0.85) * apexLift : 0;
      const ty = curveY + lift;

      // Scale & Depth
      const scale = Math.max(0.78, 1.05 - absOff * 0.06);
      const depth = Math.max(0, 24 - absOff * 5);

      // Center card has highest zIndex and crisp opacity
      const zIndex = Math.round(40 - absOff * 5);
      const opacity = Math.max(0.45, 1 - absOff * 0.15);

      card.style.zIndex = zIndex;
      card.style.opacity = opacity;

      if (absOff < 0.45) {
        card.classList.add('is-center-focus');
      } else {
        card.classList.remove('is-center-focus');
      }

      if (state.isHovered && isFinePointer) {
        // Desktop cursor hover tilt
        card.style.transform = `translate3d(${tx.toFixed(1)}px, ${(ty - 16).toFixed(1)}px, 45px) scale(${(scale * 1.03).toFixed(3)}) rotateX(${state.tiltX.toFixed(2)}deg) rotateY(${state.tiltY.toFixed(2)}deg) rotateZ(${(baseRotZ * 0.3).toFixed(2)}deg)`;
      } else {
        card.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, ${depth.toFixed(1)}px) scale(${scale.toFixed(3)}) rotateZ(${baseRotZ.toFixed(2)}deg)`;
      }
    });

    // Synchronize compass dial rotation with card motion (matching reference video)
    if (compassDialSvg) {
      const dialAngle = -(activeFloatIndex * 26 + idleSway * 1.5);
      compassDialSvg.style.transform = `rotate(${dialAngle.toFixed(2)}deg)`;
    }

    requestAnimationFrame(updateFloatingCards);
  }

  requestAnimationFrame(updateFloatingCards);

  // 5. Arrow Controls: Step through cards in the fan
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      targetIndex = Math.max(0, Math.round(targetIndex) - 1);
      lastInteractionTime = performance.now();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      targetIndex = Math.min(cards.length - 1, Math.round(targetIndex) + 1);
      lastInteractionTime = performance.now();
    });
  }

  // 6. Drag-to-Rotate Fan Deck
  let isDown = false;
  let startX = 0;
  let startIndex = 0;

  scroller.addEventListener('mousedown', (e) => {
    if (e.target.closest('.h-card-link') || e.target.closest('.h-card-arrow')) return;
    isDown = true;
    isUserInteracting = true;
    scroller.classList.add('is-dragging');
    startX = e.pageX;
    startIndex = targetIndex;
    lastInteractionTime = performance.now();
  });

  window.addEventListener('mouseup', () => {
    if (isDown) {
      isDown = false;
      isUserInteracting = false;
      scroller.classList.remove('is-dragging');
      targetIndex = Math.round(targetIndex);
      targetIndex = Math.max(0, Math.min(cards.length - 1, targetIndex));
      lastInteractionTime = performance.now();
    }
  });

  scroller.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const deltaX = e.pageX - startX;
    targetIndex = startIndex - (deltaX / 140);
    targetIndex = Math.max(-0.4, Math.min(cards.length - 0.6, targetIndex));
    lastInteractionTime = performance.now();
  });

  // Touch drag support for mobile
  let touchStartX = 0;
  let touchStartIndex = 0;

  scroller.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isUserInteracting = true;
      touchStartX = e.touches[0].pageX;
      touchStartIndex = targetIndex;
      lastInteractionTime = performance.now();
    }
  }, { passive: true });

  scroller.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const deltaX = e.touches[0].pageX - touchStartX;
      targetIndex = touchStartIndex - (deltaX / 110);
      targetIndex = Math.max(-0.4, Math.min(cards.length - 0.6, targetIndex));
      lastInteractionTime = performance.now();
    }
  }, { passive: true });

  scroller.addEventListener('touchend', () => {
    isUserInteracting = false;
    targetIndex = Math.round(targetIndex);
    targetIndex = Math.max(0, Math.min(cards.length - 1, targetIndex));
    lastInteractionTime = performance.now();
  });
})();

// =============================================================
// =============================================================
// 3D MOTION GRAPHICS ANIMATION: CERTIFICATIONS CAROUSEL
// Continuous 3D Circular Orbit Ring with Perspective & Depth
// Motion Graphic rotation with Card Selection Zoom & Pause/Resume
// =============================================================
(function initCertificationsCarousel() {
  const ring = document.getElementById('cert-carousel-ring');
  const stage = document.getElementById('cert-carousel-stage');
  const viewport = document.getElementById('cert-viewport');
  const section = document.getElementById('certifications');
  const btnPrev = document.getElementById('cert-btn-prev');
  const btnNext = document.getElementById('cert-btn-next');
  const mobilePrev = document.getElementById('cert-mobile-prev');
  const mobileNext = document.getElementById('cert-mobile-next');
  const dragControls = document.getElementById('cert-drag-controls');
  const dragPill = document.getElementById('cert-drag-pill');

  if (!ring || !stage) return;

  const cardSlots = Array.from(document.querySelectorAll('.cert-card-slot'));
  const totalCards = cardSlots.length || 10;
  const angleStep = 360 / totalCards;

  let currentAngle = 0;
  const rotationSpeed = 0.22; // Smooth cinematic motion graphic speed
  const TILT_Z = 7;   // Miring ke arah kanan bawah persis gambar referensi
  const TILT_X = -17; // Perspektif kamera menunduk 3D
  let isPaused = false;
  let isDragging = false;
  let zoomedCard = null;
  let animFrameId = null;

  let startX = 0;
  let lastX = 0;
  let dragVelocity = 0;
  let dragDistance = 0;

  // Helper for applying 3D transform with slant tilt
  function updateRingTransform(angle) {
    ring.style.transform = `rotateZ(${TILT_Z}deg) rotateX(${TILT_X}deg) rotateY(${angle}deg)`;
  }

  // 1. Continuous 3D Motion Graphic Loop
  function tick() {
    if (!isPaused && !isDragging) {
      currentAngle = (currentAngle + rotationSpeed) % 360;
      updateRingTransform(currentAngle);
    }
    animFrameId = requestAnimationFrame(tick);
  }
  animFrameId = requestAnimationFrame(tick);

  // Smooth ease-out animation to target angle
  function smoothRotateTo(targetAngle, duration = 480, onComplete) {
    const start = currentAngle;
    const change = targetAngle - start;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Quintic ease out for snappy, elegant deceleration
      const ease = 1 - Math.pow(1 - progress, 4);

      currentAngle = start + change * ease;
      updateRingTransform(currentAngle);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        currentAngle = targetAngle % 360;
        updateRingTransform(currentAngle);
        if (onComplete) onComplete();
      }
    }
    requestAnimationFrame(step);
  }

  // 2. Zoom In on Selected Card & Pause Rotation
  function selectAndZoomCard(slot, index) {
    // If clicking the already zoomed card, toggle it off and resume
    if (zoomedCard === slot) {
      deselectCard();
      return;
    }

    // If another card is zoomed, deselect it first
    if (zoomedCard && zoomedCard !== slot) {
      zoomedCard.classList.remove('is-zoomed');
    }

    // Freeze motion graphic rotation immediately
    isPaused = true;
    zoomedCard = slot;
    stage.classList.add('has-zoomed-card');
    slot.classList.add('is-zoomed');

    // Automatically hide drag/swipe button temporarily while certificate is selected
    if (dragControls) {
      dragControls.classList.add('is-hidden');
    }

    // Calculate shortest angular rotation to face the viewer directly
    const slotAngle = index * angleStep;
    const baseTarget = -slotAngle;
    const diff = Math.round((currentAngle - baseTarget) / 360);
    const targetAngle = baseTarget + (diff * 360);

    // Smoothly rotate the ring so the zoomed card faces front
    smoothRotateTo(targetAngle, 450);
  }

  // 3. Deselect Card, Animate Zoom Out, and Resume Motion Graphic
  function deselectCard() {
    if (!zoomedCard) return;

    zoomedCard.classList.remove('is-zoomed');
    stage.classList.remove('has-zoomed-card');
    zoomedCard = null;

    // Restore drag/swipe button when certificate is deselected
    if (dragControls) {
      dragControls.classList.remove('is-hidden');
    }

    // Small delay for zoom-out transition before resuming rotation
    setTimeout(() => {
      isPaused = false;
    }, 280);
  }

  // Certificate Fullscreen Modal Handler for 100% Crisp Resolution
  const certModal = document.getElementById('cert-modal');
  const certModalImg = document.getElementById('cert-modal-img');
  const certModalOrg = document.getElementById('cert-modal-org');
  const certModalTitle = document.getElementById('cert-modal-title');
  const certModalDesc = document.getElementById('cert-modal-desc');
  const certModalId = document.getElementById('cert-modal-id');
  const certModalClose = document.getElementById('cert-modal-close');
  const certModalBackdrop = document.getElementById('cert-modal-backdrop');

  function openCertModal(slot) {
    if (!certModal) return;
    const imgEl = slot.querySelector('.cert-image');
    const orgEl = slot.querySelector('.cert-badge-org');
    const titleEl = slot.querySelector('.cert-card-title');
    const descEl = slot.querySelector('.cert-card-desc');
    const idEl = slot.querySelector('.cert-cred-id');

    if (certModalImg && imgEl) {
      certModalImg.src = imgEl.src;
      certModalImg.alt = imgEl.alt || 'Certificate Preview';
    }
    if (certModalOrg && orgEl) certModalOrg.textContent = orgEl.textContent;
    if (certModalTitle && titleEl) certModalTitle.textContent = titleEl.textContent;
    if (certModalDesc && descEl) certModalDesc.textContent = descEl.textContent;
    if (certModalId && idEl) certModalId.textContent = idEl.textContent;

    certModal.classList.add('is-open');
    certModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Ensure drag/swipe button is hidden while modal is open
    if (dragControls) {
      dragControls.classList.add('is-hidden');
    }
  }

  function closeCertModal() {
    if (!certModal) return;
    certModal.classList.remove('is-open');
    certModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Restore drag/swipe button only if no certificate is currently zoomed
    if (!zoomedCard && dragControls) {
      dragControls.classList.remove('is-hidden');
    }
  }

  if (certModalClose) {
    certModalClose.addEventListener('click', closeCertModal);
  }
  if (certModalBackdrop) {
    certModalBackdrop.addEventListener('click', closeCertModal);
  }

  // Card click interaction
  cardSlots.forEach((slot, idx) => {
    slot.addEventListener('click', (e) => {
      // If user was dragging significantly, ignore click
      if (dragDistance > 8) return;

      const verifyLink = e.target.closest('.cert-verify-link');
      if (verifyLink) {
        e.stopPropagation();
        openCertModal(slot);
        return;
      }

      e.stopPropagation();
      selectAndZoomCard(slot, idx);
    });
  });

  // Click outside to deselect card and resume rotation
  if (section) {
    section.addEventListener('click', (e) => {
      if (zoomedCard && !e.target.closest('.cert-card-slot')) {
        deselectCard();
      }
    });
  }

  // Also allow pressing ESC key to deselect card or close modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (certModal && certModal.classList.contains('is-open')) {
        closeCertModal();
        return;
      }
      if (zoomedCard) {
        deselectCard();
      }
    }
  });

  // 4. Drag & Swipe Interaction
  function startDrag(clientX) {
    isDragging = true;
    startX = clientX;
    lastX = clientX;
    dragVelocity = 0;
    dragDistance = 0;
    stage.classList.add('is-dragging');
    if (dragControls) dragControls.classList.add('is-dragging');
  }

  function moveDrag(clientX) {
    if (!isDragging) return;
    const deltaX = clientX - lastX;
    dragDistance += Math.abs(deltaX);
    dragVelocity = deltaX * 0.35;
    currentAngle += deltaX * 0.35;
    lastX = clientX;
    updateRingTransform(currentAngle);
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    stage.classList.remove('is-dragging');
    if (dragControls) dragControls.classList.remove('is-dragging');

    // If card was zoomed and user dragged, deselect it
    if (dragDistance > 12 && zoomedCard) {
      deselectCard();
    }

    // Apply smooth inertia release
    let inertiaFrames = 0;
    function applyInertia() {
      if (Math.abs(dragVelocity) > 0.05 && inertiaFrames < 25 && !isPaused) {
        currentAngle += dragVelocity;
        dragVelocity *= 0.92;
        updateRingTransform(currentAngle);
        inertiaFrames++;
        requestAnimationFrame(applyInertia);
      }
    }
    applyInertia();
  }

  stage.addEventListener('mousedown', (e) => {
    if (e.target.closest('.cert-verify-link')) return;
    startDrag(e.clientX);
  });

  if (dragControls) {
    dragControls.addEventListener('mousedown', (e) => {
      if (e.target.closest('.cert-drag-nav-btn')) return;
      startDrag(e.clientX);
    });

    dragControls.addEventListener('touchstart', (e) => {
      if (e.target.closest('.cert-drag-nav-btn')) return;
      if (e.touches.length === 1) {
        startDrag(e.touches[0].clientX);
      }
    }, { passive: true });
  }

  if (dragPill) {
    dragPill.addEventListener('click', () => {
      if (dragDistance > 8) return;
      stepCarousel(1);
    });

    dragPill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        stepCarousel(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepCarousel(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepCarousel(1);
      }
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      moveDrag(e.clientX);
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      endDrag();
    }
  });

  // Touch support for both stage & window
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      startDrag(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches.length === 1) {
      moveDrag(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isDragging) {
      endDrag();
    }
  });

  // 5. Navigation Buttons (Prev / Next)
  function stepCarousel(dir) {
    if (zoomedCard) {
      deselectCard();
    }
    isPaused = true;
    const targetAngle = currentAngle + (dir * angleStep);
    smoothRotateTo(targetAngle, 400, () => {
      isPaused = false;
    });
  }

  const prevButtons = [btnPrev, mobilePrev].filter(Boolean);
  prevButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      stepCarousel(-1);
    });
  });

  const nextButtons = [btnNext, mobileNext].filter(Boolean);
  nextButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      stepCarousel(1);
    });
  });
})();

/* -------------------------------------------------------------
   Contact Form Handler (Sends inquiry to kevinfarell1958@gmail.com)
   ------------------------------------------------------------- */
(function initContactForm() {
  const form = document.getElementById('contact-form');
  const submitBtn = document.getElementById('contact-submit-btn');
  const statusEl = document.getElementById('form-status');
  const subjectHidden = document.getElementById('form-subject-hidden');

  if (!form || !submitBtn || !statusEl) return;

  const inquirySelect = document.getElementById('user-inquiry');
  const nameInput = document.getElementById('user-name');

  function updateSubject() {
    const inquiry = inquirySelect && inquirySelect.value ? inquirySelect.value : 'Inquiry';
    const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Visitor';
    if (subjectHidden) {
      subjectHidden.value = `[Portfolio Contact] ${inquiry} from ${name}`;
    }
  }

  if (inquirySelect) inquirySelect.addEventListener('change', updateSubject);
  if (nameInput) nameInput.addEventListener('input', updateSubject);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    updateSubject();

    const originalBtnContent = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <span class="btn-spinner"></span>
      <span class="btn-text">SENDING MESSAGE...</span>
    `;

    statusEl.style.display = 'none';
    statusEl.className = 'form-status-alert';
    statusEl.innerHTML = '';

    const formData = new FormData(form);
    const dataObj = {};
    formData.forEach((value, key) => {
      dataObj[key] = value;
    });

    try {
      const response = await fetch('https://formsubmit.co/ajax/kevinfarell1958@gmail.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(dataObj)
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok || result.success === "true" || result.success === true) {
        statusEl.className = 'form-status-alert is-success';
        statusEl.innerHTML = `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <div>
            <strong>Message Sent Successfully!</strong><br />
            Thank you, your inquiry has been sent to kevinfarell1958@gmail.com. I will get back to you shortly.
          </div>
        `;
        statusEl.style.display = 'flex';
        form.reset();
      } else {
        throw new Error(result.message || 'Submission error');
      }
    } catch (err) {
      console.warn('Form submission notice:', err);
      // Fallback: mailto link
      const email = 'kevinfarell1958@gmail.com';
      const subject = encodeURIComponent(subjectHidden ? subjectHidden.value : 'Portfolio Contact');
      const body = encodeURIComponent(
        `Name: ${dataObj.name || ''}\n` +
        `Email: ${dataObj.email || ''}\n` +
        `Company / Organization: ${dataObj.company || ''}\n` +
        `Inquiry Type: ${dataObj.inquiry_type || ''}\n\n` +
        `Message:\n${dataObj.message || ''}`
      );
      const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

      statusEl.className = 'form-status-alert is-error';
      statusEl.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <strong>Connection notice:</strong> Could not connect to the form gateway automatically.<br />
          <a href="${mailtoUrl}" target="_blank" style="color: #38bdf8; font-weight: 700; text-decoration: underline;">Click here to send directly to kevinfarell1958@gmail.com</a>
        </div>
      `;
      statusEl.style.display = 'flex';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnContent;
    }
  });
})();

/* -------------------------------------------------------------
   Website Opening Video Animation Preloader Controller
   Strictly video animation only (No extra elements) - High performance
   ------------------------------------------------------------- */
(function initOpeningAnimation() {
  const preloader = document.getElementById('site-preloader');
  const desktopVideo = document.getElementById('preloader-video-desktop');
  const mobileVideo = document.getElementById('preloader-video-mobile');

  if (!preloader) {
    document.body.classList.remove('is-loading');
    if (window.__lenis) {
      try { window.__lenis.start(); } catch (e) { }
    }
    return;
  }

  // Ensure Lenis scroll is paused while preloader is visible
  if (window.__lenis) {
    try {
      window.__lenis.stop();
    } catch (e) { }
  }

  const isMobile = window.innerWidth <= 768;
  const activeVideo = isMobile ? mobileVideo : desktopVideo;
  const inactiveVideo = isMobile ? desktopVideo : mobileVideo;

  if (inactiveVideo) {
    try {
      inactiveVideo.pause();
      inactiveVideo.preload = 'none';
    } catch (e) { }
  }

  // Try playing active video immediately with hardware acceleration
  if (activeVideo) {
    activeVideo.muted = true;
    activeVideo.defaultMuted = true;
    activeVideo.playsInline = true;
    const playPromise = activeVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => { });
    }
  }

  let completed = false;
  function finishPreloader() {
    if (completed) return;
    completed = true;

    preloader.classList.add('is-hidden');
    document.body.classList.remove('is-loading');

    if (window.__lenis) {
      try {
        window.__lenis.start();
      } catch (e) { }
    }

    setTimeout(() => {
      preloader.style.display = 'none';
      if (desktopVideo) try { desktopVideo.pause(); } catch (e) { }
      if (mobileVideo) try { mobileVideo.pause(); } catch (e) { }
    }, 650);
  }

  if (activeVideo) {
    activeVideo.addEventListener('ended', finishPreloader, { once: true });

    // Smoothly finish right as the video completes playback
    activeVideo.addEventListener('timeupdate', function onTimeUpdate() {
      if (activeVideo.duration > 0 && activeVideo.currentTime >= (activeVideo.duration - 0.08)) {
        activeVideo.removeEventListener('timeupdate', onTimeUpdate);
        finishPreloader();
      }
    });
  }

  // Safety fallback: guaranteed dismissal if video stream completes or delays
  setTimeout(finishPreloader, 2300);
})();
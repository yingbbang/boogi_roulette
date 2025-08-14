<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>이미지 룰렛 (PNG 화살표)</title>
<style>
  :root { --max-size: 720px; --min-size: 280px; }
  body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;gap:14px;margin:20px}
  #stage{position:relative}
  canvas{display:block;background:#f6f6fb;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.12)}
  #controls{display:flex;gap:8px;align-items:center;justify-content:center}
  button{padding:10px 16px;font-weight:700;border:0;border-radius:8px;background:#3949ab;color:#fff;cursor:pointer}
  button:disabled{opacity:.5;cursor:not-allowed}
  #toast{display:none;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
         background:#222;color:#fff;padding:10px 14px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);font-weight:700}
  /* 로더용 이미지 숨김 */
  .asset{display:none}
</style>
</head>
<body>
  <h1 style="margin:0">이미지 룰렛 (16칸)</h1>

  <!-- 로더용 이미지 (캔버스에 drawImage로만 사용) -->
  <img id="imgBase"    class="asset" src="base.png" alt="">
  <img id="imgWheel"   class="asset" src="roulette.png" alt="">
  <img id="imgPointer" class="asset" src="pointer.png" alt="">

  <div id="stage">
    <canvas id="wheel"></canvas>
  </div>

  <div id="controls">
    <button id="spinBtn">SPIN</button>
  </div>

  <div id="toast"></div>

<script>
(() => {
  const canvas = document.getElementById('wheel');
  const ctx = canvas.getContext('2d');
  const spinBtn = document.getElementById('spinBtn');
  const toast = document.getElementById('toast');

  const imgBase = document.getElementById('imgBase');
  const imgWheel = document.getElementById('imgWheel');
  const imgPointer = document.getElementById('imgPointer');

  // 12시가 경계(true) / 중앙(false)
  const IS_TOP_IS_BOUNDARY = true;

  // ▼ 룰렛 텍스트 (12시부터 시계방향)
  const segments = [
    '100', '쿠폰', '300', '500',
    '100', '아이템', '200', '꽝',
    '300', '쿠폰', '100', '500',
    '200', '아이템', '100', '300'
  ];
  const SEG_COUNT = segments.length;         // 16
  const SEG_ANGLE = (Math.PI * 2) / SEG_COUNT;

  // 반응형 & DPR 스케일
  function fitCanvas() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    // 상하 여백, 컨트롤 영역 고려(대략)
    const controlsH = document.getElementById('controls').offsetHeight || 96;
    const sizeCss = Math.min(vw - 24, vh - controlsH - 40);
    const size = Math.max(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--min-size')) || 280,
                  Math.min(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--max-size')) || 720,
                           sizeCss));

    canvas.style.width = `${Math.floor(size)}px`;
    canvas.style.height = `${Math.floor(size)}px`;
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 좌표계를 CSS px 기준으로
    draw(); // 리사이즈 후 재그리기
  }
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('orientationchange', fitCanvas);

  // 회전 상태
  let angle = 0;        // 현재 각도(rad)
  let spinning = false;

  // 이징 함수 (easeOutCubic)
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // 승리 판정: 포인터는 12시 고정 → 각도(angle)로 12시가 가리키는 칸 계산
  function getWinningIndex(rad) {
    const twoPI = Math.PI * 2;
    let a = rad % twoPI;
    if (a < 0) a += twoPI;

    // 0rad가 canvas의 3시 → 12시는 -90도 오프셋
    let offset = -Math.PI / 2;
    // roulette.png가 12시에 '경계'라면 중앙 보정을 위해 +SEG_ANGLE/2
    if (IS_TOP_IS_BOUNDARY) offset += SEG_ANGLE / 2;

    let adj = a + offset;
    if (adj < 0) adj += twoPI;

    const idx = Math.floor(adj / SEG_ANGLE) % SEG_COUNT;
    return idx;
  }

  function showToast(text) {
    toast.textContent = text;
    toast.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.style.display = 'none'), 1800);
  }

  // 메인 드로우: base 고정 → wheel 회전 → pointer 맨 위(12시)
  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    // 바닥판(base)
    drawCenteredImage(imgBase, cx, cy, w, h);

    // 룰렛판(회전)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    drawCenteredImage(imgWheel, 0, 0, w, h, /*isTranslated*/true);
    ctx.restore();

    // 포인터(pointer) - 12시 위치, 상단 중앙
    // 폭 = 캔버스 폭의 18% (필요시 0.12~0.22 범위 조정)
    const pointerWidth = w * 0.22;
    const pointerRatio = imgPointer.naturalHeight / Math.max(1, imgPointer.naturalWidth);
    const ph = pointerWidth * (pointerRatio || 1);
    const px = cx - pointerWidth / 2;
    // 약간 겹치며 내려오도록 - (ph*0.02). 더 밀착하려면 숫자 ↑
    const py = cy - (h / 2) - (ph * 0.02);

    if (imgPointer.complete && imgPointer.naturalWidth > 0) {
      ctx.drawImage(imgPointer, px, py, pointerWidth, ph);
    }

    // 중앙 허브(심미용)
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(6, w*0.03), 0, Math.PI*2);
    ctx.fillStyle = '#3949ab'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, w*0.008), 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();

    // 디버그용(원형 가이드)
    // ctx.beginPath(); ctx.arc(cx, cy, w/2, 0, Math.PI*2);
    // ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.stroke();
  }

  function drawCenteredImage(img, cx, cy, w, h, isTranslated=false) {
    if (!img.complete || img.naturalWidth === 0) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const size = Math.min(w, h);
    const scale = size / Math.max(iw, ih);
    const dw = iw * scale;
    const dh = ih * scale;

    if (isTranslated) {
      ctx.drawImage(img, -dw/2, -dh/2, dw, dh);
    } else {
      ctx.drawImage(img, cx - dw/2, cy - dh/2, dw, dh);
    }
  }

  // 스핀 동작
  function spin() {
    if (spinning) return;
    spinning = true;
    spinBtn.disabled = true;

    // 타겟 세그먼트 랜덤 선택
    const targetIdx = Math.floor(Math.random() * SEG_COUNT);

    // 해당 세그먼트가 12시에 오도록 각도 계산
    const current = angle;
    const twoPI = Math.PI * 2;
    const baseTurn = twoPI * (5 + Math.floor(Math.random() * 2)); // 5~6바퀴

    // 12시 보정각: 중앙 기준은 +π/2, 경계 기준이면 +π/2 + SEG_ANGLE/2
    const topOffset = IS_TOP_IS_BOUNDARY ? (Math.PI/2 + SEG_ANGLE/2) : (Math.PI/2);
    const targetAngleAtTop = targetIdx * SEG_ANGLE + topOffset;

    // 목표 각도 = 기본 여러 바퀴 + (목표 세그먼트 정렬) - 현재 각도
    let delta = baseTurn + targetAngleAtTop - (current % twoPI);

    // 한 칸 내 미세 랜덤(±5도)
    const jitter = (Math.random() * (Math.PI / 36)) - (Math.PI / 72);
    delta += jitter;

    const duration = 2600 + Math.random() * 800; // 2.6~3.4초
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      angle = current + delta * easeOutCubic(t);
      draw();
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // 최종 승리 인덱스 판정
        const winIdx = getWinningIndex(angle);
        const prize = segments[winIdx];
        showToast(`당첨: ${prize}`);
        spinning = false;
        spinBtn.disabled = false;
      }
    }
    requestAnimationFrame(tick);
  }

  // 이미지 로드 후 시작
  Promise.all([
    new Promise(res => imgBase.complete    ? res() : imgBase.addEventListener('load', res, {once:true})),
    new Promise(res => imgWheel.complete   ? res() : imgWheel.addEventListener('load', res, {once:true})),
    new Promise(res => imgPointer.complete ? res() : imgPointer.addEventListener('load', res, {once:true})),
  ]).then(() => {
    fitCanvas();
    draw();
  });

  spinBtn.addEventListener('click', spin);
  // 모바일 뷰포트 변동 대응
  window.addEventListener('resize', () => setTimeout(fitCanvas, 50));
})();
</script>
</body>
</html>

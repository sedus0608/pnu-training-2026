/**
 * 2026 부산대학교 직무연수 카탈로그 - 공통 앱 스크립트 (app.js)
 * 구글 시트 GVIZ CSV 실시간 연동, PapaParse 파싱, 다차원 검색/필터링
 */

// 구글 시트 엔드포인트 설정
const SHEET_CONFIG = {
  sheetId: '13zZyhH-Tgfv3i1961h39Cjds2HmVEo1k',
  gid: '894119997',
  get gvizUrl() {
    return `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:csv&gid=${this.gid}&headers=1&_t=${Date.now()}`;
  },
  fallbackJsonUrl: 'data-fallback.json'
};

// 앱 상태 관리
const AppState = {
  courses: [],
  filteredCourses: [],
  isLoading: true,
  syncSource: 'connecting', // 'live-sheet' | 'fallback'
  filters: {
    keyword: '',
    type: 'all',     // 'all' | '필수' | '권장' | '선택'
    field: 'all',    // 분야
    method: 'all',   // 교육방식
    target: 'all'    // 대상
  }
};

/**
 * 1. 데이터 로드 (실시간 구글 시트 -> 실패 시 Fallback JSON)
 */
async function loadCourseData() {
  updateSyncIndicator('syncing', '구글 시트 연동 중...');

  try {
    const res = await fetch(SHEET_CONFIG.gvizUrl);
    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status}`);
    }
    const csvText = await res.text();
    
    // PapaParse 파싱
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim()
    });

    if (parsed.data && parsed.data.length > 0 && parsed.data[0]['과정코드']) {
      AppState.courses = cleanCourseData(parsed.data);
      AppState.syncSource = 'live-sheet';
      updateSyncIndicator('online', '구글 시트 실시간 동기화됨');
      console.log(`[PNU HRD] 구글 시트에서 ${AppState.courses.length}개 과정 로드 성공`);
      return AppState.courses;
    } else {
      throw new Error('CSV 데이터 구조 불일치');
    }
  } catch (err) {
    console.warn('[PNU HRD] 실시간 시트 연결 실패, 백업 데이터 사용:', err);
    try {
      const fbRes = await fetch(SHEET_CONFIG.fallbackJsonUrl);
      const fbData = await fbRes.json();
      AppState.courses = cleanCourseData(fbData);
      AppState.syncSource = 'fallback';
      updateSyncIndicator('fallback', '캐시 데이터 표시 중 (시트 재연결 대기)');
      return AppState.courses;
    } catch (fbErr) {
      console.error('[PNU HRD] 백업 데이터 로드도 실패함:', fbErr);
      updateSyncIndicator('offline', '데이터를 불러올 수 없습니다');
      return [];
    }
  }
}

/**
 * 데이터 정제 (공백 및 특수문자 정리)
 */
function cleanCourseData(dataList) {
  return dataList.filter(item => item['과정코드'] && item['과정코드'].startsWith('PNU')).map(item => {
    return {
      code: (item['과정코드'] || '').trim(),
      title: (item['과정명'] || '').trim(),
      field: (item['분야'] || '').trim(),
      target: (item['대상'] || '').trim(),
      type: (item['이수구분'] || '').trim(),
      method: (item['교육방식'] || '').trim(),
      hours: (item['교육시간'] || '').trim(),
      capacity: (item['정원'] || '').trim(),
      period: (item['교육기간'] || '').trim(),
      applyPeriod: (item['신청기간'] || '').trim(),
      department: (item['담당부서'] || '').trim(),
      summary: (item['한줄소개'] || '').trim(),
      description: (item['상세소개'] || '').trim(),
      goals: (item['학습목표'] || '').trim(),
      content: (item['주요내용'] || '').trim(),
      applyUrl: (item['신청링크'] || '').trim(),
      inquiry: (item['문의'] || '').trim()
    };
  });
}

/**
 * 상단 헤더 동기화 상태 뱃지 업데이트
 */
function updateSyncIndicator(status, text) {
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  if (!dot || !label) return;

  label.textContent = text;
  dot.className = 'sync-dot';

  if (status === 'syncing') {
    dot.classList.add('syncing');
  } else if (status === 'online') {
    dot.style.backgroundColor = '#22c55e';
    dot.style.boxShadow = '0 0 0 3px rgba(34, 197, 94, 0.2)';
  } else if (status === 'fallback') {
    dot.style.backgroundColor = '#38bdf8';
    dot.style.boxShadow = '0 0 0 3px rgba(56, 189, 248, 0.2)';
  } else {
    dot.style.backgroundColor = '#ef4444';
    dot.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
  }
}

/**
 * 이수구분에 따른 뱃지 HTML 생성
 */
function getBadgeHtml(type) {
  if (type.includes('필수')) {
    return `<span class="badge badge-required">필수</span>`;
  } else if (type.includes('권장')) {
    return `<span class="badge badge-recommended">권장</span>`;
  } else {
    return `<span class="badge badge-elective">선택</span>`;
  }
}

/**
 * 2. 메인 페이지 전용 함수들
 */
function initMainPage() {
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const fieldSelect = document.getElementById('fieldSelect');
  const methodSelect = document.getElementById('methodSelect');
  const targetSelect = document.getElementById('targetSelect');
  const btnReset = document.getElementById('btnReset');

  // 데이터 로드 및 초기 렌더링
  loadCourseData().then(courses => {
    populateFilterOptions(courses);
    applyFilters();
  });

  // 검색어 입력 이벤트
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      AppState.filters.keyword = e.target.value.trim().toLowerCase();
      if (searchClear) {
        searchClear.style.display = AppState.filters.keyword ? 'block' : 'none';
      }
      applyFilters();
    });
  }

  // 검색어 초기화 클릭
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      AppState.filters.keyword = '';
      searchClear.style.display = 'none';
      applyFilters();
    });
  }

  // 이수구분 탭 클릭
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.filters.type = btn.dataset.type;
      applyFilters();
    });
  });

  // 드롭다운 변경 이벤트
  if (fieldSelect) {
    fieldSelect.addEventListener('change', e => {
      AppState.filters.field = e.target.value;
      applyFilters();
    });
  }

  if (methodSelect) {
    methodSelect.addEventListener('change', e => {
      AppState.filters.method = e.target.value;
      applyFilters();
    });
  }

  if (targetSelect) {
    targetSelect.addEventListener('change', e => {
      AppState.filters.target = e.target.value;
      applyFilters();
    });
  }

  // 필터 초기화 버튼
  if (btnReset) {
    btnReset.addEventListener('click', resetAllFilters);
  }
}

/**
 * 드롭다운 옵션 자동 생성 (데이터 기반 동적 생성)
 */
function populateFilterOptions(courses) {
  const fieldSelect = document.getElementById('fieldSelect');
  const methodSelect = document.getElementById('methodSelect');
  const targetSelect = document.getElementById('targetSelect');

  if (fieldSelect) {
    const fields = [...new Set(courses.map(c => c.field).filter(Boolean))];
    fields.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = `분야: ${f}`;
      fieldSelect.appendChild(opt);
    });
  }

  if (methodSelect) {
    const methods = [...new Set(courses.map(c => c.method).filter(Boolean))];
    methods.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `방식: ${m}`;
      methodSelect.appendChild(opt);
    });
  }

  if (targetSelect) {
    const targets = [...new Set(courses.map(c => c.target).filter(Boolean))];
    targets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = `대상: ${t}`;
      targetSelect.appendChild(opt);
    });
  }
}

/**
 * 필터 조건 적용 및 렌더링
 */
function applyFilters() {
  const { keyword, type, field, method, target } = AppState.filters;

  AppState.filteredCourses = AppState.courses.filter(item => {
    // 1. 키워드 검색
    if (keyword) {
      const matchText = `${item.title} ${item.summary} ${item.field} ${item.department} ${item.code}`.toLowerCase();
      if (!matchText.includes(keyword)) return false;
    }

    // 2. 이수구분 탭 필터
    if (type !== 'all') {
      if (type === '필수' && !item.type.includes('필수')) return false;
      if (type === '권장' && !item.type.includes('권장')) return false;
      if (type === '선택' && !item.type.includes('선택')) return false;
    }

    // 3. 분야 필터
    if (field !== 'all' && item.field !== field) return false;

    // 4. 교육방식 필터
    if (method !== 'all' && item.method !== method) return false;

    // 5. 교육대상 필터
    if (target !== 'all' && item.target !== target) return false;

    return true;
  });

  renderCourseList(AppState.filteredCourses);
  updateResultCount(AppState.filteredCourses.length);
}

/**
 * 필터 전체 리셋
 */
function resetAllFilters() {
  AppState.filters = {
    keyword: '',
    type: 'all',
    field: 'all',
    method: 'all',
    target: 'all'
  };

  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  if (searchInput) searchInput.value = '';
  if (searchClear) searchClear.style.display = 'none';

  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(b => {
    if (b.dataset.type === 'all') b.classList.add('active');
    else b.classList.remove('active');
  });

  const fieldSelect = document.getElementById('fieldSelect');
  if (fieldSelect) fieldSelect.value = 'all';

  const methodSelect = document.getElementById('methodSelect');
  if (methodSelect) methodSelect.value = 'all';

  const targetSelect = document.getElementById('targetSelect');
  if (targetSelect) targetSelect.value = 'all';

  applyFilters();
}

/**
 * 결과 카운트 갱신
 */
function updateResultCount(count) {
  const countEl = document.getElementById('resultsCount');
  if (countEl) {
    countEl.innerHTML = `총 <strong>${count}</strong>개의 연수 과정이 있습니다.`;
  }
}

/**
 * 연수 카드 그리드 렌더링
 */
function renderCourseList(courses) {
  const container = document.getElementById('courseGrid');
  if (!container) return;

  if (courses.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🔍</div>
        <h3 class="empty-title">일치하는 연수 과정이 없습니다</h3>
        <p class="empty-desc">검색어의 철자를 확인하거나 필터 조건을 변경해 보세요.</p>
        <button class="btn-reset" onclick="resetAllFilters()">전체 과정 다시 보기</button>
      </div>
    `;
    return;
  }

  container.innerHTML = courses.map(course => {
    const badgeHtml = getBadgeHtml(course.type);
    const methodHtml = course.method ? `<span class="badge-method">${course.method}</span>` : '';

    return `
      <a href="detail.html?code=${encodeURIComponent(course.code)}" class="course-card">
        <div>
          <div class="card-top">
            <div class="card-badges">
              ${badgeHtml}
              ${methodHtml}
            </div>
            <span class="course-code">${course.code}</span>
          </div>
          
          <h2 class="card-title">${escapeHtml(course.title)}</h2>
          <p class="card-desc">${escapeHtml(course.summary || course.description)}</p>
        </div>

        <div>
          <div class="card-meta-list">
            <div class="meta-item">
              <span>⏱️</span>
              <span>시간: <strong>${escapeHtml(course.hours || '-')}</strong></span>
            </div>
            <div class="meta-item">
              <span>👥</span>
              <span>정원: <strong>${escapeHtml(course.capacity || '-')}</strong></span>
            </div>
            <div class="meta-item" style="grid-column: 1 / -1;">
              <span>📅</span>
              <span>일정: <strong>${escapeHtml(course.period || '-')}</strong></span>
            </div>
          </div>

          <div class="card-footer">
            <span class="card-dept">${escapeHtml(course.department || '부산대학교')}</span>
            <span class="card-arrow">상세보기 →</span>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

/**
 * 3. 상세 페이지 전용 로더
 */
function initDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (!code) {
    renderDetailNotFound('과정 코드가 지정되지 않았습니다.');
    return;
  }

  loadCourseData().then(courses => {
    const course = courses.find(c => c.code.toLowerCase() === code.toLowerCase());
    if (course) {
      renderCourseDetail(course);
    } else {
      renderDetailNotFound(`'${code}'에 해당하는 연수 정보를 찾을 수 없습니다.`);
    }
  });
}

function renderCourseDetail(course) {
  const container = document.getElementById('detailContainer');
  if (!container) return;

  document.title = `${course.title} - 2026 부산대학교 직무연수`;

  // 학습 목표 리스트 포맷팅 (쉼표 또는 · 기준 분할)
  const goalsArr = (course.goals || '')
    .split(/·|•|\n/)
    .map(g => g.trim())
    .filter(Boolean);

  const goalsHtml = goalsArr.length > 0 
    ? `<ul class="goals-list">${goalsArr.map(g => `<li>${escapeHtml(g)}</li>`).join('')}</ul>`
    : `<p class="section-text">${escapeHtml(course.goals || '과정 안내를 참조하십시오.')}</p>`;

  // 주요 내용 리스트 포맷팅
  const contentArr = (course.content || '')
    .split(/·|•|\n/)
    .map(c => c.trim())
    .filter(Boolean);

  const contentHtml = contentArr.length > 0
    ? `<ul class="goals-list">${contentArr.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
    : `<p class="section-text">${escapeHtml(course.content || '세부 커리큘럼은 담당부서로 문의 바랍니다.')}</p>`;

  container.innerHTML = `
    <a href="index.html" class="back-link">
      <span>←</span> 전체 연수 목록으로 돌아가기
    </a>

    <article class="detail-card">
      <header class="detail-header">
        <div class="detail-badges">
          ${getBadgeHtml(course.type)}
          <span class="badge-method">${escapeHtml(course.field || '일반')}</span>
          <span class="course-code">${course.code}</span>
        </div>
        <h1 class="detail-title">${escapeHtml(course.title)}</h1>
        <p class="detail-subline">${escapeHtml(course.summary)}</p>
      </header>

      <div class="spec-grid">
        <div class="spec-item">
          <div class="spec-label">교육방식</div>
          <div class="spec-value">${escapeHtml(course.method || '-')}</div>
        </div>
        <div class="spec-item">
          <div class="spec-label">총 교육시간</div>
          <div class="spec-value">${escapeHtml(course.hours || '-')}</div>
        </div>
        <div class="spec-item">
          <div class="spec-label">모집정원</div>
          <div class="spec-value">${escapeHtml(course.capacity || '제한없음')}</div>
        </div>
        <div class="spec-item">
          <div class="spec-label">교육대상</div>
          <div class="spec-value">${escapeHtml(course.target || '전 직원')}</div>
        </div>
      </div>

      <div class="detail-body">
        <section class="section-block">
          <h3>과정 개요 및 상세 소개</h3>
          <p class="section-text">${escapeHtml(course.description || course.summary)}</p>
        </section>

        <section class="section-block">
          <h3>주요 학습 목표</h3>
          ${goalsHtml}
        </section>

        <section class="section-block">
          <h3>주요 교육 내용 및 커리큘럼</h3>
          ${contentHtml}
        </section>

        <section class="section-block">
          <h3>교육 및 신청 일정 안내</h3>
          <div style="background: var(--bg-subtle); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
            <p style="margin-bottom: 0.5rem; font-size: 0.92rem;"><strong>교육 진행 기간:</strong> ${escapeHtml(course.period || '상시 운영')}</p>
            <p style="font-size: 0.92rem;"><strong>수강 신청 기간:</strong> ${escapeHtml(course.applyPeriod || '상시 신청 가능')}</p>
          </div>
        </section>
      </div>

      <div class="detail-actions">
        <div class="inquiry-box">
          <div>주관 부서: <strong>${escapeHtml(course.department || '부산대학교')}</strong></div>
          <div>문의 전화: <strong><a href="tel:${escapeHtml(course.inquiry)}">${escapeHtml(course.inquiry || '내선 문의')}</a></strong></div>
        </div>

        <div style="display: flex; gap: 10px;">
          <button class="btn-share" onclick="copyPageUrl()">🔗 링크 복사</button>
          <a href="${course.applyUrl || '#'}" target="_blank" rel="noopener noreferrer" class="btn-apply">
            <span>수강 신청 바로가기</span>
            <span>↗</span>
          </a>
        </div>
      </div>
    </article>
  `;
}

function renderDetailNotFound(msg) {
  const container = document.getElementById('detailContainer');
  if (!container) return;

  container.innerHTML = `
    <a href="index.html" class="back-link">
      <span>←</span> 전체 연수 목록으로 돌아가기
    </a>
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <h2 class="empty-title">연수 정보를 찾을 수 없습니다</h2>
      <p class="empty-desc">${escapeHtml(msg)}</p>
      <a href="index.html" class="btn-apply" style="display: inline-block;">전체 카탈로그로 이동</a>
    </div>
  `;
}

/**
 * URL 클립보드 복사 및 토스트
 */
function copyPageUrl() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    showToast('현재 연수 상세 페이지 링크가 복사되었습니다.');
  }).catch(() => {
    showToast('링크 복사에 실패했습니다.');
  });
}

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/**
 * HTML Escape 유틸리티
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

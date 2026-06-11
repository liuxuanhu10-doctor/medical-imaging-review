/* global Storage, Flashcard, Quiz */

const App = {
  courses: [],
  currentCourse: null,
  currentTopicId: null,
  currentChapterId: null,
  currentFocusId: null,
  currentFocusPath: null,
  currentMode: 'notes', // 'notes' | 'flashcard' | 'quiz'
  _lastQuery: '',

  async init() {
    await this._loadCourseIndex();
    this._bindNav();
    this._handleRoute();
    window.addEventListener('hashchange', () => this._handleRoute());
  },

  async _loadCourseIndex() {
    try {
      const res = await fetch('data/courses.json');
      this.courses = await res.json();
    } catch {
      this.courses = [];
    }
  },

  async _loadCourse(id) {
    try {
      const res = await fetch(`data/${id}.json`);
      this.currentCourse = await res.json();
    } catch {
      this.currentCourse = null;
    }
  },

  _bindNav() {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const page = el.dataset.nav;
        if (page === 'home') {
          this.navigate('home');
        }
      });
    });
  },

  navigate(page, params = {}) {
    if (page === 'home') {
      window.location.hash = '#/';
    } else if (page === 'course') {
      window.location.hash = `#/course/${params.id}`;
    }
  },

  _handleRoute() {
    const hash = window.location.hash.slice(1) || '/';

    // Parse route: /, /course/{id}
    const courseMatch = hash.match(/^\/course\/([^/]+)$/);

    if (courseMatch) {
      this._showCourse(courseMatch[1]);
    } else {
      this._showHome();
    }

    // Update active nav states
    const isHome = !courseMatch;
    document.querySelectorAll('.sidebar-nav a[data-nav], .bottom-nav a[data-nav]').forEach((el) => {
      el.classList.toggle('active', isHome && el.dataset.nav === 'home');
    });
  },

  /* ===== Home Page ===== */
  _showHome() {
    this._switchPage('page-home');
    this.currentCourse = null;

    const grid = document.getElementById('course-grid');

    if (this.courses.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon">📚</div>
          <h3>还没有添加课程</h3>
          <p>请在 data 目录下添加课程 JSON 文件</p>
        </div>`;
      return;
    }

    grid.innerHTML = this.courses
      .map((c) => {
        const progress = Storage.getFlashcardProgress(c.id, c.totalCards || 0);
        return `
        <div class="course-card" data-course-id="${c.id}">
          <div class="card-icon">${c.icon || '📖'}</div>
          <div class="card-category">${this._escape(c.category)}</div>
          <h3>${this._escape(c.title)}</h3>
          <p>${this._escape(c.description || '')}</p>
          <div class="card-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="progress-text">学习进度 ${progress}%</div>
          </div>
        </div>`;
      })
      .join('');

    // Bind click events
    grid.querySelectorAll('.course-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.courseId;
        this.navigate('course', { id });
      });
    });
  },

  /* ===== Course Detail Page ===== */
  async _showCourse(courseId) {
    this._switchPage('page-course');
    this.currentMode = 'notes';
    this.currentTopicId = null;
    this.currentChapterId = null;
    this.currentFocusId = null;
    this.currentFocusPath = null;

    // Show loading
    document.getElementById('course-content').innerHTML =
      '<div class="empty-state"><p>加载中...</p></div>';

    await this._loadCourse(courseId);

    if (!this.currentCourse) {
      document.getElementById('course-content').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>课程未找到</h3>
          <p>找不到课程数据：${this._escape(courseId)}</p>
        </div>`;
      return;
    }

    document.getElementById('course-detail-title').textContent = this.currentCourse.title;

    // Bind back button
    document.getElementById('btn-back-home').onclick = () => this.navigate('home');

    // Render chapter selector and mode tabs
    this._renderChapterBar();
    this._renderModeTabs();
    this._renderCurrentMode();

    // Init search
    this._initSearch();
  },

  _renderChapterBar() {
    const bar = document.getElementById('chapter-bar');
    const topics = this.currentCourse.topics;
    if (!topics || topics.length <= 1) {
      bar.innerHTML = '';
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    bar.innerHTML = `
      <button class="chapter-btn ${this.currentChapterId === null ? 'active' : ''}" data-chapter-id="">
        <span class="ch-num">📚</span>全部
      </button>
      ${topics.map((t, i) => `
        <button class="chapter-btn ${this.currentChapterId === t.id ? 'active' : ''}" data-chapter-id="${t.id}">
          <span class="ch-num">${i + 1}</span>${this._escape(t.title.replace(/^[一二三四五六七八九十]+[、.．]\s*/, ''))}
        </button>`).join('')}
    `;

    bar.querySelectorAll('.chapter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.currentChapterId = btn.dataset.chapterId || null;
        this.currentFocusId = null;
        if (this.currentChapterId) {
          this.currentTopicId = this.currentChapterId;
        } else {
          this.currentTopicId = null;
        }
        this._renderChapterBar();
        this._renderCurrentMode();
        document.getElementById('course-content').scrollIntoView({ behavior: 'smooth' });
      });
    });
  },

  _initSearch() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    if (!input || !results) return;

    input.addEventListener('input', () => {
      const query = input.value.trim();
      if (query.length < 1) {
        results.classList.remove('show');
        this._lastQuery = '';
        return;
      }
      this._lastQuery = query;
      const matches = this._searchTopics(query);
      this._showSearchResults(matches, results);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 1) {
        results.classList.add('show');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        results.classList.remove('show');
      }
    });
  },

  _searchTopics(query) {
    const results = [];
    const q = query.toLowerCase();

    const walk = (topics, path) => {
      for (const t of topics) {
        const title = t.title || '';
        const content = t.content || '';
        const matchTitle = title.toLowerCase().includes(q);
        const matchContent = content.toLowerCase().includes(q);

        if (matchTitle || matchContent) {
          const pathTitles = [...path, title].map((s) =>
            s.replace(/^[一二三四五六七八九十]+[、.．]\s*/, '')
          );
          results.push({
            id: t.id,
            title: title,
            path: pathTitles,
            matchType: matchTitle ? 'title' : 'content',
            contentPreview: content.substring(0, 100),
            hasFlashcards: (t.flashcards && t.flashcards.length > 0),
            hasQuiz: (t.quiz && t.quiz.length > 0),
            fcCount: (t.flashcards ? t.flashcards.length : 0),
            qzCount: (t.quiz ? t.quiz.length : 0),
          });
        }

        if (t.subtopics && t.subtopics.length > 0) {
          walk(t.subtopics, [...path, title]);
        }
      }
    };

    // Search within each chapter
    for (const ch of this.currentCourse.topics) {
      walk([ch], []);
    }

    // Sort: title matches first
    results.sort((a, b) => {
      if (a.matchType === 'title' && b.matchType !== 'title') return -1;
      if (a.matchType !== 'title' && b.matchType === 'title') return 1;
      return 0;
    });

    return results.slice(0, 20);
  },

  _showSearchResults(matches, container) {
    if (matches.length === 0) {
      container.innerHTML = '<div class="search-no-result">未找到匹配的知识点</div>';
      container.classList.add('show');
      return;
    }

    container.innerHTML = matches
      .map(
        (m) => `
      <div class="search-result-item" data-topic-id="${m.id}">
        <div class="sr-title">${this._highlightMatch(m.title, this._lastQuery)}</div>
        <div class="sr-path">
          <div class="sr-breadcrumb">
            ${m.path
              .filter((p) => p && p !== m.title)
              .slice(-3)
              .map((p) => `<span>${this._escape(p)}</span>`)
              .join('')}
          </div>
        </div>
        <div class="sr-preview">${this._escape(m.contentPreview)}</div>
        <div class="sr-meta">
          ${m.hasFlashcards ? `<span>🃏 ${m.fcCount}张闪卡</span>` : ''}
          ${m.hasQuiz ? `<span>📝 ${m.qzCount}道题</span>` : ''}
        </div>
      </div>`
      )
      .join('');

    container.classList.add('show');

    container.querySelectorAll('.search-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        this._lastQuery = '';
        this._showTopicDetail(item.dataset.topicId);
        container.classList.remove('show');
        document.getElementById('search-input').value = '';
      });
    });
  },

  _highlightMatch(text, query) {
    if (!query) return this._escape(text);
    const escaped = this._escape(text);
    const escapedQuery = this._escape(query);
    if (!escapedQuery) return escaped;
    // Simple case-insensitive highlight
    const re = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(re, '<mark class="search-mark">$1</mark>');
  },

  _findTopicById(topicId) {
    const find = (topics) => {
      for (const t of topics) {
        if (t.id === topicId) return t;
        if (t.subtopics) {
          const r = find(t.subtopics);
          if (r) return r;
        }
      }
      return null;
    };
    return find(this.currentCourse.topics);
  },

  _showTopicDetail(topicId) {
    const topic = this._findTopicById(topicId);
    if (!topic) return;

    // Find path
    const findPath = (topics, targetId, path) => {
      for (const t of topics) {
        const newPath = [...path, t.id];
        if (t.id === targetId) return newPath;
        if (t.subtopics && t.subtopics.length > 0) {
          const found = findPath(t.subtopics, targetId, newPath);
          if (found) return found;
        }
      }
      return null;
    };
    const idPath = findPath(this.currentCourse.topics, topicId, []) || [];

    // Build path titles
    const pathTitles = idPath.map((id) => {
      const t = this._findTopicById(id);
      return t ? t.title.replace(/^[一二三四五六七八九十]+[、.．]\s*/, '') : id;
    });

    // Collect related subtopics
    const subtopics = topic.subtopics || [];
    const hasSubtopics = subtopics.length > 0;

    // Collect flashcards from this topic and immediate subtopics
    let allFlashcards = [...(topic.flashcards || [])];
    for (const st of subtopics) {
      allFlashcards = allFlashcards.concat(st.flashcards || []);
    }

    // Collect quiz from this topic and immediate subtopics
    let allQuiz = [...(topic.quiz || [])];
    for (const st of subtopics) {
      allQuiz = allQuiz.concat(st.quiz || []);
    }

    // Build modal HTML
    const subtopicsHtml = hasSubtopics ? `
      <div class="search-detail-section">
        <h4>📂 相关知识点 (${subtopics.length})</h4>
        <div class="search-detail-subtopics">
          ${subtopics.map((st) => `
            <a data-detail-topic-id="${st.id}">${this._escape(st.title)}</a>
          `).join('')}
        </div>
      </div>` : '';

    const flashcardsHtml = allFlashcards.length > 0 ? `
      <div class="search-detail-section">
        <h4>🃏 相关闪卡 (${allFlashcards.length})</h4>
        ${allFlashcards.slice(0, 10).map((fc, i) => `
          <div class="sd-flashcard" data-fc-idx="${i}">
            <div class="sd-fc-front">${this._escape(fc.front)}</div>
            <div class="sd-fc-back">${this._escape(fc.back)}</div>
            <div class="sd-fc-hint">点击翻转查看答案</div>
          </div>
        `).join('')}
        ${allFlashcards.length > 10 ? `<p style="font-size:var(--font-xs);color:var(--text-muted);">还有 ${allFlashcards.length - 10} 张闪卡...</p>` : ''}
      </div>` : '';

    const quizHtml = allQuiz.length > 0 ? `
      <div class="search-detail-section">
        <h4>📝 相关题目 (${allQuiz.length})</h4>
        ${allQuiz.slice(0, 6).map((qz, i) => `
          <div class="sd-quiz" data-qz-idx="${i}">
            <div class="sd-qz-question">Q${i + 1}. ${this._escape(qz.question)}</div>
            <div class="sd-qz-options">
              ${qz.options.map((opt, oi) => `
                <span class="sd-qz-opt" data-qz-opt="${oi}" data-correct="${oi === qz.answer}">${String.fromCharCode(65 + oi)}. ${this._escape(opt)}</span>
              `).join('')}
            </div>
          </div>
        `).join('')}
        ${allQuiz.length > 6 ? `<p style="font-size:var(--font-xs);color:var(--text-muted);">还有 ${allQuiz.length - 6} 道题...</p>` : ''}
      </div>` : '';

    const detailHtml = `
      <div class="search-detail-overlay show" id="search-detail-overlay">
        <div class="search-detail-panel" id="search-detail-panel">
          <div class="search-detail-header">
            <h3>${this._escape(topic.title)}</h3>
            <button class="search-detail-close" id="search-detail-close">✕</button>
          </div>
          <div class="search-detail-breadcrumb">
            ${pathTitles.map((p) => `<span>${this._escape(p)}</span>`).join('')}
          </div>
          <div class="search-detail-body">
            <div class="search-detail-section">
              <h4>📖 知识点内容</h4>
              <div class="search-detail-content">${this._escape(topic.content || '暂无详细内容')}</div>
            </div>
            ${subtopicsHtml}
            ${flashcardsHtml}
            ${quizHtml}
            <div class="sd-actions">
              <button class="sd-btn-view" id="sd-btn-view-in-page">📒 在课程中查看完整内容</button>
              <button class="sd-btn-close" id="sd-btn-close-bottom">关闭</button>
            </div>
          </div>
        </div>
      </div>`;

    // Remove existing overlay
    const existing = document.getElementById('search-detail-overlay');
    if (existing) existing.remove();

    // Insert into page
    const mainContent = document.getElementById('main-content');
    mainContent.insertAdjacentHTML('beforeend', detailHtml);

    const overlay = document.getElementById('search-detail-overlay');
    const panel = document.getElementById('search-detail-panel');

    // Close handlers
    const closeModal = () => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
    };

    document.getElementById('search-detail-close').onclick = closeModal;
    document.getElementById('sd-btn-close-bottom').onclick = closeModal;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // ESC key to close
    const escHandler = (e) => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    // View in page button
    document.getElementById('sd-btn-view-in-page').onclick = () => {
      closeModal();
      // Navigate to the topic in notes mode
      this.currentMode = 'notes';
      this.currentFocusId = topicId;
      this.currentFocusPath = idPath;
      this.currentChapterId = null;
      this._renderChapterBar();
      this._renderModeTabs();
      this._renderCurrentMode();
      setTimeout(() => {
        const el = document.querySelector(`[data-topic-id="${topicId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    };

    // Flashcard flip
    overlay.querySelectorAll('.sd-flashcard').forEach((fc) => {
      fc.addEventListener('click', () => {
        fc.classList.toggle('flipped');
        const hint = fc.querySelector('.sd-fc-hint');
        if (hint) hint.style.display = fc.classList.contains('flipped') ? 'none' : '';
      });
    });

    // Quiz option click
    overlay.querySelectorAll('.sd-qz-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        const parent = opt.closest('.sd-quiz');
        const allOpts = parent.querySelectorAll('.sd-qz-opt');
        // Prevent double answering
        if (parent.querySelector('.sd-qz-opt.correct, .sd-qz-opt.wrong')) return;
        const isCorrect = opt.dataset.correct === 'true';
        opt.classList.add(isCorrect ? 'correct' : 'wrong');
        // Show correct answer
        allOpts.forEach((o) => {
          if (o.dataset.correct === 'true') o.classList.add('correct');
        });
      });
    });

    // Sub-topic click -> re-open detail for that topic
    overlay.querySelectorAll('[data-detail-topic-id]').forEach((link) => {
      link.addEventListener('click', () => {
        const newId = link.dataset.detailTopicId;
        closeModal();
        setTimeout(() => this._showTopicDetail(newId), 250);
      });
    });
  },

  _renderModeTabs() {
    const tabs = document.getElementById('mode-tabs');
    tabs.innerHTML = `
      <button class="mode-tab ${this.currentMode === 'notes' ? 'active' : ''}" data-mode="notes">📒 笔记浏览</button>
      <button class="mode-tab ${this.currentMode === 'flashcard' ? 'active' : ''}" data-mode="flashcard">🃏 闪卡记忆</button>
      <button class="mode-tab ${this.currentMode === 'quiz' ? 'active' : ''}" data-mode="quiz">📝 选择题测验</button>
    `;

    tabs.querySelectorAll('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.currentMode = tab.dataset.mode;
        this._renderModeTabs();
        this._renderCurrentMode();
      });
    });
  },

  _renderCurrentMode() {
    const content = document.getElementById('course-content');
    switch (this.currentMode) {
      case 'notes':
        this._renderNotes(content);
        break;
      case 'flashcard':
        this._renderFlashcard(content);
        break;
      case 'quiz':
        this._renderQuiz(content);
        break;
    }
  },

  /* ===== Notes Mode ===== */
  _renderNotes(container) {
    const course = this.currentCourse;
    let topics = course.topics;

    // Filter by chapter
    if (this.currentChapterId) {
      topics = topics.filter((t) => t.id === this.currentChapterId);
    }

    // Focus mode: show only the branch containing the focused topic
    if (this.currentFocusId && this.currentFocusPath) {
      const rootId = this.currentFocusPath[0];
      topics = topics.filter((t) => t.id === rootId);
    }

    container.innerHTML = `
      <div class="topic-actions">
        <button class="btn-sm" id="btn-expand-all">📂 全部展开</button>
        <button class="btn-sm" id="btn-collapse-all">📁 全部收缩</button>
        ${this.currentFocusId ? '<button class="btn-sm" id="btn-clear-focus">📋 显示全部</button>' : ''}
      </div>
      <div class="topic-tree" id="topic-tree">
        ${this._renderTopics(topics)}
      </div>`;

    document.getElementById('btn-expand-all').onclick = () => {
      document.querySelectorAll('.topic-node').forEach((n) => n.classList.add('expanded'));
    };
    document.getElementById('btn-collapse-all').onclick = () => {
      document.querySelectorAll('.topic-node').forEach((n) => n.classList.remove('expanded'));
    };

    if (this.currentFocusId) {
      document.getElementById('btn-clear-focus').onclick = () => {
        this.currentFocusId = null;
        this.currentFocusPath = null;
        this._renderNotes(container);
      };
    }

    // Bind topic toggling
    document.querySelectorAll('.topic-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const node = header.closest('.topic-node');
        node.classList.toggle('expanded');
      });
    });

    // Bind flashcard and quiz buttons on topic headers
    container.querySelectorAll('.topic-flashcard-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.currentTopicId = btn.dataset.topicId;
        this.currentMode = 'flashcard';
        this._renderModeTabs();
        this._renderCurrentMode();
        document.getElementById('course-content').scrollIntoView({ behavior: 'smooth' });
      });
    });

    container.querySelectorAll('.topic-quiz-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.currentTopicId = btn.dataset.topicId;
        this.currentMode = 'quiz';
        this._renderModeTabs();
        this._renderCurrentMode();
        document.getElementById('course-content').scrollIntoView({ behavior: 'smooth' });
      });
    });
  },

  _renderTopics(topics, level = 0) {
    return topics
      .map((t) => {
        const hasChildren = t.subtopics && t.subtopics.length > 0;
        const hasFlashcards = t.flashcards && t.flashcards.length > 0;
        const hasQuiz = t.quiz && t.quiz.length > 0;
        const badges = [];
        if (hasFlashcards) badges.push(`${t.flashcards.length} 张闪卡`);
        if (hasQuiz) badges.push(`${t.quiz.length} 道测验`);

        // Focus mode: filter subtopics to only the path chain
        let childrenHtml = '';
        if (hasChildren) {
          let filteredSubs = t.subtopics;
          if (this.currentFocusPath && this.currentFocusPath.includes(t.id)) {
            const nextIdx = this.currentFocusPath.indexOf(t.id) + 1;
            if (nextIdx < this.currentFocusPath.length) {
              const nextId = this.currentFocusPath[nextIdx];
              filteredSubs = t.subtopics.filter((s) => s.id === nextId);
            }
          } else if (this.currentFocusPath && !this.currentFocusPath.includes(t.id)) {
            // Not in focus path, don't show children
            filteredSubs = [];
          }
          if (filteredSubs.length > 0) {
            childrenHtml = `<div class="topic-children">${this._renderTopics(filteredSubs, level + 1)}</div>`;
          }
        }

        // Force expand if in focus path
        const isInFocusPath = this.currentFocusPath && this.currentFocusPath.includes(t.id);
        const isTarget = this.currentFocusId === t.id;
        const expandClass = (level === 0 || isInFocusPath) ? ' expanded' : '';

        return `
        <div class="topic-node${expandClass}" data-topic-id="${t.id}">
          <div class="topic-header">
            <span class="chevron">▶</span>
            ${this._modalityTag(t.title)}
            <span class="topic-title${isTarget ? ' search-highlight' : ''}">${this._escape(t.title)}</span>
            ${
              badges.length > 0
                ? `<span class="topic-badge">${badges.join(' · ')}</span>`
                : ''
            }
            ${
              hasFlashcards
                ? `<button class="btn-sm topic-flashcard-btn" data-topic-id="${t.id}" title="复习闪卡">🃏</button>`
                : ''
            }
            ${
              hasQuiz
                ? `<button class="btn-sm topic-quiz-btn" data-topic-id="${t.id}" title="做测验">📝</button>`
                : ''
            }
          </div>
          <div class="topic-content">${this._escape(t.content || '')}</div>
          ${childrenHtml}
        </div>`;
      })
      .join('');
  },

  /* ===== Flashcard Mode ===== */
  _renderFlashcard(container) {
    // If no specific topic selected, show topic selector
    if (!this.currentTopicId) {
      this._renderFlashcardSelector(container);
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:8px;">
        <button class="btn-sm" id="btn-flashcard-back">← 选择章节</button>
        <span style="font-size:var(--font-sm);color:var(--text-secondary);">
          当前章节：${this.currentTopicId === '__all__' ? '全部章节' : this._getTopicTitle(this.currentTopicId)}
        </span>
      </div>
      <div id="flashcard-area"></div>`;

    document.getElementById('btn-flashcard-back').onclick = () => {
      this.currentTopicId = null;
      this._renderFlashcard(container);
    };

    Flashcard.init(
      document.getElementById('flashcard-area'),
      this.currentCourse,
      this.currentTopicId
    );
  },

  _renderFlashcardSelector(container) {
    let topics = this.currentCourse.topics;
    if (this.currentChapterId) {
      topics = topics.filter((t) => t.id === this.currentChapterId);
    }
    const allFlashcardCount = this._countAllFlashcards(topics);
    const showAllOption = !this.currentChapterId;
    container.innerHTML = `
      <div class="quiz-mode-select">
        <p style="margin-bottom:16px;">请选择要复习的章节：</p>
        <div class="quiz-topic-select">
          ${showAllOption ? `
          <button class="quiz-topic-btn topic-select-option" data-topic-id="__all__">
            📚 全部章节 <span class="topic-count">${allFlashcardCount} 张闪卡</span>
          </button>` : ''}
          ${this._renderFlashcardTopicOptions(topics)}
        </div>
      </div>`;

    container.querySelectorAll('.topic-select-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.currentTopicId = btn.dataset.topicId;
        this._renderFlashcard(container);
      });
    });
  },

  _renderFlashcardTopicOptions(topics) {
    return topics
      .map((t) => {
        const count = t.flashcards ? t.flashcards.length : 0;
        const childContent = t.subtopics ? this._renderFlashcardTopicOptions(t.subtopics) : '';
        if (count === 0 && !childContent) return '';
        return `
          <button class="quiz-topic-btn topic-select-option" data-topic-id="${t.id}">
            ${this._escape(t.title)} <span class="topic-count">${count > 0 ? count + ' 张闪卡' : ''}</span>
          </button>
          ${childContent}`;
      })
      .join('');
  },

  _countAllFlashcards(topics) {
    let count = 0;
    for (const t of topics) {
      if (t.flashcards) count += t.flashcards.length;
      if (t.subtopics) count += this._countAllFlashcards(t.subtopics);
    }
    return count;
  },

  _getTopicTitle(topicId) {
    const find = (topics) => {
      for (const t of topics) {
        if (t.id === topicId) return t.title;
        if (t.subtopics) {
          const r = find(t.subtopics);
          if (r) return r;
        }
      }
      return null;
    };
    return find(this.currentCourse.topics) || topicId;
  },

  /* ===== Quiz Mode ===== */
  _renderQuiz(container) {
    if (!this.currentTopicId) {
      this._renderQuizSelector(container);
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:8px;">
        <button class="btn-sm" id="btn-quiz-back">← 选择章节</button>
        <span style="font-size:var(--font-sm);color:var(--text-secondary);">
          当前章节：${this.currentTopicId === '__all__' ? '全部章节' : this._getTopicTitle(this.currentTopicId)}
        </span>
      </div>
      <div id="quiz-area"></div>`;

    document.getElementById('btn-quiz-back').onclick = () => {
      this.currentTopicId = null;
      this._renderQuiz(container);
    };

    Quiz.init(
      document.getElementById('quiz-area'),
      this.currentCourse,
      this.currentTopicId
    );
  },

  _renderQuizSelector(container) {
    let topics = this.currentCourse.topics;
    if (this.currentChapterId) {
      topics = topics.filter((t) => t.id === this.currentChapterId);
    }
    const allQuizCount = this._countAllQuiz(topics);
    const showAllOption = !this.currentChapterId;
    container.innerHTML = `
      <div class="quiz-mode-select">
        <p style="margin-bottom:16px;">请选择要测验的章节：</p>
        <div class="quiz-topic-select">
          ${showAllOption ? `
          <button class="quiz-topic-btn topic-select-option" data-topic-id="__all__">
            📚 全部章节 <span class="topic-count">${allQuizCount} 道题</span>
          </button>` : ''}
          ${this._renderQuizTopicOptions(topics)}
        </div>
      </div>`;

    container.querySelectorAll('.topic-select-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.currentTopicId = btn.dataset.topicId;
        this._renderQuiz(container);
      });
    });
  },

  _renderQuizTopicOptions(topics) {
    return topics
      .map((t) => {
        const count = t.quiz ? t.quiz.length : 0;
        const childContent = t.subtopics ? this._renderQuizTopicOptions(t.subtopics) : '';
        if (count === 0 && !childContent) return '';
        return `
          <button class="quiz-topic-btn topic-select-option" data-topic-id="${t.id}">
            ${this._escape(t.title)} <span class="topic-count">${count > 0 ? count + ' 道题' : ''}</span>
          </button>
          ${childContent}`;
      })
      .join('');
  },

  _countAllQuiz(topics) {
    let count = 0;
    for (const t of topics) {
      if (t.quiz) count += t.quiz.length;
      if (t.subtopics) count += this._countAllQuiz(t.subtopics);
    }
    return count;
  },

  _modalityTag(title) {
    const map = {
      'X线表现': 'xray', 'X线平片': 'xray', 'X线检查': 'xray', 'X线摄影': 'xray',
      'CT表现': 'ct', 'CT平扫': 'ct', 'CT增强': 'ct', 'CT检查': 'ct',
      'MRI表现': 'mri', 'MR表现': 'mri', '磁共振': 'mri',
      '超声表现': 'us', '超声检查': 'us', '超声诊断': 'us',
      'DSA表现': 'dsa', '血管造影': 'dsa',
      '增强扫描': 'contrast',
    };
    const cls = map[title];
    if (!cls) return '';
    const icons = { xray: '⚡', ct: '🔲', mri: '🧲', us: '🔊', dsa: '💉', contrast: '💊' };
    return `<span class="modality-tag ${cls}">${icons[cls] || ''} ${title.split('表现')[0]}</span>`;
  },

  /* ===== Utilities ===== */
  _switchPage(pageId) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());

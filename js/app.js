/* global Storage */

const App = {
  courses: [],
  currentCourse: null,
  currentTopicId: null,
  currentChapterId: null,
  currentFocusId: null,
  currentFocusPath: null,
  _lastQuery: '',
  bookmarks: new Set(),
  highlightOn: false,
  fontSize: 'md',

  async init() {
    await this._loadCourseIndex();
    this._loadBookmarks();
    this._loadPrefs();
    this._bindNav();
    this._initTheme();
    this._initBackToTop();
    this._handleRoute();
    window.addEventListener('hashchange', () => this._handleRoute());
  },

  _loadPrefs() {
    this.highlightOn = localStorage.getItem('medreview_highlight') === 'on';
    this.fontSize = localStorage.getItem('medreview_fontsize') || 'md';
    if (this.fontSize !== 'md') {
      document.documentElement.classList.add('font-' + this.fontSize);
    }
    this._initAIChat();
  },

  /* ===== AI Chat ===== */
  _initAIChat() {
    const floatBtn = document.getElementById('ai-float-btn');
    const chatPanel = document.getElementById('ai-chat');
    const chatBody = document.getElementById('ai-chat-body');
    const chatInput = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-send-btn');
    const apiKeyInput = document.getElementById('ai-api-key');
    const apiStatus = document.getElementById('ai-api-status');
    const closeBtn = document.getElementById('ai-close-chat');
    const newChatBtn = document.getElementById('ai-new-chat');
    const suggestionsEl = document.getElementById('ai-suggestions');

    if (!floatBtn || !chatPanel) return;

    // State
    let chatHistory = [];
    const systemPrompt = '你是一个专业的医学复习助手。回答简洁、条理清晰、使用中文。如果问疾病，列出：临床特点、影像学表现（按X线/CT/MRI/超声分点）、鉴别诊断。如果问法律，列出法律依据和要点。';

    // Simple markdown to HTML
    const md2html = (text) => {
      let html = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<strong>$1</strong>')
        .replace(/^## (.+)$/gm, '<strong>$1</strong>')
        .replace(/^# (.+)$/gm, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        .replace(/<\/li>\s*<li>/g, '</li><li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
      html = '<p>' + html + '</p>';
      html = html.replace(/<p>\s*<ul>/g, '<ul>').replace(/<\/ul>\s*<\/p>/g, '</ul>');
      html = html.replace(/<p>\s*<\/p>/g, '');
      return html;
    };

    // API Key management
    const getApiKey = () => {
      const key = (apiKeyInput && apiKeyInput.value.trim()) || localStorage.getItem('medreview_apikey');
      return key;
    };

    const updateApiStatus = () => {
      const key = getApiKey();
      if (key) {
        apiStatus.textContent = '已设置 ✓';
        apiStatus.className = 'ai-api-status ok';
        if (floatBtn) floatBtn.classList.add('has-key');
        // Hide welcome suggestions if key is set
        const welcome = chatBody.querySelector('.ai-chat-welcome');
        if (welcome && chatHistory.length === 0) {
          welcome.style.display = 'flex';
        }
      } else {
        apiStatus.textContent = '未设置';
        apiStatus.className = 'ai-api-status no';
        if (floatBtn) floatBtn.classList.remove('has-key');
      }
    };

    // Restore key
    const savedKey = localStorage.getItem('medreview_apikey');
    if (savedKey && apiKeyInput) {
      apiKeyInput.value = savedKey;
    }
    updateApiStatus();

    if (apiKeyInput) {
      apiKeyInput.addEventListener('input', () => {
        const val = apiKeyInput.value.trim();
        if (val) localStorage.setItem('medreview_apikey', val);
        updateApiStatus();
      });
    }

    // Suggestions
    const suggestions = [
      '肝癌的CT表现和鉴别诊断',
      '硬膜外血肿和硬膜下血肿怎么区分',
      '肺结核分型及各型X线表现',
      '医疗事故分几级',
      '大叶性肺炎的影像学表现',
    ];
    if (suggestionsEl) {
      suggestionsEl.innerHTML = suggestions.map(s => `<button>${s}</button>`).join('');
      suggestionsEl.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
          sendToAI(e.target.textContent);
        }
      });
    }

    // Render message
    const renderMessage = (role, text) => {
      const row = document.createElement('div');
      row.className = 'ai-msg-row ' + (role === 'user' ? 'user' : '');

      if (role !== 'user') {
        const avatar = document.createElement('div');
        avatar.className = 'ai-msg-avatar ai';
        avatar.textContent = '🤖';
        row.appendChild(avatar);
      }

      const bubble = document.createElement('div');
      bubble.className = 'ai-msg-bubble ' + (role === 'user' ? 'user' : 'ai');

      if (role === 'assistant') {
        bubble.innerHTML = md2html(text);
        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ai-msg-copy';
        copyBtn.textContent = '📋';
        copyBtn.title = '复制';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = '✓';
            setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
          }).catch(() => {});
        });
        bubble.appendChild(copyBtn);
      } else {
        bubble.textContent = text;
      }

      row.appendChild(bubble);

      if (role === 'user') {
        const avatar = document.createElement('div');
        avatar.className = 'ai-msg-avatar user';
        avatar.textContent = '👤';
        row.appendChild(avatar);
      }

      chatBody.appendChild(row);
      chatBody.scrollTop = chatBody.scrollHeight;
    };

    const showTyping = () => {
      const div = document.createElement('div');
      div.className = 'ai-typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      div.id = 'ai-typing';
      chatBody.appendChild(div);
      chatBody.scrollTop = chatBody.scrollHeight;
    };

    const hideTyping = () => {
      const el = document.getElementById('ai-typing');
      if (el) el.remove();
    };

    // Clear welcome when first message is sent
    const clearWelcome = () => {
      const welcome = chatBody.querySelector('.ai-chat-welcome');
      if (welcome) welcome.style.display = 'none';
    };

    // Main send function
    const sendToAI = async (question) => {
      const apiKey = getApiKey();
      if (!apiKey) {
        renderMessage('system', '请先设置API Key。去 platform.deepseek.com 注册获取，粘贴到上方输入框即可。新用户有免费额度。');
        return;
      }
      if (!question.trim()) return;

      clearWelcome();
      renderMessage('user', question);
      chatHistory.push({ role: 'user', content: question });
      showTyping();

      const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.slice(-8)
      ];

      try {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.7, max_tokens: 1000 })
        });

        hideTyping();

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = err.error?.message || res.statusText;
          renderMessage('system', '请求失败：' + msg + '。请检查API Key是否正确，或稍后重试。');
          return;
        }

        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || '（未获取到回复）';
        renderMessage('assistant', reply);
        chatHistory.push({ role: 'assistant', content: reply });
      } catch (e) {
        hideTyping();
        renderMessage('system', '网络连接失败：' + e.message + '。请检查网络后重试。');
      }
    };

    // Event bindings
    floatBtn.addEventListener('click', () => {
      chatPanel.classList.toggle('open');
      if (chatPanel.classList.contains('open')) chatInput.focus();
    });

    closeBtn.addEventListener('click', () => chatPanel.classList.remove('open'));

    newChatBtn.addEventListener('click', () => {
      chatHistory = [];
      chatBody.innerHTML = `
        <div class="ai-chat-welcome">
          <div class="ai-welcome-icon">🤖</div>
          <p>我是你的AI学习助手，可以解答医学影像学和卫生法学的问题</p>
          <div class="ai-suggestions" id="ai-suggestions-new"></div>
        </div>`;
      // Re-bind suggestions
      const newSugg = document.getElementById('ai-suggestions-new');
      if (newSugg) {
        newSugg.innerHTML = suggestions.map(s => `<button>${s}</button>`).join('');
        newSugg.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') sendToAI(e.target.textContent);
        });
      }
    });

    sendBtn.addEventListener('click', () => {
      const q = chatInput.value;
      chatInput.value = '';
      sendToAI(q);
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const q = chatInput.value;
        chatInput.value = '';
        sendToAI(q);
      }
    });

    // Restore chat history
    try {
      const saved = localStorage.getItem('medreview_chathistory');
      if (saved) {
        const msgs = JSON.parse(saved);
        if (msgs.length > 0) {
          clearWelcome();
          msgs.forEach(m => {
            chatHistory.push(m);
            if (m.role === 'user' || m.role === 'assistant') {
              renderMessage(m.role, m.content);
            }
          });
        }
      }
    } catch {}

    // Save chat history periodically
    setInterval(() => {
      if (chatHistory.length > 0) {
        localStorage.setItem('medreview_chathistory', JSON.stringify(chatHistory.slice(-20)));
      }
    }, 3000);

    // Expose to app
    this._askAI = (question) => {
      if (!chatPanel.classList.contains('open')) chatPanel.classList.add('open');
      sendToAI(question);
    };

    updateApiStatus();
  },

  _loadBookmarks() {
    try {
      const saved = localStorage.getItem('medreview_bookmarks');
      if (saved) this.bookmarks = new Set(JSON.parse(saved));
    } catch { this.bookmarks = new Set(); }
  },

  _saveBookmarks() {
    localStorage.setItem('medreview_bookmarks', JSON.stringify([...this.bookmarks]));
  },

  _toggleBookmark(topicId) {
    if (this.bookmarks.has(topicId)) {
      this.bookmarks.delete(topicId);
    } else {
      this.bookmarks.add(topicId);
    }
    this._saveBookmarks();
    this._renderTopicActions(); this._renderNotes();
  },

  _isBookmarked(topicId) { return this.bookmarks.has(topicId); },

  _toggleTopicDone(topicId) {
    Storage.toggleTopicDone(this.currentCourse.id, topicId);
    this._renderTopicActions(); this._renderNotes();
  },

  _isTopicDone(topicId) { return Storage.isTopicDone(this.currentCourse.id, topicId); },

  _initTheme() {
    const saved = localStorage.getItem('medreview_theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    const updateIcons = () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.querySelectorAll('.theme-toggle').forEach((btn) => {
        btn.textContent = isDark ? '☀️' : '🌓';
      });
    };
    updateIcons();
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('medreview_theme', 'light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem('medreview_theme', 'dark');
        }
        updateIcons();
      });
    });
  },

  _initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;
    const mainContent = document.getElementById('main-content');
    const scrollEl = document.scrollingElement || document.documentElement;

    const toggle = () => {
      if (scrollEl.scrollTop > 300) {
        btn.classList.add('show');
      } else {
        btn.classList.remove('show');
      }
    };

    window.addEventListener('scroll', toggle, { passive: true });

    btn.addEventListener('click', () => {
      scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
    });
  },

  async _loadCourseIndex() {
    try {
      const res = await fetch('data/courses.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.courses = await res.json();
    } catch {
      this.courses = [];
    }
  },

  async _loadCourse(id) {
    try {
      const res = await fetch(`data/${id}.json`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
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
        const progress = Storage.getTopicProgress(c.id, c.totalCards || 0);
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
    this.currentTopicId = null;
    this.currentChapterId = null;
    this.currentFocusId = null;
    this.currentFocusPath = null;

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
    document.getElementById('btn-back-home').onclick = () => this.navigate('home');

    this._renderChapterBar();
    this._renderTopicActions();
    this._renderNotes();

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
        this._renderTopicActions(); this._renderNotes();
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
      this.currentFocusId = topicId;
      this.currentFocusPath = idPath;
      this.currentChapterId = null;
      this._renderChapterBar();
      this._renderModeTabs();
      this._renderTopicActions(); this._renderNotes();
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

  _renderTopicActions() {
    const container = document.getElementById('topic-actions');
    if (!container) return;
    const showBookmarks = this.bookmarks.size > 0;
    const hlLabel = this.highlightOn ? '🔆 取消高亮' : '🖍 关键词高亮';
    const fsLabels = { sm: 'A-', md: 'A', lg: 'A+' };
    const nextFs = { sm: 'md', md: 'lg', lg: 'sm' };

    container.innerHTML = `
      <button class="btn-sm" id="btn-expand-all">📂 展开</button>
      <button class="btn-sm" id="btn-collapse-all">📁 收缩</button>
      <button class="btn-sm" id="btn-toggle-highlight">${hlLabel}</button>
      <button class="btn-sm" id="btn-font-size">${fsLabels[this.fontSize]}</button>
      ${this.currentFocusId ? '<button class="btn-sm" id="btn-clear-focus">📋 全部</button>' : ''}
      ${showBookmarks ? '<button class="btn-sm" id="btn-show-bookmarks">⭐ 收藏</button>' : ''}
    `;

    document.getElementById('btn-expand-all').onclick = () => {
      document.querySelectorAll('.topic-node').forEach((n) => n.classList.add('expanded'));
    };
    document.getElementById('btn-collapse-all').onclick = () => {
      document.querySelectorAll('.topic-node').forEach((n) => n.classList.remove('expanded'));
    };

    document.getElementById('btn-toggle-highlight').onclick = () => {
      this.highlightOn = !this.highlightOn;
      localStorage.setItem('medreview_highlight', this.highlightOn ? 'on' : 'off');
      // Re-render to apply/remove highlights
      const tree = document.getElementById('topic-tree');
      if (tree) tree.classList.toggle('highlight-on', this.highlightOn);
      this._applyHighlights();
      this._renderTopicActions();
    };

    document.getElementById('btn-font-size').onclick = () => {
      this.fontSize = nextFs[this.fontSize];
      document.documentElement.className = document.documentElement.className.replace(/font-\w+/g, '');
      if (this.fontSize !== 'md') document.documentElement.classList.add('font-' + this.fontSize);
      localStorage.setItem('medreview_fontsize', this.fontSize);
      this._renderTopicActions();
    };

    if (this.currentFocusId) {
      document.getElementById('btn-clear-focus').onclick = () => {
        this.currentFocusId = null;
        this.currentFocusPath = null;
        this._renderTopicActions();
        this._renderNotes();
      };
    }

    if (showBookmarks) {
      document.getElementById('btn-show-bookmarks').onclick = () => {
        this._showBookmarksModal();
      };
    }
  },

  _applyHighlights() {
    if (!this.highlightOn) return;
    const tree = document.getElementById('topic-tree');
    if (!tree) return;

    const keywords = [
      { re: /(X线(?:表现|平片|摄影|检查|透视|造影)?)/g, cls: 'kw-xray' },
      { re: /(CT(?:表现|平扫|增强|检查|扫描|值|A|M|VE|PI)?)/g, cls: 'kw-ct' },
      { re: /(MRI(?:表现|检查|增强|扫描)?|MR(?:表现|检查|A|CP|U|M|S|H))/g, cls: 'kw-mri' },
      { re: /(超声(?:表现|检查|诊断|成像|造影|弹性)?|CDFI)/g, cls: 'kw-us' },
      { re: /(DSA(?:表现|检查)?)/g, cls: 'kw-dsa' },
      { re: /((?:Codman|空气支气管|毛刺|分叶|胸膜凹陷|牛眼|快进快出|快进慢出|树芽|皮革胃|半月|环堤|跳跃|哑铃|三均匀|脑膜尾|束腰)[征象]?征)/g, cls: 'kw-sign' },
    ];

    const walk = (node) => {
      if (node.nodeType === 3 && node.textContent.trim()) { // Text node
        let html = node.textContent;
        let changed = false;
        for (const kw of keywords) {
          if (kw.re.test(html)) {
            html = html.replace(kw.re, `<span class="${kw.cls}">$1</span>`);
            changed = true;
          }
        }
        if (changed) {
          const span = document.createElement('span');
          span.innerHTML = html;
          node.parentNode.replaceChild(span, node);
        }
      } else if (node.nodeType === 1 && !node.classList.contains('kw-xray') && !node.classList.contains('kw-ct') && !node.classList.contains('kw-mri') && !node.classList.contains('kw-us') && !node.classList.contains('kw-dsa') && !node.classList.contains('kw-sign')) {
        for (const child of [...node.childNodes]) {
          walk(child);
        }
      }
    };

    tree.querySelectorAll('.topic-content').forEach((el) => walk(el));
  },

  _showBookmarksModal() {
    const items = [];
    const walk = (topics, path) => {
      for (const t of topics) {
        if (this.bookmarks.has(t.id)) {
          items.push({ id: t.id, title: t.title, path: [...path, t.title] });
        }
        if (t.subtopics) walk(t.subtopics, [...path, t.title]);
      }
    };
    for (const ch of this.currentCourse.topics) walk([ch], []);

    const html = `
      <div class="search-detail-overlay show" id="bookmark-overlay">
        <div class="search-detail-panel">
          <div class="search-detail-header">
            <h3>⭐ 收藏的知识点 (${items.length})</h3>
            <button class="search-detail-close" id="bm-close">✕</button>
          </div>
          <div class="search-detail-body">
            ${items.length === 0 ? '<p style="color:var(--text-muted)">暂无收藏</p>' : ''}
            ${items.map((m) => `
              <div class="search-result-item" data-bm-id="${m.id}" style="cursor:pointer">
                <div class="sr-title">${this._escape(m.title)}</div>
                <div class="sr-path">
                  <div class="sr-breadcrumb">
                    ${m.path.filter(p => p && p !== m.title).slice(-3).map(p => `<span>${this._escape(p)}</span>`).join('')}
                  </div>
                </div>
              </div>
            `).join('')}
            <div class="sd-actions" style="margin-top:16px">
              <button class="sd-btn-close" id="bm-clear-all" style="background:var(--wrong);color:#fff">清除所有收藏</button>
              <button class="sd-btn-close" id="bm-close-bottom">关闭</button>
            </div>
          </div>
        </div>
      </div>`;

    const mainContent = document.getElementById('main-content');
    mainContent.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('bookmark-overlay');

    const closeModal = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 200); };
    document.getElementById('bm-close').onclick = closeModal;
    document.getElementById('bm-close-bottom').onclick = closeModal;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    document.getElementById('bm-clear-all').onclick = () => {
      this.bookmarks.clear();
      this._saveBookmarks();
      closeModal();
      this._renderTopicActions();
      this._renderNotes();
    };

    overlay.querySelectorAll('[data-bm-id]').forEach((item) => {
      item.addEventListener('click', () => {
        closeModal();
        this._showTopicDetail(item.dataset.bmId);
      });
    });
  },

  /* ===== Notes Mode ===== */
  _renderNotes() {
    const course = this.currentCourse;
    if (!course) return;
    let topics = course.topics;
    const container = document.getElementById('course-content');
    if (!container) return;

    if (this.currentChapterId) {
      topics = topics.filter((t) => t.id === this.currentChapterId);
    }

    if (this.currentFocusId && this.currentFocusPath) {
      const rootId = this.currentFocusPath[0];
      topics = topics.filter((t) => t.id === rootId);
    }

    container.innerHTML = `<div class="topic-tree" id="topic-tree">${this._renderTopics(topics)}</div>`;

    this._renderTopicActions();

    // Bind topic toggling
    container.querySelectorAll('.topic-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const node = header.closest('.topic-node');
        node.classList.toggle('expanded');
      });
    });

    // Bind bookmark buttons
    container.querySelectorAll('.topic-bookmark-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleBookmark(btn.dataset.topicId);
      });
    });

    // Bind done checkboxes
    container.querySelectorAll('.topic-done-cb').forEach((cb) => {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleTopicDone(cb.dataset.topicId);
      });
    });

    // Apply keyword highlights if enabled
    if (this.highlightOn) {
      const tree = document.getElementById('topic-tree');
      if (tree) tree.classList.add('highlight-on');
      this._applyHighlights();
    }
  },

  _renderTopics(topics, level = 0) {
    return topics
      .map((t) => {
        const hasChildren = t.subtopics && t.subtopics.length > 0;
        const isBookmarked = this._isBookmarked(t.id);
        const isDone = this._isTopicDone(t.id);

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
            filteredSubs = [];
          }
          if (filteredSubs.length > 0) {
            childrenHtml = `<div class="topic-children">${this._renderTopics(filteredSubs, level + 1)}</div>`;
          }
        }

        const isInFocusPath = this.currentFocusPath && this.currentFocusPath.includes(t.id);
        const isTarget = this.currentFocusId === t.id;
        const expandClass = (level === 0 || isInFocusPath) ? ' expanded' : '';
        const doneClass = isDone ? ' topic-done' : '';

        return `
        <div class="topic-node${expandClass}" data-topic-id="${t.id}">
          <div class="topic-header${doneClass}">
            <span class="topic-done-cb" data-topic-id="${t.id}" title="标记已学">${isDone ? '✅' : '○'}</span>
            <span class="chevron">▶</span>
            ${this._modalityTag(t.title)}
            <span class="topic-title${isTarget ? ' search-highlight' : ''}${doneClass ? ' done-text' : ''}">${this._escape(t.title)}</span>
            <button class="topic-bookmark-btn${isBookmarked ? ' bookmarked' : ''}" data-topic-id="${t.id}" title="${isBookmarked ? '取消收藏' : '收藏'}">${isBookmarked ? '⭐' : '☆'}</button>
          </div>
          <div class="topic-content${doneClass ? ' done-content' : ''}">${this._escape(t.content || '')}</div>
          ${childrenHtml}
        </div>`;
      })
      .join('');
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

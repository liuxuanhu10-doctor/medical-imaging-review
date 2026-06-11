/* global Storage */

const Flashcard = {
  course: null,
  topicId: null,
  cards: [],
  currentIndex: 0,
  isFlipped: false,
  container: null,

  init(container, course, topicId) {
    this.container = container;
    this.course = course;
    this.topicId = topicId;
    this.currentIndex = 0;
    this.isFlipped = false;

    // Collect cards from the selected topic (or all topics)
    this.cards = this._collectCards(course, topicId);
    this._render();
  },

  _collectCards(course, topicId) {
    const result = [];
    const walk = (topics) => {
      for (const t of topics) {
        if (topicId === '__all__' || t.id === topicId || this._topicContains(t, topicId)) {
          if (topicId === '__all__') {
            if (t.flashcards && t.flashcards.length > 0) {
              for (const fc of t.flashcards) {
                result.push({ ...fc, _topicTitle: t.title, _topicId: t.id });
              }
            }
          } else if (t.id === topicId) {
            if (t.flashcards && t.flashcards.length > 0) {
              for (const fc of t.flashcards) {
                result.push({ ...fc, _topicTitle: t.title, _topicId: t.id });
              }
            }
          }
        }
        if (t.subtopics && t.subtopics.length > 0) walk(t.subtopics);
      }
    };
    walk(course.topics);

    // Shuffle
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  },

  _topicContains(topic, targetId) {
    if (!topic.subtopics) return false;
    for (const st of topic.subtopics) {
      if (st.id === targetId) return true;
      if (this._topicContains(st, targetId)) return true;
    }
    return false;
  },

  _render() {
    if (this.cards.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <h3>该章节暂无闪卡</h3>
          <p>请选择其他章节或等待添加闪卡内容</p>
        </div>`;
      return;
    }

    if (this.currentIndex >= this.cards.length) {
      this._renderDone();
      return;
    }

    const card = this.cards[this.currentIndex];
    const cardKey = `${card._topicId}::${this.currentIndex}`;
    const completed = Storage.get(this.course.id).completedFlashcards;
    const isDone = completed.includes(cardKey);
    const total = this.cards.length;
    const doneCount = completed.filter((c) => c.startsWith(card._topicId)).length;

    this.container.innerHTML = `
      <div class="flashcard-container">
        <div class="flashcard-progress">
          <div class="progress-label">第 ${this.currentIndex + 1} / ${total} 张 · ${card._topicTitle}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${Math.round(((this.currentIndex + 1) / total) * 100)}%"></div>
          </div>
        </div>
        <div class="flashcard-scene" id="flashcard-scene">
          <div class="flashcard-inner ${isDone ? 'flipped' : ''}" id="flashcard-inner">
            <div class="flashcard-face flashcard-front">
              <div class="card-label">📖 问题</div>
              <div class="card-question">${this._escape(card.front)}</div>
            </div>
            <div class="flashcard-face flashcard-back">
              <div class="card-label">💡 答案</div>
              <div class="card-answer">${this._escape(card.back)}</div>
            </div>
          </div>
        </div>
        ${!isDone ? '<div class="flashcard-hint">👆 点击卡片翻转查看答案</div>' : ''}
        <div class="flashcard-actions">
          <button class="btn-again" id="btn-again">🔄 再复习一遍</button>
          <button class="btn-remember" id="btn-remember">✅ 记得了</button>
        </div>
      </div>`;

    this._bindEvents(card, cardKey);
  },

  _bindEvents(card, cardKey) {
    const scene = document.getElementById('flashcard-scene');
    const inner = document.getElementById('flashcard-inner');

    if (scene && inner) {
      scene.onclick = () => {
        this.isFlipped = !this.isFlipped;
        inner.classList.toggle('flipped', this.isFlipped);
      };
    }

    const btnAgain = document.getElementById('btn-again');
    const btnRemember = document.getElementById('btn-remember');

    if (btnAgain) {
      btnAgain.onclick = () => {
        this.isFlipped = false;
        this.currentIndex++;
        this._render();
      };
    }

    if (btnRemember) {
      btnRemember.onclick = () => {
        Storage.markFlashcardDone(this.course.id, cardKey);
        this.isFlipped = false;
        this.currentIndex++;
        this._render();
      };
    }
  },

  _renderDone() {
    const total = this.cards.length;
    const completed = Storage.get(this.course.id).completedFlashcards;
    const doneInTopic = completed.filter((c) => c.startsWith(this.topicId === '__all__' ? '' : this.topicId)).length;

    this.container.innerHTML = `
      <div class="flashcard-done">
        <div class="done-icon">🎉</div>
        <h3>本轮复习完成！</h3>
        <p>已完成 ${total} 张闪卡的复习</p>
        <button class="btn-primary" id="btn-restart">重新开始</button>
        <button class="btn-outline" id="btn-back-notes" style="margin-left:8px;">返回笔记</button>
      </div>`;

    document.getElementById('btn-restart').onclick = () => {
      this.currentIndex = 0;
      this.isFlipped = false;
      this._render();
    };

    document.getElementById('btn-back-notes').onclick = () => {
      App.navigate('course', { id: this.course.id });
    };
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};

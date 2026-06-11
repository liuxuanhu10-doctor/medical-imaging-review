/* global Storage */

const Quiz = {
  course: null,
  topicId: null,
  questions: [],
  currentIndex: 0,
  score: 0,
  answered: false,
  wrongQuestions: [],
  container: null,

  init(container, course, topicId) {
    this.container = container;
    this.course = course;
    this.topicId = topicId;
    this.currentIndex = 0;
    this.score = 0;
    this.answered = false;
    this.wrongQuestions = [];

    this.questions = this._collectQuestions(course, topicId);

    if (this.questions.length === 0) {
      this._renderEmpty();
      return;
    }

    // Shuffle and limit to 20
    for (let i = this.questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.questions[i], this.questions[j]] = [this.questions[j], this.questions[i]];
    }
    if (this.questions.length > 20) {
      this.questions = this.questions.slice(0, 20);
    }

    this._render();
  },

  _collectQuestions(course, topicId) {
    const result = [];
    const walk = (topics) => {
      for (const t of topics) {
        const match = topicId === '__all__' || t.id === topicId || this._topicContains(t, topicId);
        if (match && t.quiz && t.quiz.length > 0) {
          for (const q of t.quiz) {
            result.push({ ...q, _topicTitle: t.title, _topicId: t.id });
          }
        }
        if (t.subtopics && t.subtopics.length > 0) walk(t.subtopics);
      }
    };
    walk(course.topics);
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

  _renderEmpty() {
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <h3>该章节暂无测验题</h3>
        <p>请选择其他章节或等待添加测验内容</p>
      </div>`;
  },

  _render() {
    if (this.currentIndex >= this.questions.length) {
      this._renderResult();
      return;
    }

    const q = this.questions[this.currentIndex];
    this.answered = false;

    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

    this.container.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-header">
          <span class="quiz-counter">第 ${this.currentIndex + 1} / ${this.questions.length} 题 · ${q._topicTitle}</span>
          <span class="quiz-score">✅ ${this.score}</span>
        </div>
        <div class="quiz-question">
          <h3>${this._escape(q.question)}</h3>
        </div>
        <div class="quiz-options" id="quiz-options">
          ${q.options
            .map(
              (opt, i) => `
            <div class="quiz-option" data-index="${i}">
              <span class="option-letter">${letters[i]}</span>
              <span>${this._escape(opt)}</span>
            </div>`
            )
            .join('')}
        </div>
      </div>`;

    this._bindOptions(q);
  },

  _bindOptions(q) {
    const optionsEl = document.getElementById('quiz-options');
    if (!optionsEl) return;

    const optionEls = optionsEl.querySelectorAll('.quiz-option');

    optionEls.forEach((el) => {
      el.onclick = () => {
        if (this.answered) return;
        this.answered = true;

        const selectedIndex = parseInt(el.dataset.index);
        const isCorrect = selectedIndex === q.answer;

        if (isCorrect) {
          this.score++;
        } else {
          this.wrongQuestions.push({ ...q, userAnswer: selectedIndex });
        }

        // Highlight correct and wrong
        optionEls.forEach((opt, i) => {
          opt.classList.add(i === q.answer ? 'correct' : i === selectedIndex && !isCorrect ? 'wrong' : '');
        });

        // Auto advance after 1.5s
        setTimeout(() => {
          this.currentIndex++;
          this._render();
        }, 1200);
      };
    });
  },

  _renderResult() {
    const total = this.questions.length;
    const pct = Math.round((this.score / total) * 100);
    const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '💪';

    Storage.saveQuizScore(this.course.id, this.score, total, this.topicId);

    this.container.innerHTML = `
      <div class="quiz-result">
        <div class="result-icon">${emoji}</div>
        <div class="result-score">${this.score} / ${total}</div>
        <div class="result-detail">正确率 ${pct}%</div>
        <div class="quiz-result-actions">
          <button class="btn-primary" id="btn-retry-wrong">重做错题 (${this.wrongQuestions.length})</button>
          <button class="btn-primary" id="btn-restart-quiz">重新测验</button>
          <button class="btn-outline" id="btn-back-quiz">返回笔记</button>
        </div>
        ${
          this.wrongQuestions.length > 0
            ? `
          <div style="margin-top:28px;text-align:left;">
            <h4 style="color:var(--accent-dark);margin-bottom:12px;">📋 错题回顾</h4>
            ${this.wrongQuestions
              .map(
                (wq, i) => `
              <div style="background:var(--card-bg);border-radius:var(--radius-sm);padding:16px;margin-bottom:10px;box-shadow:var(--shadow);">
                <p style="font-weight:600;margin-bottom:8px;">${i + 1}. ${this._escape(wq.question)}</p>
                <p style="color:var(--wrong);font-size:var(--font-sm);">❌ 你的答案：${this._escape(wq.options[wq.userAnswer])}</p>
                <p style="color:var(--correct);font-size:var(--font-sm);">✅ 正确答案：${this._escape(wq.options[wq.answer])}</p>
              </div>`
              )
              .join('')}
          </div>`
            : ''
        }
      </div>`;

    this._bindResult();
  },

  _bindResult() {
    const btnRetry = document.getElementById('btn-retry-wrong');
    const btnRestart = document.getElementById('btn-restart-quiz');
    const btnBack = document.getElementById('btn-back-quiz');

    if (btnRetry && this.wrongQuestions.length > 0) {
      btnRetry.onclick = () => {
        this.questions = this.wrongQuestions.map((wq) => ({
          question: wq.question,
          options: wq.options,
          answer: wq.answer,
          _topicTitle: wq._topicTitle,
          _topicId: wq._topicId,
        }));
        this.currentIndex = 0;
        this.score = 0;
        this.wrongQuestions = [];
        this._render();
      };
    }

    if (btnRestart) {
      btnRestart.onclick = () => {
        this.init(this.container, this.course, this.topicId);
      };
    }

    if (btnBack) {
      btnBack.onclick = () => {
        App.navigate('course', { id: this.course.id });
      };
    }
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};

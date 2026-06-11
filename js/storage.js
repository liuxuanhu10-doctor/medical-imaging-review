/* global localStorage */

const Storage = {
  _key(courseId) {
    return `medreview_${courseId}`;
  },

  get(courseId) {
    try {
      const raw = localStorage.getItem(this._key(courseId));
      return raw ? JSON.parse(raw) : this._default();
    } catch {
      return this._default();
    }
  },

  _default() {
    return {
      completedFlashcards: [],
      quizScores: [],
    };
  },

  save(courseId, data) {
    try {
      localStorage.setItem(this._key(courseId), JSON.stringify(data));
    } catch { /* storage full, ignore */ }
  },

  markFlashcardDone(courseId, cardKey) {
    const data = this.get(courseId);
    if (!data.completedFlashcards.includes(cardKey)) {
      data.completedFlashcards.push(cardKey);
    }
    this.save(courseId, data);
  },

  saveQuizScore(courseId, score, total, topicId) {
    const data = this.get(courseId);
    data.quizScores.push({ score, total, topicId, date: Date.now() });
    this.save(courseId, data);
  },

  getFlashcardProgress(courseId, totalCards) {
    const data = this.get(courseId);
    return totalCards > 0
      ? Math.round((data.completedFlashcards.length / totalCards) * 100)
      : 0;
  },

  getTotalFlashcardCount(courseId) {
    return this.get(courseId).completedFlashcards.length;
  },
};

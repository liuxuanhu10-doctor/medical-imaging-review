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
      completedTopics: [],
    };
  },

  save(courseId, data) {
    try {
      localStorage.setItem(this._key(courseId), JSON.stringify(data));
    } catch { /* storage full, ignore */ }
  },

  toggleTopicDone(courseId, topicId) {
    const data = this.get(courseId);
    const idx = data.completedTopics.indexOf(topicId);
    if (idx >= 0) {
      data.completedTopics.splice(idx, 1);
    } else {
      data.completedTopics.push(topicId);
    }
    this.save(courseId, data);
  },

  isTopicDone(courseId, topicId) {
    return this.get(courseId).completedTopics.includes(topicId);
  },

  getTopicProgress(courseId, totalTopics) {
    const data = this.get(courseId);
    return totalTopics > 0
      ? Math.round((data.completedTopics.length / totalTopics) * 100)
      : 0;
  },
};

/* ============================================================
   D-PT Scoring Engine
   Converts raw answers -> raw scores -> normalized 0..100 scores.
   Multi-dimensional weighted scoring with reverse-keying.
   ============================================================ */

const Engine = (() => {

  /**
   * Compute scores from an answers map.
   * @param {Object} answers - { questionId: value }
   *   - likert value: 1..5
   *   - choice value: option index (0-based)
   * @returns {Object} normalized scores { dimKey: 0..100 }, plus rawScores
   */
  function computeScores(answers) {
    // Track weighted sum and max-possible per dimension for normalization
    const sum = {};      // accumulated weighted contribution
    const maxPos = {};   // max possible positive contribution
    const minPos = {};   // min possible (most negative) contribution

    for (const key in DIMENSIONS) { sum[key] = 0; maxPos[key] = 0; minPos[key] = 0; }

    for (const q of QUESTIONS) {
      const ans = answers[q.id];
      if (ans === undefined || ans === null) continue;

      if (q.type === "likert") {
        // Center likert: value 1..5 -> -2..+2 so reverse-keying works symmetrically
        const centered = (ans - 3); // -2..+2
        for (const dim in q.weights) {
          const w = q.weights[dim];
          sum[dim]   += centered * w;
          maxPos[dim]+= 2 * Math.abs(w);   // best case toward this dim
          minPos[dim]+= -2 * Math.abs(w);  // worst case
        }
      } else if (q.type === "choice") {
        const opt = q.options[ans];
        if (!opt) continue;
        for (const dim in opt.weights) {
          const w = opt.weights[dim];
          sum[dim] += w * 2; // choice carries full weight
        }
        // For choice questions, accumulate the theoretical range across all options
        accumulateChoiceRange(q, maxPos, minPos);
      }
    }

    // Normalize each dimension to 0..100
    const normalized = {};
    const raw = {};
    for (const key in DIMENSIONS) {
      raw[key] = +sum[key].toFixed(2);
      const lo = minPos[key], hi = maxPos[key];
      let norm;
      if (hi - lo === 0) {
        norm = 50;
      } else {
        norm = ((sum[key] - lo) / (hi - lo)) * 100;
      }
      normalized[key] = clamp(Math.round(norm), 0, 100);
    }

    return { normalized, raw };
  }

  /** For a choice question, add best/worst possible weight per dim. */
  function accumulateChoiceRange(q, maxPos, minPos) {
    const dimBest = {}, dimWorst = {};
    for (const opt of q.options) {
      for (const dim in opt.weights) {
        const v = opt.weights[dim] * 2;
        dimBest[dim]  = Math.max(dimBest[dim]  ?? -Infinity, v);
        dimWorst[dim] = Math.min(dimWorst[dim] ?? Infinity, v, 0);
      }
    }
    for (const dim in dimBest) {
      maxPos[dim] += Math.max(dimBest[dim], 0);
      minPos[dim] += Math.min(dimWorst[dim], 0);
    }
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** Map a 0..100 score to a qualitative band. */
  function band(score) {
    if (score >= 75) return "بسیار بالا";
    if (score >= 60) return "بالا";
    if (score >= 40) return "متعادل";
    if (score >= 25) return "پایین";
    return "بسیار پایین";
  }

  /** Derive an MBTI-style 4-letter code from key dimensions. */
  function deriveType(n) {
    const ei = n.E >= 50 ? "E" : "I";
    const sn = n.O >= 50 ? "N" : "S";      // openness -> intuition
    const tf = n.D >= 50 ? "T" : "F";      // rational -> thinking
    const jp = n.C >= 50 ? "J" : "P";      // conscientious -> judging
    return ei + sn + tf + jp;
  }

  return { computeScores, band, deriveType, clamp };
})();

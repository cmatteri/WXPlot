/**
 * An interval of time
 */
class Interval {
  /**
   * @param {Number} start - Unix time of the start of the interval in ms.
   * @param {Number} end - Unix time of the end of the interval in ms.
   */
  constructor(start, end) {
    if (typeof start !== 'number' || typeof end !== 'number') {
      throw new TypeError('Interval start and end must be unix time in ms.');
    }
    this.start = start;
    this.end = end;
  }

  equals(other) {
    return this.start === other.start && this.end === other.end;
  }
}

// jsdoc doesn't work when the export is at the declaration.
module.exports = Interval;
const moment = window.moment;

// An interval of time, with start and end represented by Moment.js moments
class MomentInterval {
  /**
   * @param {Moment} start - Moment representing the start of the interval.
   * @param {Moment} end - Moment representing the end of the interval.
   */
  constructor(start, end) {
    if (!(start instanceof moment) || !(end instanceof moment)
        || !start.tz() || !end.tz()) {
      throw new Error(
        'Interval start and end must be moments with time zones.');
    }
    this.start = start;
    this.end = end;
  }

  equals(other) {
    return this.start.isSame(other.start) && this.end.isSame(other.end);
  }
}

// Having the export at the declaration breaks jsdoc.
module.exports = MomentInterval;
let DataSegment = require('./datasegment.js');

/*
 * Holds a set of contiguous DataSegment objects. See the DataView class comment
 * for its purpose.
 */
module.exports = class DataBlock {
  /*
   * Creates a DataBlock, but doesn't doesn't create its DataSegments.
   * @param {Number} start - Unix time (in ms) of the start of the block's interval
   * @param {Number} end - Unix time (in ms) of the end of the block's interval
   * @param {Object} dataParams - Same as object passed to the addTrace method
   * in the plot class
   * @param {Number} segmentCount - The number of segments to split the interval
   * into
   */
  constructor(start, end, dataParams, segmentCount) {
    this._interval = {start, end};
    this._dataParams = dataParams;
    this._segmentCache = [];
    this._onLoaded = null;
    this._segmentLength = (end - start) / segmentCount;
    const pointsPerSegment = dataParams.minDataPoints * 2;
    this._aggregateInterval = this._segmentLength / pointsPerSegment;
    this._segments = null;
    this._data = null;
  }

  /*
   * @param {Array} segmentCache - A cache of segments created previously. They
   * may still be loading.
   * @param {Function} onLoaded - Callback that is called once all DataSegments
   * in this DataBlock have loaded
   * @returns {DataBlock} the object load was called on
   */
  load(segmentCache, onLoaded) {
    if (segmentCache) this._segmentCache = segmentCache;
    this._onLoaded = onLoaded;
    this._getSegments();
    return this;
  }

  interval() {
    return this._interval;
  }

  data() {
    return this._data;
  }

  aggregateInterval() {
    return this._aggregateInterval
  }

  // @returns {Boolean} True iff all data has loaded
  get loaded() {
    return this._data !== null;
  }

  // Creates the segments. They will automatically load themselves from the server.
  _getSegments() {
    var segmentPromises = [];
    for (var segmentStart = this._interval.start; segmentStart < this._interval.end; segmentStart += this._segmentLength) {
      segmentPromises.push(new Promise((resolve, reject) => {
        let segment = this._getSegment(segmentStart, segmentStart + this._segmentLength, this._aggregateInterval);
        if (segment.loaded()) {
          resolve(segment);
        } else {
          segment.onLoaded(() => resolve(segment));
        }
      }));
    }
    Promise.all(segmentPromises).then(segments => {
      this._segments = segments;
      let data = [];
      segments.forEach(segment => {
        this._segmentCache.push(segment);
        data.push.apply(data, segment.data());
      });
      const times = d3.range(this._interval.start, this._interval.end, this._aggregateInterval);
      this._data = [];
      for (let i = 0; i < times.length; i++) {
        this._data.push([times[i], data[i]]);
      }
      this._onLoaded();
    });
  }

  /*
   * Checks the segment cache for a segment. If the segment is not found, it is 
   * created and added to the cache.
   * The parameters are the same as those of the DataSegment constructor with
   * the same name.
   */
  _getSegment(start, end, aggregateInterval) {
    for (const segment of this._segmentCache) {
      if (start === segment.interval().start
          && end === segment.interval().end) {
        return segment;
      }
    }
    return new DataSegment(start, end, aggregateInterval, this._dataParams);
  }
}
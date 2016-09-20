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
    this.interval = {start, end};
    this.dataParams = dataParams;
    this.segmentCache = [];
    this.onLoaded = null;
    this.segmentLength = (end - start) / segmentCount;
    this.pointsPerSegment = dataParams.minDataPoints * 2;
    this.aggregateInterval = this.segmentLength / this.pointsPerSegment;
    this.segments = null;
    this.data = null;
  }

  // Compares two DataBlocks
  isSameAs(other) {
    return this.interval.start === other.interval.start
      && this.interval.end === other.interval.end;
  }

  /*
   * @param {Array} segmentCache - A cache of segments created previously. They
   * may still be loading.
   * @param {Function} onLoaded - Callback that is called once all DataSegments
   * in this DataBlock have loaded
   * @returns {DataBlock} the object load was called on
   */
  load(segmentCache, onLoaded) {
    if (segmentCache) this.segmentCache = segmentCache;
    this.onLoaded = onLoaded;
    this.getSegments();
    return this;
  }

  // @returns {Boolean} True iff all data has loaded
  get loaded() {
    return this.data !== null;
  }

  // Creates the segments. They will automatically load themselves from the server.
  getSegments() {
    var segmentPromises = [];
    for (var segmentStart = this.interval.start; segmentStart < this.interval.end; segmentStart += this.segmentLength) {
      segmentPromises.push(new Promise((resolve, reject) => {
        let segment = this.getSegment(segmentStart, segmentStart + this.segmentLength, this.aggregateInterval);
        if (segment.loaded) {
          resolve(segment);
        } else {
          if (segment.onLoaded) {
            var oldCallback = segment.onLoaded;
            segment.onLoaded = () => {
              old();
              resolve(segment);
            }
          } else {
            segment.onLoaded = () => resolve(segment);
          }
        }
      }));
    }
    Promise.all(segmentPromises).then(segments => {
      this.segments = segments;
      let data = [];
      segments.forEach(segment => {
        this.segmentCache.push(segment);
        data.push.apply(data, segment.data);
      });
      const times = d3.range(this.interval.start, this.interval.end, this.aggregateInterval);
      this.data = [];
      for (let i = 0; i < times.length; i++) {
        this.data.push([times[i], data[i]]);
      }
      this.onLoaded();
    });
  }

  /*
   * Checks the segment cache for a segment. If the segment is not found, it is 
   * created and added to the cache.
   * The parameters are the same as those of the DataSegment constructor with
   * the same name.
   */
  getSegment(start, end, aggregateInterval) {
    for (const segment of this.segmentCache) {
      if (segment.start === start && segment.end === end && segment.aggregateInterval === aggregateInterval) {
        return segment;
      }
    }
    return new DataSegment(start, end, aggregateInterval, this.dataParams);
  }
}
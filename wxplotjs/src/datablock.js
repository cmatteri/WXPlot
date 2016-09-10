let DataSegment = require("./datasegment.js");

module.exports = class DataBlock {
  constructor(start, end, dataParams) {
    this.interval = {start, end};
    this.dataParams = dataParams;
    this.segmentCache = [];
    this.onLoaded = null;
    this.SEGMENTS_PER_DATA_INTERVAL = 4;
    this.segmentLength = (end - start) / this.SEGMENTS_PER_DATA_INTERVAL;
    this.pointsPerSegment = dataParams.minDataPoints * 2;
    this.aggregateInterval = this.segmentLength / this.pointsPerSegment;
    this.segments = null;
    this.data = null;
  }

  isSameAs(other) {
    return this.interval.start === other.interval.start
      && this.interval.end === other.interval.end;
  }

  load(segmentCache, onLoaded) {
    if (segmentCache) this.segmentCache = segmentCache;
    this.onLoaded = onLoaded;
    this.getSegments();
  }

  get loaded() {
    return this.data !== null;
  }

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

  getSegment(start, end, aggregateInterval) {
    for (const segment of this.segmentCache) {
      if (segment.start === start && segment.end === end && segment.aggregateInterval === aggregateInterval) {
        return segment;
      }
    }
    return new DataSegment(start, end, aggregateInterval, this.dataParams);
  }
}
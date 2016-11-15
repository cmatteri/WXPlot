let DataBlock = require('./datablock.js');

/*
 * Gets data for a trace, given a time interval. Data is loaded from the server
 * in small segments (represented by the DataSegment class) to allow seamless
 * panning and to facilitate caching. When the time interval is changed, a set
 * of segments that give an appropriate resolution for that interval is loaded.
 * It takes time for segments to load, and they likely won't all load at the
 * same time. The DataBlock class represents a set of segments, and simplifies
 * the transition from one set to another. DataSegments are cached to avoid
 * loading them multiple times if they occur in multiple DataBlocks. The time
 * intervals of the segments are chosen in a repeatable manner, to facilitate
 * caching on the server and in the browser.
 */
module.exports = class DataView {
  /*
   * Creates a DataView. The interval is not known yet, so no data is loaded.
   * dataParams is that same object that is passed to the addTrace method in the
   * plot class.
   */
  constructor(dataParams) {
    this.dataParams = dataParams;
    this.segmentCache = [];
    this.currentDataBlock = null;
    this.nextDataBlock = null;
    this.extent = null;
    this.interval = null;
    this.onDataBlockLoaded = null;
    this.dataCache = null;
    this.DATABLOCK_LOAD_DELAY_MS = 100;
  }

  /*
   * Returns true iff the DataView is loading data (it is loading a new
   * DataBlock)
   */
  isLoading() {
    return this.nextDataBlock != null;
  }

  /*
   * Returns true iff the DataView has loaded a DataBlock is not loading a new
   * one
   */
  isLoaded() {
    return this.currentDataBlock != null;
  }

  /*
   * @param {Number} start - Unix time (in ms) of the start of the interval
   * @param {Number} end - Unix time (in ms) of the end of the interval
   * @param {Function} onLoaded - Callback that is called once the DataView has
   * loaded new data.
   * @returns {DataView} The object setInterval was called on
   */
  setInterval(start, end, onLoaded) {
    this.interval = {start, end};
    this.updateDataBlock();
    return this;
  }

  /*
   * Caches data for the DataView's interval. This data is a slice of the
   * DataView's current DataBlock's data. It is cached to avoid having to
   * compute that slice every time it is accessed.
   */
  cacheData() {
    const block = this.currentDataBlock;
    if (this.dataCache != null && this.dataCache.start === this.interval.start
      && this.dataCache.end === this.interval.end && this.dataCache.block === block) {
      return;
    }

    let firstIndex = Math.ceil((this.interval.start - block.interval.start)
      / block.aggregateInterval);
    if (firstIndex < 0) firstIndex = 0;
    const lastIndex = Math.floor((this.interval.end - block.interval.start)
      / block.aggregateInterval);

    const data = block.data.slice(firstIndex, lastIndex + 1);
    const firstBefore = (firstIndex === 0 || data.length === 0) ? null : block.data[firstIndex - 1];
    const firstAfter = (lastIndex === block.data.length - 1 || data.length === 0)
      ? null : block.data[lastIndex + 1];

    let displayData = [];

    let first = data[0];
    if (firstBefore && first[1] && firstBefore[1]) {
      const interval = first[0] - firstBefore[0];
      const start = this.interval.start;
      const left = first[1] - ((first[1] - firstBefore[1]) 
        / interval * (first[0] - start));
      displayData.push([start, left]);
    }

    displayData.push.apply(displayData, data);

    let last = data[data.length - 1];
    if (firstAfter && last[1] && firstAfter[1]) {
      const interval = firstAfter[0] - last[0];
      const end = this.interval.end;
      const right = last[1] + ((firstAfter[1] - last[1])
        / interval * (end - last[0]));
      displayData.push([end, right]);
    }

    this.dataCache = {
      start: this.interval.start,
      end: this.interval.end,
      block,
      data,
      displayData
    }
  }

  getData() {
    this.cacheData();
    return this.dataCache.data;
  };

  getDisplayData() {
    this.cacheData();
    return this.dataCache.displayData;
  }

  /*
   * Determines the appropriate DataBlock for the current interval. If that
   * DataBlock is already the current DataBlock, nothing is done. Otherwise,
   * the new DataBlock is created and loaded.
   */
  updateDataBlock() {
    const SEGMENTS_PER_BLOCK = 4;
    const segmentLength = this.segmentLength();

    const startOfThirdSegment = Math.floor(this.interval.start / segmentLength) * segmentLength;
    const startOfFirstSegment = startOfThirdSegment - 2*segmentLength;
    const endOflastSegment = startOfFirstSegment + 4*segmentLength;

    const target = new DataBlock(startOfFirstSegment, endOflastSegment,
      this.dataParams, SEGMENTS_PER_BLOCK); 
    if ((this.currentDataBlock && target.isSameAs(this.currentDataBlock))
        || (this.nextDataBlock && target.isSameAs(this.nextDataBlock))) {
        return;
    }

    // Prevent the segment cache from getting too large.
    if (this.segmentCache.length > 100) {
      this.segmentCache = this.segmentCache.slice(50);
    }

    // If a DataBlock is scheduled to be loaded, cancel the load. The other DataBlock is no longer needed (see comment below).
    if(this.timeoutID) {
      window.clearTimeout(this.timeoutID);
    }

    // The new DataBlock is not loaded immediately. If the user is rapidly zooming in or out it doesn't make sense to load intermediate data blocks because they probably won't load fast enough for smooth zooming and they flood the server with requests, making the data at the final zoom level load more slowly.
    this.timeoutID = window.setTimeout((segmentCache, onLoaded) => {
      this.timeoutID = null;
      target.load.call(target, segmentCache, onLoaded);
    }, this.DATABLOCK_LOAD_DELAY_MS, this.segmentCache, () => {
      // If the DataBlock we wish to load changes before this one loads,
      // don't do anything when this one loads.
      if (this.nextDataBlock !== target) return;
      this.currentDataBlock = target;
      this.nextDataBlock = null;
      if (this.onDataBlockLoaded) {
        this.onDataBlockLoaded();
        this.onDataBlockLoaded = null;
      }
    });
    this.nextDataBlock = target;
    // The function referenced by onDataBlockLoaded (if any) is a callback for
    // the loading of a different DataBlock than nextDataBlock, so it is
    // cleared.
    this.onDataBlockLoaded = null;
  }

  /*
   * Returns the segment length in ms. It is calculated from the length of the
   * current interval (the level of zoom).
   */
  segmentLength() {
    const MS_PER_MINUTE = 60 * 1000;
    const pointsPerSegment = this.dataParams.minDataPoints * 2;
    const minSegment = this.dataParams.archiveIntervalMinutes * MS_PER_MINUTE * pointsPerSegment;
    const delta = this.interval.end - this.interval.start;
    let exponent = Math.log(delta / minSegment) / Math.log(2);
    if (exponent < 0) {
      exponent = 0;
    }
    return minSegment * Math.pow(2, Math.ceil(exponent));
  }
}


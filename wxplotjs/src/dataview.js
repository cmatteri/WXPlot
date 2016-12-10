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
    this._dataParams = dataParams;
    this._segmentCache = [];
    this._currentDataBlock = null;
    this._nextDataBlock = null;
    this._extent = null;
    this._interval = null;
    this._onDataBlockLoaded = null;
    this._dataCache = null;
    this._DATABLOCK_LOAD_DELAY_MS = 100;
  }

  onLoaded(callback) {
    this._onDataBlockLoaded = callback;
  }

  /*
   * Returns true iff the DataView is loading data (it is loading a new
   * DataBlock)
   */
  isLoading() {
    return this._nextDataBlock != null;
  }

  /*
   * Returns true iff the DataView has loaded a DataBlock is not loading a new
   * one
   */
  isLoaded() {
    return this._currentDataBlock != null;
  }

  /*
   * @param {Number} start - Unix time (in ms) of the start of the interval
   * @param {Number} end - Unix time (in ms) of the end of the interval
   * @param {Function} onLoaded - Callback that is called once the DataView has
   * loaded new data.
   * @returns {DataView} The object setInterval was called on
   */
  setInterval(start, end, onLoaded) {
    this._interval = {start, end};
    this._updateDataBlock();
    return this;
  }

  /*
   * Caches data for the DataView's interval. This data is a slice of the
   * DataView's current DataBlock's data. It is cached to avoid having to
   * compute that slice every time it is accessed.
   */
  _cacheData() {
    const block = this._currentDataBlock;
    if (this._dataCache != null && this._dataCache.start === this._interval.start
      && this._dataCache.end === this._interval.end && this._dataCache.block === block) {
      return;
    }

    let firstIndex = Math.ceil((this._interval.start - block.interval().start)
      / block.aggregateInterval());
    if (firstIndex < 0) firstIndex = 0;
    const lastIndex = Math.floor((this._interval.end - block.interval().start)
      / block.aggregateInterval());

    const data = block.data().slice(firstIndex, lastIndex + 1);
    const firstBefore = (firstIndex === 0 || data.length === 0) ? null : block.data()[firstIndex - 1];
    const firstAfter = (lastIndex === block.data().length - 1 || data.length === 0)
      ? null : block.data()[lastIndex + 1];

    let displayData = [];

    let first = data[0];
    if (firstBefore && first[1] && firstBefore[1]) {
      const interval = first[0] - firstBefore[0];
      const start = this._interval.start;
      const left = first[1] - ((first[1] - firstBefore[1]) 
        / interval * (first[0] - start));
      displayData.push([start, left]);
    }

    displayData.push.apply(displayData, data);

    let last = data[data.length - 1];
    if (firstAfter && last[1] && firstAfter[1]) {
      const interval = firstAfter[0] - last[0];
      const end = this._interval.end;
      const right = last[1] + ((firstAfter[1] - last[1])
        / interval * (end - last[0]));
      displayData.push([end, right]);
    }

    this._dataCache = {
      start: this._interval.start,
      end: this._interval.end,
      block,
      data,
      displayData
    }
  }

  getData() {
    this._cacheData();
    return this._dataCache.data;
  };

  getDisplayData() {
    this._cacheData();
    return this._dataCache.displayData;
  }

  /*
   * Determines the appropriate DataBlock for the current interval. If that
   * DataBlock is already the current DataBlock, nothing is done. Otherwise,
   * the new DataBlock is created and loaded.
   */
  _updateDataBlock() {
    function dataBlocksHaveSameInterval(first, second) {
      return first.interval().start === second.interval().start
        && first.interval().end === second.interval().end;
    }
    const SEGMENTS_PER_BLOCK = 4;
    const _segmentLength = this._segmentLength();

    const startOfThirdSegment = Math.floor(this._interval.start / _segmentLength) * _segmentLength;
    const startOfFirstSegment = startOfThirdSegment - 2*_segmentLength;
    const endOflastSegment = startOfFirstSegment + 4*_segmentLength;

    const target = new DataBlock(startOfFirstSegment, endOflastSegment,
      this._dataParams, SEGMENTS_PER_BLOCK); 
    if ((this._currentDataBlock
        && dataBlocksHaveSameInterval(target, this._currentDataBlock))
      || (this._nextDataBlock
        && dataBlocksHaveSameInterval(target, this._nextDataBlock))) { 
      return;
    }

    // Prevent the segment cache from getting too large.
    if (this._segmentCache.length > 100) {
      this._segmentCache = this._segmentCache.slice(50);
    }

    // If a DataBlock is scheduled to be loaded, cancel the load. The other DataBlock is no longer needed (see comment below).
    if(this.timeoutID) {
      window.clearTimeout(this.timeoutID);
    }

    // The new DataBlock is not loaded immediately. If the user is rapidly
    // zooming in or out it doesn't make sense to load intermediate data blocks
    // because they probably won't load fast enough for smooth zooming and they
    // flood the server with requests, making the data at the final zoom level
    // load more slowly.
    this.timeoutID = window.setTimeout((segmentCache, onLoaded) => {
      this.timeoutID = null;
      target.load.call(target, segmentCache, onLoaded);
    }, this._DATABLOCK_LOAD_DELAY_MS, this._segmentCache, () => {
      // If the DataBlock we wish to load changes before this one loads,
      // don't do anything when this one loads.
      if (this._nextDataBlock !== target) return;
      this._currentDataBlock = target;
      this._nextDataBlock = null;
      if (this._onDataBlockLoaded) {
        // this._onDataBlockLoaded must be set to null because the DataBlock it
        // corresponds to has loaded. We need to set this._onDataBlockLoaded to
        // null before calling the callback, since the callback may change this
        // DataView's interval and set this._onDataBlockLoaded.
        const callback = this._onDataBlockLoaded;
        this._onDataBlockLoaded = null;
        callback();
      }
    });
    this._nextDataBlock = target;
    // The function referenced by onDataBlockLoaded (if any) is a callback for
    // the loading of a different DataBlock than nextDataBlock, so it is
    // cleared.
    this._onDataBlockLoaded = null;
  }

  /*
   * Returns the segment length in ms. It is calculated from the length of the
   * current interval (the level of zoom).
   */
  _segmentLength() {
    const MS_PER_MINUTE = 60 * 1000;
    const pointsPerSegment = this._dataParams.minDataPoints * 2;
    const minSegment = this._dataParams.archiveIntervalMinutes * MS_PER_MINUTE * pointsPerSegment;
    const delta = this._interval.end - this._interval.start;
    let exponent = Math.log(delta / minSegment) / Math.log(2);
    if (exponent < 0) {
      exponent = 0;
    }
    return minSegment * Math.pow(2, Math.ceil(exponent));
  }
}


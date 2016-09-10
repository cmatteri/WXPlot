let DataBlock = require("./datablock.js");

module.exports = class DataView {
  constructor(dataParams) {
    this.dataParams = dataParams;
    this.segmentCache = [];
    this.currentDataBlock = null;
    this.nextDataBlock = null;
    this.extent = null;
    this.interval = null;
    this.onLoaded = null;
    this.dataCache = null;
    this.DATABLOCK_LOAD_DELAY_MS = 100;
  }

  isLoading() {
    return this.nextDataBlock != null;
  }

  isLoaded() {
    return this.currentDataBlock != null;
  }

  setInterval(start, end, onLoaded) {
    this.interval = {start, end};
    this.updateDataBlock();
    return this;
  }

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

  updateDataBlock() {
    const segmentLength = this.segmentLength();

    const startOfThirdSegment = Math.floor(this.interval.start / segmentLength) * segmentLength;
    const startOfFirstSegment = startOfThirdSegment - 2*segmentLength;
    const endOflastSegment = startOfFirstSegment + 4*segmentLength;

    const target = new DataBlock(startOfFirstSegment, endOflastSegment, this.dataParams); 
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
      if (this.onLoaded) this.onLoaded();
    });
    this.nextDataBlock = target;
  }

  // returns the segment length in ms
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


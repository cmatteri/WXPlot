/*
 * A segment of data that is loaded from the server. See the DataView class
 * comment for its purpose.
 */
module.exports = class DataSegment {
  /*
   * Constructs a DataSegment, and loads its data from the server.
   * @param {Number} start - Unix time (in ms) of the start of the data
   * @param {Number} end - Unix time (in ms) of the end of the data
   * @param {Number} aggregateInterval - The time between points in ms
   * @param {Object} dataParams - Same as object passed to the addTrace method
   * in the plot class
   */
  constructor(start, end, aggregateInterval, dataParams) {
    this._interval = {start, end};;
    if ('offset' in dataParams) {
      this._interval.start -= dataParams.offset;
      this._interval.end -= dataParams.offset;
    }
    this._aggregateInterval = aggregateInterval;
    this._dataParams =  dataParams;
    this._pointsPerSegment = Math.floor((end - start) / aggregateInterval);
    this._data = null;
    this._onLoaded = null;
    this._getData();
  }

  interval() {
    return this._interval;
  }

  data() {
    return this._data;
  }

  // Returns true iff the data is loaded
  loaded() {
    return this._data !== null;
  }

  onLoaded(callback) {
    this._onLoaded = callback;
  }

  // Gets the data from the server.
  _getData() {
    var startDate = new Date(this._interval.start);
    var endDate = new Date(this._interval.end);

    d3.request(this._dataParams.url + '?start=' + encodeURIComponent(startDate.toISOString())
      + '&end=' + encodeURIComponent(endDate.toISOString())
      + '&aggregateInterval=' + this._aggregateInterval/1000
      + '&aggregateType=' + this._dataParams.aggregateType)
      .get((error, xhr) => {
        if (error) {
          return;
        }
        this._data = JSON.parse(xhr.responseText).values;
        if (this._data.length != this._pointsPerSegment) {
          this._data[this._pointsPerSegment - 1] = null;
        }
        if (this._onLoaded) this._onLoaded();
    });
  }
}
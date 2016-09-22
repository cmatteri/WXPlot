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
    this.start = start;
    this.end = end;
    if ('offset' in dataParams) {
      this.start -= dataParams.offset;
      this.end -= dataParams.offset;
    }
    this.aggregateInterval = aggregateInterval;
    this.dataParams =  dataParams;
    this.pointsPerSegment = Math.floor((end - start) / aggregateInterval);
    this.data = null;
    this.onLoaded = null;
    this.getData();
  }

  // Returns true iff the data is loaded
  get loaded() {
    return this.data !== null;
  }

  // Gets the data from the server.
  getData() {
    var startDate = new Date(this.start);
    var endDate = new Date(this.end);

    d3.request(this.dataParams.url + '?start=' + encodeURIComponent(startDate.toISOString())
      + '&end=' + encodeURIComponent(endDate.toISOString())
      + '&aggregateInterval=' + this.aggregateInterval/1000
      + '&aggregateType=' + this.dataParams.aggregateType)
      .get((error, xhr) => {
        if (error) {
          return;
        }
        this.data = JSON.parse(xhr.responseText).values;
        if (this.data.length != this.pointsPerSegment) {
          this.data[this.pointsPerSegment - 1] = null;
        }
        if (this.onLoaded) this.onLoaded();
    });
  }
}
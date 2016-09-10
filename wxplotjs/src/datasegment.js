module.exports = class DataSegment {
  constructor(start, end, aggregateInterval, dataParams) {
    this.start = start;
    this.end = end;
    this.aggregateInterval = aggregateInterval;
    this.dataParams =  dataParams;
    this.pointsPerSegment = Math.floor((end - start) / aggregateInterval);
    this.data = null;
    this.onLoaded = null;
    this.getData();
  }

  get loaded() {
    return this.data !== null;
  }

  getData() {
    var startDate = new Date(this.start);
    var endDate = new Date(this.end);

    d3.request(this.dataParams.url + "?start=" + encodeURIComponent(startDate.toISOString())
      + "&end=" + encodeURIComponent(endDate.toISOString())
      + "&aggregateInterval=" + this.aggregateInterval/1000
      + "&type=" + encodeURIComponent(this.dataParams.type)
      + "&aggregateType=" + this.dataParams.aggregateType)
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
const d3 = window.d3;
const Interval = require('./interval.js');

// Gets data for a trace. Data is loaded from the server in small segments to
// allow seamless panning and to facilitate caching. The DataFetcher class
// loads data in groups of four continguous segments, referred to as sections.
// It caches a single section in its state, which facilitates fast access to
// data when the requested time interval only changes slightly between
// requests, such as when a plot is being panned or zoomed. Eventually, after
// the interval changes sufficiently, a new section is loaded.

const SECTION_LOAD_DELAY_MS = 100;

module.exports = class DataFetcher {
  // See addTrace in plot.js for a description of the dataParams object
  constructor(dataParams) {
    this._dataParams = dataParams;
    this._sectionInterval = null;
    this._sectionPromise = null;
    this._section = null;
    this._pointsPerSegment = this._dataParams.minDataPoints * 2;
    this._segmentCache = [];
  }

  /**
   * Gets data for a trace.
   * @param {Object} interval - Specifies the time interval to get data from
   * @param {Number} interval.start - Unix time of the start of the interval in
   * ms.
   * @param {Number} interval.end - Unix time of the end of the interval in ms.
   * @returns {Array OR Promise} The data within the interval, with two extra
   * data points outside the interval on either side. The first extra point is
   * included so the trace extends to the edges of the plot. The second is
   * included so the curvature doesn't noticibly change when new points are
   * loaded at the edges. If the data is available, it is returned as an array.
   * If it is loading, a Promise for the data is returned. If the data is
   * available, it is desirable to use it immediately. Even if we return a
   * Promise that is resolved, we can't get the data immediately, because then
   * functions are not run immediately.
   */
  getWideData(interval) {
    this._updateSection(interval);
    // If the data is available, return an array
    if (this._section) {
      return this._getDataFromSection(interval, this._section,
                                      this._sectionInterval);
    // Otherwise, return a Promise for the data
    } else {
      // this._sectionInterval may change before the Promise is resolved, so
      // put a local copy in the closure.
      const sectionInterval = this._sectionInterval;
      return this._sectionPromise.then((section) => {
        return this._getDataFromSection.call(this, interval, section,
                                             sectionInterval);
      });
    }
  }

  // Extracts the data within interval from section (an array), plus two extra
  // points outside interval on either side.
  _getDataFromSection(interval, section, sectionInterval) {
    const aggregateInterval = (sectionInterval.end - sectionInterval.start)
      / 4 / this._pointsPerSegment;
    let firstIndex = Math.ceil((interval.start - sectionInterval.start)
      / aggregateInterval) - 2;
    const lastIndex = Math.floor((interval.end - sectionInterval.start)
      / aggregateInterval) + 2;
    return section.slice(firstIndex, lastIndex + 1);
  }

  // Loads and caches the section corresponding to dataInterval. If that
  // section is already cached, nothing is done.
  _updateSection(dataInterval) {
    const sectionInterval = this._getSectionInterval(dataInterval);

    if (this._sectionInterval
        && this._sectionInterval.equals(sectionInterval)) {
      return;
    }

    // If a section is scheduled to be loaded, cancel the load. It is no longer
    // needed (see comment below).
    if(this._timeoutID) {
      window.clearTimeout(this._timeoutID);
    }

    // The section is not loaded immediately. If the user is rapidly
    // zooming in or out it doesn't make sense to load intermediate sections
    // because they probably won't load fast enough for smooth zooming and they
    // flood the server with requests, making the data at the final zoom level
    // load more slowly.
    this._sectionInterval = sectionInterval;
    this._section = null;
    this._sectionPromise = new Promise((resolve, reject) => {
      this._timeoutID = window.setTimeout(() => {
        this._timeoutID = null;
        this._fetchSection(sectionInterval).then(section => {
          this._section = section;
          resolve(section);
        });
      }, SECTION_LOAD_DELAY_MS);
    });
  }

  // Gets the interval of the section that corresponds to dataInterval. The
  // section interval is chosen such that there is at least one segment on
  // either side of dataInterval.
  _getSectionInterval(dataInterval) {
    const _segmentLength = this._segmentLength(dataInterval);

    const startOfThirdSegment = Math.floor(dataInterval.start / _segmentLength)
      * _segmentLength;
    const startOfFirstSegment = startOfThirdSegment - 2*_segmentLength;
    const endOflastSegment = startOfFirstSegment + 4*_segmentLength;

    return new Interval(startOfFirstSegment, endOflastSegment);
  }


  // Returns the segment length in ms. It is calculated from the length of
  // dataInterval (the level of zoom).
  _segmentLength(dataInterval) {
    const MS_PER_MINUTE = 60 * 1000;
    const minSegment = this._dataParams.archiveIntervalMinutes * MS_PER_MINUTE
      * this._pointsPerSegment;
    const delta = dataInterval.end - dataInterval.start;
    let exponent = Math.log(delta / minSegment) / Math.log(2);
    if (exponent < 0) {
      exponent = 0;
    }
    return minSegment * Math.pow(2, Math.ceil(exponent));
  }

  // Returns a Promise for a section (an array). interval is the section's
  // interval.
  _fetchSection(interval) {
    const segmentLength = (interval.end - interval.start) / 4;
    // aggregateInterval is the time between data points in ms
    const aggregateInterval = segmentLength / this._pointsPerSegment;

    const segmentPromises = [];
    for (let segmentStart = interval.start;
        segmentStart < interval.end;
        segmentStart += segmentLength) {
      const segmentInterval = new Interval(segmentStart,
                                           segmentStart + segmentLength);
      segmentPromises.push(
        this._fetchSegment(segmentInterval, aggregateInterval));
    }
    return Promise.all(segmentPromises).then(segments => {
      let data = [];
      // Catenate the data from the four segments
      segments.forEach(segment => {
        data.push.apply(data, segment);
      });
      // Transform the array of data points into an array of time/value pairs
      const times = d3.range(interval.start, interval.end, aggregateInterval);
      const timeValuePairs = [];
      for (let i = 0; i < times.length; i++) {
        timeValuePairs.push([times[i], data[i]]);
      }
      return timeValuePairs;
    });
  }

  // Returns a Promise for a segment (an array). interval is the segment's
  // interval. aggregateInterval is the time between data points in ms
  _fetchSegment(interval, aggregateInterval) {
    // If the interval is in the cache, return a segment Promise from the
    // cache.
    for (const entry of this._segmentCache) {
      if (entry.interval.equals(interval)) {
        return entry.segment;
      }
    }

    const segment = new Promise((resolve, reject) => {
        if ('offset' in this._dataParams) {
          interval.start -= this._dataParams.offset;
          interval.end -= this._dataParams.offset;
        }

        var startDate = new Date(interval.start);
        var endDate = new Date(interval.end);

        d3.request(this._dataParams.url + '?start='
          + encodeURIComponent(startDate.toISOString())
          + '&end=' + encodeURIComponent(endDate.toISOString())
          + '&aggregateInterval=' + aggregateInterval/1000
          + '&aggregateType=' + this._dataParams.aggregateType)
          .get((error, xhr) => {
            if (error) {
              reject(error);
              return;
            }
            let data = JSON.parse(xhr.responseText).values;
            const pointsPerSegment = Math.floor((interval.end - interval.start)
              / aggregateInterval);
            // data.length should be pointsPerSegment, even if the server
            // doesn't return that many values. The server will pad the front
            // of the data it returns with null values to ensure all non-null
            // values occur at the correct position in the data array, but it
            // will not pad the end of the data with null values to reduce data
            // usage.
            data.length = pointsPerSegment;

            resolve(data);
        });
    });

  // Keep the segment cache from getting too large
  if (this._segmentCache.length === 100) {
    this._segmentCache = this._segmentCache.slice(50);
  }
  // Add this segment to the cache
  this._segmentCache.push({
    interval,
    segment
  });

  return segment;
  }
}

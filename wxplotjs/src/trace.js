let DataFectcher = require('./datafetcher.js');

// Represents a trace, i.e. a line on a plot.

module.exports = class Trace {
  // Context is a CanvasRenderingContext2D, and lineGenerator is a D3 line
  // generator, both of which are used by the trace to draw itself.
  // See addTrace in plot.js for a description of the other parameters.
  constructor(name, group, dataParams, lineGenerator, traceBox, color, dash,
      thickness, options = {}) {
    this._name = name;
    this._group = group;
    this._dataParams = dataParams;
    this._lineGenerator = lineGenerator;
    this._traceBox = traceBox;
    this._color = color;
    this._dash = dash;
    this._thickness = thickness;
    this._dataFetcher = new DataFectcher(dataParams);
    this._interval = null;
    this._data = null;
    this._dataPromise = null;
  }

  name() {
    return this._name;
  }

  group() {
    return this._group;
  }

  color() {
    return this._color;
  }

  dash() {
    return this._dash;
  }

  thickness() {
    return this._thickness;
  }

  // Returns the extent (the minimum and maximum values in an Array of length
  // two) of the trace's data that is within the trace's current interval.
  // Linear interpolation is used at the edges of the interval so the extent
  // changes smoothly as the interval changes.
  dataExtent() {
    if (!this._data) {
      return;
    }

    // We use == null to determine whether a value is equal to null OR
    // undefined (or the opposite with the != operator).

    let extent = [Infinity, -Infinity];
    const updateExtent = function(value) {
      if (value == null) {
        return;
      }
      if (value < extent[0]) {
        extent[0] = value;
      }
      if (value > extent[1]) {
        extent[1] = value;
      }
    }

    // The following four points are used for linear interpolation at the
    // interval's edges. Any number of them may not exist or may have null
    // values.
    // The first point before the start of the interval
    let firstBefore;
    // The first point after the start of the interval
    let first;
    // The last point before the end of the interval
    let last;
    // The first point after the end of the interval
    let firstAfter;

    let prevDatum;
    // Find firstBefore, first, last, and firstAfter. Update extent using
    // data points within the current interval.
    for (const datum of this._data) {
      if (datum[0] > this._interval.start) {
        if (first == null) {
          firstBefore = prevDatum;
          first = datum;
        }
        if (datum[0] > this._interval.end) {
          if (firstAfter == null) {
            last = prevDatum;
            firstAfter = datum;          
          }
        } else {
          updateExtent(datum[1]);
        }
      }

      prevDatum = datum;
    }

    // Use linear interpolation to find the values at the beginning and end of
    // the plot's interval, and use them to update extent.
    // If firstBefore != null, then first != null, because of how
    // we found firstBefore above.
    if (firstBefore != null && first[1] != null && firstBefore[1] != null) {
      const interval = first[0] - firstBefore[0];
      const left = first[1] - ((first[1] - firstBefore[1]) 
        / interval * (first[0] - this._interval.start));
      updateExtent(left);
    }

    if (firstAfter != null && last != null && last[1] != null
        && firstAfter[1] != null) {
      const interval = firstAfter[0] - last[0];
      const right = last[1] + ((firstAfter[1] - last[1])
        / interval * (this._interval.end - last[0]));
      updateExtent(right);
    }
    // If there were no non-null valued data points, return null.
    if (extent[0] === Infinity || extent[1] === -Infinity) {
      return null;
    } else {
      return extent;
    }
  }

  draw() {
    if (!this._data) {
      return this;
    }
    const context = this._lineGenerator.context();
    context.save()
    context.translate(this._traceBox.x, this._traceBox.y);
    context.beginPath();
    // For reasons explained in the comment for the getWideData method in
    // DataFetcher, several points are loaded outside the plot's interval. To
    // avoid drawing outside the traceBox we need a clipping rectangle.
    context.rect(0, 0, this._traceBox.width, this._traceBox.height);
    context.clip();
    context.beginPath();
    this._lineGenerator(this._data);
    context.lineWidth = this._thickness;
    context.setLineDash(this._dash);
    context.strokeStyle = this._color;
    context.stroke();
    context.restore();
    return this;
  }

  /**
   * Sets the plot's interval. The Trace acquires data for the new interval.
   * @param {Interval|MomentInterval} interval
   * @returns {Trace} the object setInterval was called on.
   */
  setInterval(interval) {
    this._interval = interval;
    const result = this._dataFetcher.getWideData(interval);
    if (result instanceof Promise) {
      this._dataPromise = result;
      result.then((data) => {
        this._data = data;
        if (this._dataPromise === result) {
          this._dataPromise = null;
        }
      });
    } else {
      this._data = result;
    }
    return this;
  }

  // Returns true iff the Trace is loading data.
  isLoadingData() {
    return this._dataPromise !== null;
  }

  // If the Trace is loading data, returns a Promise that will resolve once
  // the data has loaded, otherwise returns null.
  loadedPromise() {
    return this._dataPromise;
  }
}

let DataView = require('./dataview.js');

/**
 * A weather data plot.
 */
class Plot {
  /**
   * @param {d3.Selection} root - Selection the plot will be appended to (as a
   * div)
   * @param {String} timeZone - Time zone identifier corresponding to the time
   * zone of the weather station, e.g. 'America/Los_Angeles'
   * @param {String} yLabel - Label for the vertical axis
   * @param {Object} interval - Specifies the initial time interval to display
   * e.g. ```{
   *   start: +(new Date("1/1/2015")),
   *   end: +(new Date("1/1/2016"))
   * };```
   * @param {Number} interval.start - Unix time of the start of the interval in
   * ms.
   * @param {Number} interval.end - Unix time of the end of the interval in ms.
   * @param {Object} maxInterval - An interval object, with the same structure
   * as the interval parameter, that limits the panning/zooming of the plot.
   * @param {Object} options - Properties of options are optional parameters
   * @param {Number} options.minIntervalLength - The minimum interval length in
   * ms. Default is one hour.
   * @param {Boolean} options.smooth - Set to false to not draw smooth traces
   * (by default, WXPlot uses monotone cubic interpolation to produce smooth
   * lines that pass through all data points and do not introduce minima or
   * maxima between points).
   */
  constructor(root, timeZone, yLabel, interval, maxInterval, options) {
    this.timeZone = timeZone;
    this.yLabel = yLabel;
    this.maxInterval = {
      start: moment.tz(maxInterval.start, timeZone),
      end: moment.tz(maxInterval.end, timeZone)
    };
    this.tickReferenceTime = this.maxInterval.start.clone().startOf('year');
    this.traces = [];
    this.margin = {top: 20, right: 0, bottom: 60, left: 50};
    this.width = 960;
    this.height = 500;
    this.lineBoxWidth = this.width - this.margin.left - this.margin.right;
    this.lineBoxHeight = this.height - this.margin.top - this.margin.bottom;
    this.options = options ? options : {};

    this.interval = {
      start: moment.tz(interval.start, timeZone),
      end: moment.tz(interval.end, timeZone)
    };

    this.xScale = d3.scaleLinear()
        .domain([interval.start, interval.end])
        .range([0, this.lineBoxWidth]);
    this.origXScale = this.xScale;

    this.yScale = d3.scaleLinear()
        .domain([0, 10])
        .range([this.lineBoxHeight, 0]);
     
    this.lineGenerator = d3.line()
        .defined(function(d) { return d[1] != null; })
        .x((d) => { return this.xScale(d[0]); })
        .y((d) => { return this.yScale(d[1]); });

    if (!('smooth' in this.options) || this.options.smooth === true) {
      // Best to use curveMonotoneX or curveLinear so the maxima and minima in
      // the trace correspond to the maxima and minima in the data and the
      // curve passes through all data points.
      this.lineGenerator.curve(d3.curveMonotoneX);
    }
    
    this.plotDiv = root.append('div')
        .attr('id', 'wxplot')
    this.initializeControlForm();
    this.updateControlForm();

    let minIntervalLength;
    if ('minIntervalLength' in this.options) {
      minIntervalLength = this.options.minIntervalLength;
    } else {
      // One hour in ms
      minIntervalLength = 3600000;
    }

    const minScale = (interval.end - interval.start) / (maxInterval.end - maxInterval.start);
    const maxScale = (interval.end - interval.start) / minIntervalLength;
    this.zoom = d3.zoom()
        .extent([[0, 0], [this.lineBoxWidth, this.lineBoxHeight]])
        .scaleExtent([minScale, maxScale])
        .translateExtent([[this.origXScale(maxInterval.start), 0],
          [this.origXScale(maxInterval.end), this.height]])
        .on('zoom', this.zoomed.bind(this));

    /* 
     * To produce a crisp image, the dimensions of the canvas buffer should
     * equal the dimensions in pixels of the rendered canvas on the screen of
     * the user's device. To accomplish this the dimensions of the canvas are
     * scaled by devicePixelRatio and a style is used to force the logical size
     * of the canvas to the original unscaled dimensions. The dimenions of the 
     * rendered canvas will equal its logical dimensions multiplied by the
     * devicePixelRatio, which is exactly the size of the canvas buffer. The
     * context is scaled so the canvas can be treated as if had its original
     * unscaled dimensions when drawing.
     */
    this.canvas = this.plotDiv.append('canvas')
        .attr('width', devicePixelRatio * this.width)
        .attr('height', devicePixelRatio * this.height)
        .style('width', this.width + 'px')
        .call(this.zoom);

    this.context = this.canvas.node().getContext('2d');
    this.context.scale(devicePixelRatio, devicePixelRatio);
    this.context.translate(this.margin.left, this.margin.top);
    this.TEXT_SIZE = 10;
    this.context.font = this.TEXT_SIZE + 'px sans-serif';
    this.lineGenerator.context(this.context);

    /*    
     * This structure is used to determine the period of x-axis ticks and their
     * format. We don't use moment durations for the period because they are too
     * general. The value property of a period should be an integer. The unit
     * should be hours, days, months, or years. If the unit is hours or days
     * there is an additional constraint described by the firstTick function.
     */
    this.deltaIntervalMap = [
        [moment.duration(12, 'hours'), {
          format: this.makeTickFormatter('h A'),
          period: {value: 1, unit: 'h'}
        }],
        [moment.duration(1.5, 'days'), {
          format: this.makeTickFormatter('MMM D h A'),
          period: {value: 3, unit:'h'}
        }],
        [moment.duration(3, 'days'), {
          format: this.makeTickFormatter('MMM D h A'),
          period: {value: 6, unit:'h'}
        }],
        [moment.duration(6, 'days'), {
          format: this.makeTickFormatter('MMM D h A'),
          period: {value: 12, unit:'h'}
        }],
        [moment.duration(23, 'days'), {
          format: this.makeTickFormatter('MMM D'),
          period: {value: 1, unit:'d'}
        }],   
        [moment.duration(60, 'days'), {
          format: this.makeTickFormatter('MMM D'),
          period: {value: 3, unit:'d'}
        }],   
        [moment.duration(200, 'days'), {
          format: this.makeTickFormatter('MMM D'),
          period: {value: 9, unit:'d'}
        }],  
        [moment.duration(1.5, 'years'), {
          format: this.makeTickFormatter('MMM YYYY'),
          period: {value: 1, unit:'M'}
        }],
        [moment.duration(5, 'years'), {
          format: this.makeTickFormatter('MMM YYYY'),
          period: {value: 4, unit:'M'}
        }],
        [moment.duration(0), {
          format: this.makeTickFormatter('YYYY'),
          period: {value: 1, unit:'Y'}
        }]
    ];
  }

  /*
   * Creates the legend, which is a set of line samples and accompanying textual
   * descriptions. The line samples are drawn on small Canvases so that the
   * samples look exactly the same as the actual lines.
   */
  initializeLegendBox() {
    this.legendBox = this.plotDiv.append('div')
        .attr('id', 'legend-box');
  }

  // Creates the labels and inputs for controlling the plot's interval
  initializeControlForm() {
    const form = this.plotDiv.append('form');
    form.attr('id', 'interval-control-form');

    form.append('label')
        .text('Start:');
    const start = form.append('input')
        .attr('type', 'text')
        .on('keypress', () => {
          if(d3.event.which === 13) {
            start.node().blur();
            this.processControlForm();
          }
        });

    form.append('label')
        .text('End:');
    const end = form.append('input')
        .attr('type', 'text')
        .on('keypress', () => {
          if(d3.event.which === 13) {
            end.node().blur();
            this.processControlForm();
          }
        });

    const errorMessage = form.append('label')
      .classed('error-message', true);

    this.controlForm = {
      start,
      end,
      errorMessage
    };

    // Add a row of buttons to control the timespan
    const timeSpanForm = this.plotDiv.append('form')
    timeSpanForm.attr('id', 'timespan-control-form')

    const timeSpans = [
      {value: 1, unit:'d'},
      {value: 3, unit:'d'},
      {value: 1, unit:'w'},
      {value: 1, unit:'M'},
      {value: 3, unit:'M'},
      {value: 1, unit:'y'},
      {value: 5, unit:'y'},
      {unit:'max'}
    ]

    for (const timeSpan of timeSpans) {
      const input = timeSpanForm.append('input')
        .attr('type', 'button')

      if (timeSpan.unit === 'max') {
        input.attr('value', 'max')
        .on('click', () => this.setInterval({
          start: +this.maxInterval.start,
          end: +this.maxInterval.end
        }))
      } else {
        input.attr('value', timeSpan.value + timeSpan.unit.toLowerCase())
        .on('click', () => this.setTimeSpan(moment.duration(timeSpan.value,
          timeSpan.unit)))
      }
    }
  }

  /*
   * Sets the plot's timespan (the duration of the plot's interval) to
   * timeSpan, a Moment duration. setTimeSpan will attempt to achieve the new
   * timespan by altering only the plot's interval's start time, but if that is
   * not possible, it will change the interval's end as well. If timeSpan is
   * greater than the plot's maximum timespan (as determined by the maximum
   * interval), the plot will be set to its maximum interval.
   */
  setTimeSpan(timeSpan) {
    const possibleStart = this.interval.end.clone().subtract(timeSpan)
    if (possibleStart.isSameOrAfter(this.maxInterval.start)) {
      // we good
      this.setInterval({
        start: +possibleStart,
        end: +this.interval.end
      })
      return;
    } else {
      const possibleEnd = this.maxInterval.start.clone().add(timeSpan)
      if (possibleEnd.isSameOrBefore(this.maxInterval.end)) {
        // we good
        this.setInterval({
          start: +this.maxInterval.start,
          end: +possibleEnd
        })
      } else {
        this.setInterval({
          start: +this.maxInterval.start,
          end: +this.maxInterval.end
        })
      }
    }
  }

  /*
   * Parses the control inputs. If they represent a valid interval, the plot is
   * updated to display that interval. Otherwise an error message indicating the
   * problem is displayed.
   */
  processControlForm() {
    let start = moment.tz(this.controlForm.start.property('value'),
      'MM-DD-YYYY', this.timeZone);

    let end = moment.tz(this.controlForm.end.property('value'),
      'MM-DD-YYYY', this.timeZone);

    if (!start.isValid() || !end.isValid()) {
      this.controlForm.start.classed('input-error', !start.isValid());
      this.controlForm.end.classed('input-error', !end.isValid());
      this.controlForm.errorMessage.text('Invalid Date (must have format MM/DD/YYYY)');
      return;
    }

    if (start >= end) {
      this.controlForm.start.classed('input-error', true);
      this.controlForm.end.classed('input-error', true);
      this.controlForm.errorMessage.text('Start must be before end.');
      return;
    }

    this.controlForm.start.classed('input-error', false);
    this.controlForm.end.classed('input-error', false);

    if (start < this.maxInterval.start) {
      start = this.maxInterval.start;
    }
    if (end > this.maxInterval.end) {
      end = this.maxInterval.end;
    }
    this.controlForm.errorMessage.text('');
    this.setInterval({start, end});      
  }

  /*
   * Updates the dates in the control form inputs to reflect the plot's current
   * interval.
   */
  updateControlForm() {
    if (this.controlForm.errorMessage.text()) {
      this.controlForm.start.classed('input-error', false);
      this.controlForm.end.classed('input-error', false);
      this.controlForm.errorMessage.text('')
    }
    this.controlForm.start.property('value', this.interval.start.format('l'));
    this.controlForm.end.property('value', this.interval.end.format('l'));
  }

  /**
   * Sets the plot's interval
   * @param {Object} interval
   * @param {Number} interval.start - Unix time of the start of the interval in
   * ms.
   * @param {Number} interval.end - Unix time of the end of the interval in ms.
   */
  setInterval(interval) {
    const startX = this.origXScale(interval.start);
    const endX = this.origXScale(interval.end);
    const baseRange = this.origXScale.range();
    const scaleFactor = (baseRange[1] - baseRange[0]) / (endX - startX);
    const xShift = scaleFactor*baseRange[0] - startX;
    this.canvas.call(this.zoom.transform,
      d3.zoomIdentity.scale(scaleFactor).translate(xShift, 0));
  }

  /**
   * Sets the y-axis label
   * @param {String} label - The new label
   * @returns {Plot} The object setYLabel was called on
   */
  setYLabel(label) {
    this.yLabel = label;
  }

  /**
   * Adds a new trace
   * @param {Object} dataParams - Describes the data for a trace
   * @param {String} dataParams.aggregateType - A weewx aggregate type. e.g.
   * "avg"
   * @param {String} dataParams.url - Must include the location of the backend
   * sever (which must have the same origin as the site serving wxplotjs), and
   * the desired weewx data binding and observation type e.g. 
   * URL-of-server/wxplot_binding/outTemp
   * @param {Number} dataParams.archiveIntervalMinutes - The archive interval
   * (or the maximum archive interval if multiple archive intervals have been
   * used).
   * @param {Number} dataParams.minDataPoints - At least this many data points
   * will always be visible.
   * @param {Number} dataParams.offset - Optional. Shift this trace to the right
   * (forward in time) this many seconds.
   * @param {String} legendText - The text to display in the legend for this
   * trace
   * @param {String} color - The color of the trace. A CSS color value.
   * @param {Array} dash - Specifies the line dash to be passed to
   * [ctx.setLineDash](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setLineDash).
   * Pass an empty array for solid lines
   * @param {Number} width - The width of the trace in px
   * @returns {Plot} the object addTrace was called on
   */
  addTrace(dataParams, legendText, color, dash, width) {
    const dataView = new DataView(Object.assign({}, dataParams))
        .setInterval((+this.interval.start), (+this.interval.end));
    dataView.onLoaded = this.onDataViewLoaded.bind(this);

    if (this.traces.length === 0) {
      this.initializeLegendBox();      
    }

    const p = this.legendBox.append('p');
    const LEGEND_LINE_LEN = 20;
    const ctx = p.append('canvas')
        .attr('width', LEGEND_LINE_LEN)
        .attr('height', this.TEXT_SIZE)
        .node()
        .getContext('2d');

    ctx.beginPath();     
    ctx.moveTo(0, this.TEXT_SIZE / 2);
    ctx.lineTo(LEGEND_LINE_LEN, this.TEXT_SIZE / 2);
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.stroke(); 

    p.append('span')
        .text(legendText);

    this.traces.push({
        legendText,
        legend: p,
        width,
        color,
        dash,
        dataView
    });

    return this;
  }

  /**
   * @returns {Array} The legend text of each of the plots traces.
   */
  getTraces() {
    return this.traces.map(trace => trace.legendText);
  }

  /**
   * Removes a trace from the plot
   * @param {String} legendText - The legend text of the trace to remove (The
   * same string that was passed to addTrace as the legendText parameter when
   * the trace was added).
   * @returns {Plot} the object removeTrace was called on.
   */
  removeTrace(legendText) {
    this.traces = this.traces.filter(trace => {
      if(trace.legendText === legendText) {
        trace.legend.remove()
        return false;
      }
      return true;
    });
    
    this.updateYScale();
    this.render();
    return this;
  }

  /*
   * Event handler for the D3 zoom event, which includes panning and zooming.
   * Updates the interval, gets new data for each trace, and renders
   */
  zoomed() {  
    this.xScale = d3.event.transform.rescaleX(this.origXScale);

    // The earliest visible time.
    const start = this.xScale.invert(0);

    // The latest visible time.
    const end = this.xScale.invert(this.lineBoxWidth); 
    this.interval = {
      start: moment.tz(start, this.timeZone),
      end: moment.tz(end, this.timeZone)
    };
    this.updateControlForm();

    let loadedPromises = [];
    for (const trace of this.traces) {
        trace.dataView.setInterval(start, end);
        if (trace.dataView.isLoading()) {
          loadedPromises.push(new Promise((resolve, reject) => {
            trace.dataView.onLoaded = resolve;
          }));
        }
    }
    if (loadedPromises.length > 0) {
      const allTracesLoaded = Promise.all(loadedPromises);
      allTracesLoaded.then(this.onDataViewLoaded.bind(this));
    }

    this.updateYScale()
    this.render();
  }

  /*
   * Finds the maximum extent of the values of all traces and sets the range of
   * the y-scale to this extent.
   */
  updateYScale() {
    let extents = [];
    for (const trace of this.traces) {
      if (!trace.dataView.isLoaded()) continue;
      let data = trace.dataView.getDisplayData();
      extents.push(d3.extent(data, d => d[1]));
    }

    /*
     * The extents array is flattened and the extent of this flattened array is
     * determined to get the extent of all traces.
     */
    this.yScale.domain(d3.extent([].concat.apply([], extents)));
  }

  // Callback used to re-draw the plot when data is loaded asynchronously
  onDataViewLoaded(){
    this.updateYScale();
    this.render();
  }

  /*
   * @param {string} dateFormatString - A format specifier for a moment
   * @returns A function that takes a unix time in ms and returns a string
   * containing that time formatted according to dateFormatString, in the plot's
   * timeZone. 
   */
  makeTickFormatter(dateFormatString) {
    return d => moment.tz(d, this.timeZone).format(dateFormatString);
  }

  /*
   * Returns an object with the properties period and format. Period is the
   * period between x-axis ticks. It is represented as an object with properties
   * unit and value. Unit is a string representing a quantity of time suitable
   * for moment.add and value is an integer. Format is a function like those
   * returned by makeTickFormatter, which is used to format tick labels.
   */
  tickOptions() {
    const delta = moment.duration(this.interval.end.diff(this.interval.start));

    let i;
    for (i = 0; i < this.deltaIntervalMap.length; i++) {
      if (delta < this.deltaIntervalMap[i][0]) return this.deltaIntervalMap[i][1];
    }

    return this.deltaIntervalMap[i - 1][1];
  }

  /*
   * tickPeriod is an object representing the period of x-axis ticks, like that
   * in the period property of the object returned by tickOptions. Returns the
   * time of the first tick in the plot's current interval as a unix time in ms. 
   * If the tick period is greater than one, there are multiple choices for
   * where to put the first tick (e.g. if the tick period is three days, there
   * are three possible times for the first tick that align with day
   * boundaries). It would be jarring to have the location of the tick marks
   * change as the plot is panned, so in order to always choose the same time
   * for a tick when there are multiple options, a reference time is used. All
   * ticks are chosen to be an integer multiple of tick periods after the
   * reference time. For tick periods in hours, the reference time is the start
   * of the day, and the tick period should be a factor of 24. For tick periods
   * in months, the reference time is the start of the year and the tick period
   * should be a factor of 12. For tick periods in days or years the reference
   * time is the year of the start of the plot's maximum interval.
   */
  firstTick(tickPeriod) {
    const time = this.interval.start;
    var period = tickPeriod.value;
    var unit = tickPeriod.unit;

    var roundedTime = time.clone().startOf(unit);

    if (unit === 'h' || unit === 'M') {
      // The tick period may be several hours. We 
      return roundedTime.set(unit, 
        Math.floor(time.get(unit) / period) * period);
    } else {
      const offset = roundedTime.diff(this.tickReferenceTime, tickPeriod.unit)
        % tickPeriod.value;
      return roundedTime.add(tickPeriod.value - offset, tickPeriod.unit);
    }
  }

  /*
   * Returns an array of x-axis tick times, represented as unix times in ms. If
   * the tick period is a number of hours, the tick times are always an integer
   * number of tick periods after the start of the day (see the comment for
   * firstTick). To prevent ticks from jumping as the plot is scrolled near a
   * daylight savings time or time zone change, these changes are ignored when
   * determining tick times. To illustrate this effect, consider a tick period
   * of three hours, with a tick occuring at midnight and a daylight savings
   * time change occuring before the next tick. To avoid ticks jumping when the
   * plot is panned, the next tick will be placed at 3 am, even if the actual
   * time difference between midnight and 3 am is two or four hours. If the
   * daylight savings time change were considered when choosing the next tick,
   * ticks would occurs at 2 am, 5 am, 8 am, ... or 4 am, 7 am, 10 am, ..., and,
   * if the plot were panned to the following day, they would jump back to 12
   * am, 3 am, 6 am, ..., the times they are normally at. Ignoring the daylight
   * savings time change prevents the ticks from jumping. Note that the plot
   * uses unix time for positioning points and ticks on the x-axis, so the
   * choice of tick times in no way affects the accuracy of the plot.
   */
  ticks() {
    var tickOpts = this.tickOptions();

    var ticks = [];
    var tick = this.firstTick(tickOpts.period);
    var period = moment.duration(tickOpts.period.value, tickOpts.period.unit);
    while (tick.isSameOrBefore(this.interval.end)) {
      ticks.push(+tick);
      if (tickOpts.period.unit === 'h' && tickOpts.period.value > 1) {
        var hours = tick.hours();
        hours = hours + tickOpts.period.value;
        if (hours >= 24) tick.add(1, 'd');
        tick.hours(hours % 24);
      } else {
        tick.add(period);
      }
    }
    return {
      format: tickOpts.format,
      ticks: ticks,
    };
  }


  // Draws the x-axis, y-axis, and the traces
  render() {
    this.context.clearRect(0, -this.margin.top, this.lineBoxWidth, this.height);
    this.drawXAxis();
    this.context.clearRect(-this.margin.left, -this.margin.top, this.margin.left, this.height);
    this.drawYAxis();
    this.drawTraces();

    this.context.lineWidth = 1;
    this.context.setLineDash([]);
    this.context.strokeStyle = 'gray';
    this.context.strokeRect(-0.5, -0.5, this.lineBoxWidth, this.lineBoxHeight + 1);
  }

  // modified from https://bl.ocks.org/mbostock/1550e57e12e73b86ad9e
  drawXAxis() {
    const tickMarks = this.ticks(this.interval.start, this.interval.end);
    const tickSize = 6;
    const tickValues = tickMarks.ticks;
    const tickFormat = tickMarks.format;

    this.context.beginPath();
    for (const tick of tickValues) {
      this.context.moveTo(this.xScale(tick), this.lineBoxHeight);
      this.context.lineTo(this.xScale(tick), this.lineBoxHeight + tickSize);
    }

    this.context.lineWidth = 1;
    this.context.setLineDash([]);
    this.context.strokeStyle = 'black';
    this.context.stroke();

    // Draw vertical grid lines
    for (const tick of tickValues) {
      this.context.moveTo(this.xScale(tick), 0);
      this.context.lineTo(this.xScale(tick), this.lineBoxHeight);
    }
    this.context.strokeStyle = 'lightgray';
    this.context.stroke();

    this.context.textAlign = 'center';
    this.context.textBaseline = 'top';
    for (const tick of tickValues) {
      this.context.fillText(tickFormat(tick), this.xScale(tick), this.lineBoxHeight + tickSize);
    }
  }

  // modified from https://bl.ocks.org/mbostock/1550e57e12e73b86ad9e
  drawYAxis() {
    var tickCount = 10,
        tickSize = 6,
        tickPadding = 3,
        ticks = this.yScale.ticks(tickCount),
        tickFormat = this.yScale.tickFormat(tickCount);

    this.context.beginPath();
    for (const tick of ticks) {
      this.context.moveTo(0, this.yScale(tick));
      this.context.lineTo(-6, this.yScale(tick));
    }

    this.context.lineWidth = 1;
    this.context.setLineDash([]);
    this.context.strokeStyle = 'black';
    this.context.stroke();

    for (const tick of ticks) {
      this.context.moveTo(0, this.yScale(tick));
      this.context.lineTo(this.lineBoxWidth, this.yScale(tick));
    }
    this.context.strokeStyle = 'lightgray';
    this.context.stroke();

    this.context.textAlign = 'right';
    this.context.textBaseline = 'middle';
    for (const tick of ticks) {
      this.context.fillText(tickFormat(tick), -tickSize - tickPadding, this.yScale(tick));
    }

    this.context.save();
    this.context.rotate(-Math.PI / 2);
    this.context.textAlign = 'center';
    this.context.textBaseline = 'top';
    this.context.font = 'bold 10px sans-serif';
    this.context.fillText(this.yLabel, -this.lineBoxHeight/2, -this.margin.left);
    this.context.restore();
  }

  // Draws the traces
  drawTraces() {
    for (const trace of this.traces) {
      if (!trace.dataView.isLoaded()) continue;
      this.context.beginPath();
      this.lineGenerator(trace.dataView.getDisplayData());
      this.context.lineWidth = trace.width;
      this.context.setLineDash(trace.dash);
      this.context.strokeStyle = trace.color;
      this.context.stroke();
    }
  }
}

module.exports = Plot;

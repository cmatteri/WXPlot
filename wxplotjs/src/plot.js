let DataView = require('./dataview.js');

const TICK_SIZE_IN_PX = 6;
const TICK_PADDING_IN_PX = 3;

/**
 * A weather data plot.
 */
class Plot {
  /**
   * @param {d3.Selection} controlRoot - The selection the timespan and
   * interval controls will be appended to
   * @param {d3.Selection} canvasRoot - The selection the canvas, which
   * contains the axes and traces, will be appended to
   * @param {String} timeZone - Time zone identifier corresponding to the time
   * zone of the weather station, e.g. 'America/Los_Angeles'
   * @param {String} yLabel - Label for the vertical axis
   * @param {Number} yTickLabelChars - The y-axis tick labels will have space
   * for at least this many '0' characters. See the yTicks function comment for
   * details on the formatting of these labels.
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
  constructor(controlRoot, canvasRoot, timeZone, yLabel, yTickLabelChars,
      interval, maxInterval, options) {
    this.controls = controlRoot.append('div')
        .attr('id', 'wxplot-controls');
    this.canvasRoot = canvasRoot;
    this.timeZone = timeZone;
    this.yLabel = yLabel;
    this.yTickLabelChars = yTickLabelChars;
    this.interval = {
      start: moment.tz(interval.start, timeZone),
      end: moment.tz(interval.end, timeZone)
    };
    this.maxInterval = {
      start: moment.tz(maxInterval.start, timeZone),
      end: moment.tz(maxInterval.end, timeZone)
    };
    this.options = options ? options : {};

    this.tickReferenceTime = this.maxInterval.start.clone().startOf('year');

    this.traces = [];

    this.initializeControls();
    // Creates the legend, which is a set of line samples and accompanying
    // textual descriptions. The line samples are drawn on small Canvases so
    // the samples look exactly the same as the actual lines.
    this.controls.append('div')
        .attr('id', 'wxplot-legend');
    this.updateControls();

    let minIntervalLength;
    if ('minIntervalLength' in this.options) {
      this.minIntervalLength = this.options.minIntervalLength;
    } else {
      // One hour in ms
      this.minIntervalLength = 3600000;
    }

    this.xScale = d3.scaleLinear()
        .domain([interval.start, interval.end]);

    this.yScale = d3.scaleLinear()
        .domain([0, 10]);

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

    this.initializeCanvas();

    // When the div that holds the canvas is resized, replace the canvas with a
    // new one of the correct size.
    const ResizeSensor = require('css-element-queries/src/ResizeSensor');
    new ResizeSensor(canvasRoot.node(), () => {
      this.canvas.remove();
      this.initializeCanvas();
      this.render();}
    );

    /*    
     * This structure is used to determine the period of x-axis ticks and their
     * format. We don't use moment durations for the period because they are too
     * general. The value property of a period should be an integer. The unit
     * should be hours, days, months, or years. If the unit is hours or days
     * there is an additional constraint described by the firstTick function.
     */
    this.xTickPeriods = [{
        format: 'h A',
        period: {value: 1, unit: 'h'}
      }, {
        format: 'MMM D h A',
        period: {value: 3, unit:'h'}
      }, {
        format: 'MMM D h A',
        period: {value: 6, unit:'h'}
      }, {
        format: 'MMM D h A',
        period: {value: 12, unit:'h'}
      }, {
        format: 'MMM D',
        period: {value: 1, unit:'d'}
      }, {
        format: 'MMM D',
        period: {value: 3, unit:'d'}
      }, {
        format: 'MMM D',
        period: {value: 9, unit:'d'}
      }, {
        format: 'MMM YYYY',
        period: {value: 1, unit:'M'}
      }, {
        format: 'MMM YYYY',
        period: {value: 4, unit:'M'}
      }, {
        format: 'YYYY',
        period: {value: 1, unit:'Y'}
      }
    ];

    const example = moment('2000-12-10 12:10:10');
    for (const xTickParams of this.xTickPeriods) {
      const tickLabel = example.format(xTickParams.format);
      xTickParams.maxWidthInPx = this.context.measureText(tickLabel).width;
      xTickParams.formatter = this.makeTickFormatter(xTickParams.format);
      xTickParams.duration = moment.duration(xTickParams.period.value,
        xTickParams.period.unit)
    }
  }

  // Creates a canvas for drawing the plot's axes and traces. The size of the
  // canvas is set in CSS and an appropriate size is calculated for canvas
  // buffer. The canvas's area is divided into the traceBox, which contains the
  // traces, and the margins, which contain the axes. initializeCanvas
  // calculates the size of the margins. It adjusts the D3 scales based on size
  // of traceBox. It also creates a D3 zoom to allow panning and zooming the
  // plot.
  initializeCanvas(yTickLabelChars) {
    this.canvas = this.canvasRoot.append('canvas')
        .attr('id', 'wxplot-canvas');
    const plotStyle = getComputedStyle(this.canvas.node());
    this.width = parseFloat(plotStyle.width)
      - parseFloat(plotStyle.paddingRight);
    this.height = parseFloat(plotStyle.height);
    const LINE_HEIGHT = 1.2;
    this.textHeightPx = parseFloat(plotStyle['font-size']) * LINE_HEIGHT;

    // To produce a crisp image, the dimensions of the canvas buffer should
    // equal the dimensions in physical pixels of the rendered canvas on the
    // screen of the user's device. To accomplish this the canvas buffer is set
    // to its CSS dimensions multiplied by devicePixelRatio. The context is
    // scaled so the canvas can be treated as if it had its CSS dimensions when
    // drawing.
    this.canvas.attr('width', devicePixelRatio * this.width)
        .attr('height', devicePixelRatio * this.height);

    this.context = this.canvas.node().getContext('2d');
    this.context.font = plotStyle['font-size'] + ' '
      + plotStyle['font-family'];
    const zeroWidthPx = this.context.measureText('0').width;

    this.margin = {
      top: Math.ceil(this.textHeightPx / 2),
      right: 0,
      bottom: Math.ceil(this.textHeightPx + TICK_SIZE_IN_PX),
      // The last 2 px are extra padding
      left: Math.ceil(this.textHeightPx + TICK_SIZE_IN_PX + TICK_PADDING_IN_PX
        + this.yTickLabelChars*zeroWidthPx + 2)};
    this.traceBoxWidth = this.width - this.margin.left - this.margin.right;
    this.traceBoxHeight = this.height - this.margin.top - this.margin.bottom;
    this.context.scale(devicePixelRatio, devicePixelRatio);
    this.context.translate(this.margin.left, this.margin.top);

    this.xScale.range([0, this.traceBoxWidth]);
    this.origXScale = this.xScale;
    this.yScale.range([this.traceBoxHeight, 0]);
    this.lineGenerator.context(this.context);

    const minScale = (this.interval.end - this.interval.start) 
      / (this.maxInterval.end - this.maxInterval.start);
    const maxScale = (this.interval.end - this.interval.start)
      / this.minIntervalLength;
    this.zoom = d3.zoom()
        .extent([[0, 0], [this.traceBoxWidth, this.traceBoxHeight]])
        .scaleExtent([minScale, maxScale])
        .translateExtent([[this.origXScale(this.maxInterval.start), 0],
          [this.origXScale(this.maxInterval.end), this.height]])
        .on('zoom', this.zoomed.bind(this));
    this.canvas.call(this.zoom);

    this.yTickCount = Math.floor(this.height / (this.textHeightPx + 36));
  }

  // Creates the input elements used to control/display the plot's interval
  initializeControls() {
    // Add inputs to set/display the plot's start and end date
    const startControl = this.controls.append('div')
        .classed('wxplot-interval-control', true);
    startControl.append('label')
        .text('Start:');
    const start = startControl.append('input')
        .attr('type', 'text')
        .on('keypress', () => {
          if(d3.event.which === 13) {
            start.node().blur();
            this.processStartEndDateForm();
          }
        });

    const endControl = this.controls.append('div')
        .classed('wxplot-interval-control', true);
    endControl.append('label')
        .text('End:');
    const end = endControl.append('input')
        .attr('type', 'text')
        .on('keypress', () => {
          if(d3.event.which === 13) {
            end.node().blur();
            this.processStartEndDateForm();
          }
        });

    const errorMessage = this.controls.append('label')
      .classed('wxplot-error-message', true);

    // Add a row of buttons to control the timespan
    const timespanForm = this.controls.append('form')
    timespanForm.attr('id', 'wxplot-timespan-control-form')

    const timespans = [
      {value: 1, unit:'d'},
      {value: 3, unit:'d'},
      {value: 1, unit:'w'},
      {value: 1, unit:'M'},
      {value: 3, unit:'M'},
      {value: 1, unit:'y'},
      {value: 5, unit:'y'},
      {value: 10, unit:'y'},
      {unit:'max'}
    ]

    for (const timespan of timespans) {
      const button = timespanForm.append('input')
        .attr('type', 'button')

      timespan.button = button;

      if (timespan.unit === 'max') {
        button.attr('value', 'max')
        .on('click', () => {
          this.setInterval(+this.maxInterval.start, +this.maxInterval.end);
          button.node().blur()
        })
      } else {
        timespan.duration = moment.duration(timespan.value, timespan.unit)
        button.attr('value', timespan.value + timespan.unit.toLowerCase())
        .on('click', () => {
          this.setTimeSpan(timespan.duration)
          button.node().blur()
        })
      }
    }

    this.controlForm = {
      start,
      end,
      errorMessage,
      timespans
    };
  }

  /*
   * Sets the plot's timespan (the duration of the plot's interval) to
   * timespan, a Moment duration. setTimeSpan will attempt to achieve the new
   * timespan by altering only the plot's interval's start time, but if that is
   * not possible, it will change the interval's end as well. If timespan is
   * greater than the plot's maximum timespan (as determined by the maximum
   * interval), the plot will be set to its maximum interval.
   */
  setTimeSpan(timespan) {
    // We can't do the following calculations in unix time because months and
    // years have variable length in ms.
    const possibleStart = this.interval.end.clone().subtract(timespan)
    if (possibleStart.isSameOrAfter(this.maxInterval.start)) {
      // we good
      this.setInterval(+possibleStart, +this.interval.end)
      return;
    } else {
      const possibleEnd = this.maxInterval.start.clone().add(timespan)
      if (possibleEnd.isSameOrBefore(this.maxInterval.end)) {
        // we good
        this.setInterval(+this.maxInterval.start, +possibleEnd)
      } else {
        this.setInterval(+this.maxInterval.start, +this.maxInterval.end)
      }
    }
  }

  /*
   * Parses the control inputs. If they represent a valid interval, the plot is
   * updated to display that interval. Otherwise an error message indicating the
   * problem is displayed.
   */
  processStartEndDateForm() {
    let start = moment.tz(this.controlForm.start.property('value'),
      'MM-DD-YYYY', this.timeZone);

    let end = moment.tz(this.controlForm.end.property('value'),
      'MM-DD-YYYY', this.timeZone);

    if (!start.isValid() || !end.isValid()) {
      this.controlForm.start.classed('wxplot-input-error', !start.isValid());
      this.controlForm.end.classed('wxplot-input-error', !end.isValid());
      this.controlForm.errorMessage.text('Invalid Date (must have format MM/DD/YYYY)');
      return;
    }

    if (start >= end) {
      this.controlForm.start.classed('wxplot-input-error', true);
      this.controlForm.end.classed('wxplot-input-error', true);
      this.controlForm.errorMessage.text('Start must be before end.');
      return;
    }

    this.controlForm.start.classed('wxplot-input-error', false);
    this.controlForm.end.classed('wxplot-input-error', false);
    this.controlForm.errorMessage.text('');
    this.setInterval(start, end);      
  }

  // Updates the plot's controls to reflect the plot's current interval
  updateControls() {
    // Colors the timespan control buttons based on the plot's timespan to
    // clearly indicate the current zoom level. A button is fully colored if
    // the plot's timespan is within 5% of that button's timespan. Otherwise
    // the buttons whose timespans are closest (longer and/or shorter) to the
    // plot's timespan are partially colored on the left or right to indicate
    // where the plot's timespan fits into the set of button timespans.
    function updateTimespanControls() {
      /*
       * Sets the coloring for a timespan control button. If coloring is false,
       * the button will not be colored.
       */
      function setButtonColoring(timespan, coloring) {
        timespan.button.classed('color-left', coloring === 'left');
        timespan.button.classed('color-center', coloring === 'center');
        timespan.button.classed('color-right', coloring === 'right');
      }
      const timespans = this.controlForm.timespans;
      // Flag to indicate when we've colored the buttons we want to color
      let timespanColorsSet = false;
      /*
       * If the plot is at its maximum interval, color the max button
       * regardless of how the plot's timespan compares to the other buttons'
       * timespans. 
       */
      const maxTimespan = timespans[timespans.length - 1];
      if (this.interval.start.isSame(this.maxInterval.start)
        && this.interval.end.isSame(this.maxInterval.end)) {
        setButtonColoring(maxTimespan, 'center');
        timespanColorsSet = true;
      } else {
        setButtonColoring(maxTimespan, false);
      }
      let prevTimespan;
      for (const timespan of timespans) {
        if (timespan.unit === 'max') {
          continue;
        }
        if (!timespanColorsSet) {
          const diff = +this.interval.end - +this.interval.start;
          if (0.95 * timespan.duration < diff
              && diff < 1.05 * timespan.duration) {
            setButtonColoring(timespan, 'center');
            timespanColorsSet = true;
            continue;
          } else if (diff < timespan.duration) {
            if (prevTimespan) {
              setButtonColoring(prevTimespan, 'right');
            }
            setButtonColoring(timespan, 'left');
            timespanColorsSet = true;
            continue;
          }
          prevTimespan = timespan;
        }
        setButtonColoring(timespan, false);
      }
      /*
       * If we make it through the for loop without finding a button to color,
       * the plot's timespan must be between the max timespan and the next
       * longest timespan
       */
      if (!timespanColorsSet) {
        const penultimateTimespan = timespans[timespans.length - 2];
        setButtonColoring(penultimateTimespan, 'right');
        setButtonColoring(maxTimespan, 'left');
        timespanColorsSet = true;
      }
    }

    /* 
     * Clear any error messages related to the date controls. Update the date
     * controls to reflect the plot's current interval.  
     */
    if (this.controlForm.errorMessage.text()) {
      this.controlForm.start.classed('wxplot-input-error', false);
      this.controlForm.end.classed('wxplot-input-error', false);
      this.controlForm.errorMessage.text('')
    }
    this.controlForm.start.property('value', this.interval.start.format('l'));
    this.controlForm.end.property('value', this.interval.end.format('l'));

    updateTimespanControls.call(this);
  }

  /**
   * Sets the plot's interval
   * @param {Number} start - Unix time of the start of the interval in ms.
   * @param {Number} end - Unix time of the end of the interval in ms.
   */
  setInterval(start, end) {
    if (start < this.maxInterval.start) {
      start = this.maxInterval.start;
    }
    if (end > this.maxInterval.end) {
      end = this.maxInterval.end;
    }
    // The current interval is determined by the D3 zoom behavior that was
    // applied to the canvas. this.interval merely caches the start and end of
    // the interval. To change the interval, we must change the zoom. Zoom is
    // stored as a transformation of the initial scale, so we must calculate
    // the transformation that yields the desired interval.
    const startX = this.origXScale(start);
    const endX = this.origXScale(end);
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
   * @param {Object} options - Properties of options are optional parameters
   * @param {String} options.group - The trace group. Traces are sorted by
   * group in the legend.
   * @returns {Plot} the object addTrace was called on
   */
  addTrace(dataParams, legendText, color, dash, width, options) {
    options = options ? options : {};
    const dataView = new DataView(Object.assign({}, dataParams))
        .setInterval((+this.interval.start), (+this.interval.end));
    dataView.onDataBlockLoaded = this.render.bind(this);

    // If a legend group isn't specified, put the label in the empty string
    // group, which will not have a group title on the legend.
    const group = 'group' in options ? options.group : '';
    const legend = document.getElementById('wxplot-legend');
    const groups = legend.children;
    let groupTraces;
    for (let i = 0; i < groups.length; i++) {
        if(groups[i].children[0].innerText === group) {
        groupTraces = groups[i].children[1];
        break;
      }
    }
    // If the group doesn't exist yet, create it.
    if (!groupTraces) {
      const groupNode = document.createElement('div');
      legend.appendChild(groupNode);
      groupNode.classList.add('wxplot-legend-group')
      const label = document.createElement('span');
      groupNode.appendChild(label);
      label.innerText = group;
      groupTraces = document.createElement('div');
      groupNode.appendChild(groupTraces);
    }

    // Add a label and canvas with a line sample to the legend group for this
    // trace
    const legendNode = document.createElement('div');
    groupTraces.appendChild(legendNode);
    legendNode.classList.add('wxplot-legend');
    const LEGEND_LINE_LEN = 20;
    const canvas = document.createElement('canvas');
    legendNode.appendChild(canvas);
    const span = document.createElement('span');
    legendNode.appendChild(span);
    span.innerText = legendText;
    canvas.width = LEGEND_LINE_LEN * window.devicePixelRatio;
    canvas.height = this.textHeightPx * window.devicePixelRatio;
    canvas.style.width = LEGEND_LINE_LEN + 'px';
    canvas.style.height = this.textHeightPx + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.beginPath();
    const lineHeight = Math.round(this.textHeightPx / 2) + 0.5;
    ctx.moveTo(0, lineHeight);
    ctx.lineTo(LEGEND_LINE_LEN, lineHeight);
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.stroke();

    this.traces.push({
        legendText,
        legendNode,
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
        const groupTraces = trace.legendNode.parentNode;
        groupTraces.removeChild(trace.legendNode);
        if (groupTraces.children.length === 0) {
          const group = groupTraces.parentNode;
          const legend = group.parentNode;
          legend.removeChild(group);
        }
        return false;
      }
      return true;
    });
    
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
    const end = this.xScale.invert(this.traceBoxWidth); 
    this.interval = {
      start: moment.tz(start, this.timeZone),
      end: moment.tz(end, this.timeZone)
    };
    this.updateControls();

    // Create a promise for each trace that needs data from the server that
    // resolves once the data has loaded. Promise.all is used to redraw the
    // plot exactly once when all data has loaded.
    let loadedPromises = [];
    for (const trace of this.traces) {
        trace.dataView.setInterval(start, end);
        // Don't create a promise for the loading of a DataBlock if we already
        // created one in a previous zoomed call (which happens because
        // multiple plot intervals may map to the same DataBlock), as indicated
        // by dataView.onDataBlockLoaded being non-null.
        if (trace.dataView.isLoading() && !trace.dataView.onDataBlockLoaded) {
          loadedPromises.push(new Promise((resolve, reject) => {
            trace.dataView.onDataBlockLoaded = resolve;
          }));
        }
    }
    if (loadedPromises.length > 0) {
      const allTracesLoaded = Promise.all(loadedPromises);
      allTracesLoaded.then(this.render.bind(this));
    }

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
      if (data.length > 0) {
        extents.push(d3.extent(data, d => d[1]));
      }
    }

    // If we don't have any points, leave the y scale as it is.
    if (extents.length === 0) {
      return;
    }

    /*
     * The extents array is flattened and the extent of this flattened array is
     * determined to get the extent of all traces.
     */
    const newYDomain = d3.extent([].concat.apply([], extents));
    /*
     * D3 only generates ticks for the y-axis if the domain has a distinct
     * beginning and end. The following check ensures the y-axis will have
     * labels if the extent of y values is a single point.
     */
    if (newYDomain[0] != newYDomain[1]) {
      this.yScale.domain(newYDomain);
    }
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
    const MIN_LABEL_PADDING_IN_PX = 20;
    for (const xTickPeriod of this.xTickPeriods) {
      const typicalTickSpacingInPx = this.xScale(+xTickPeriod.duration)
        - this.xScale(0);
      if (typicalTickSpacingInPx >
          xTickPeriod.maxWidthInPx + MIN_LABEL_PADDING_IN_PX) {
        return xTickPeriod;
      }
    }
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
    if (!roundedTime.isSame(time)) {
      roundedTime.add(1, unit);
    }
    if (unit === 'h' || unit === 'M') {
      return roundedTime.set(unit, 
        Math.ceil(roundedTime.get(unit) / period) * period);
    } else {
      const offset = roundedTime.diff(this.tickReferenceTime, unit) % period;
      if (offset === 0) {
        return roundedTime;
      }
      return roundedTime.add(period - offset, unit);
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
    while (tick.isSameOrBefore(this.interval.end)) {
      ticks.push(+tick);
      if (tickOpts.period.unit === 'h' && tickOpts.period.value > 1) {
        var hours = tick.hours();
        hours = hours + tickOpts.period.value;
        if (hours >= 24) tick.add(1, 'd');
        tick.hours(hours % 24);
      } else {
        tick.add(tickOpts.duration);
      }
    }
    return {
      params: tickOpts,
      ticks: ticks,
    };
  }

  // Calculates the period of the y-axis tick marks. The period will be 1, 2,
  // or 5 times 10**n where n is an integer.
  // @returns {Object} The value property holds the calculated period. The
  // exponent property holds the value of n, which is used for formatting.
  yTickPeriod() {
    const diff = this.yScale.domain()[1] - this.yScale.domain()[0];
    const below = diff / this.yTickCount;
    let exponent = Math.floor(Math.log10(below));
    const mantissa = below * Math.pow(10, -exponent);
    let periodMantissa;
    if (mantissa < 2) {
      periodMantissa = 2;
    } else if (mantissa < 5) {
      periodMantissa = 5;
    } else {
      periodMantissa = 1;
      exponent++;
    }
    const tickPeriod = periodMantissa * Math.pow(10, exponent);
    return {
      value: tickPeriod,
      exponent
    }
  }

  // Calculates the y-axis tick marks. The tick period is determined by the
  // yTickPeriod function. Each tick is divisible by the tick period.
  // @returns {Object} The value property holds an array of Numbers specifying
  // the y-ticks. The fractionDigits property specifies the number of digits
  // right of the decimal point required when formatting the tick values as
  // decimal numbers.
  yTicks() {
    const yExtent = this.yScale.domain();
    const tickPeriod = this.yTickPeriod();
    let tick = Math.ceil(yExtent[0] / tickPeriod.value) * tickPeriod.value;
    let ticks = [];
    while (tick <= yExtent[1]) {
      ticks.push(tick);
      tick += tickPeriod.value;
    }
    return {
      values: ticks,
      fractionDigits: tickPeriod.exponent < 0 ? -tickPeriod.exponent : 0
    };
  }

  // Draws the x-axis, y-axis, and the traces
  render() {
    this.updateYScale();
    this.context.clearRect(-this.margin.left, -this.margin.top, this.width,
      this.height);
    this.drawXAxis();
    this.drawYAxis();
    this.drawTraces();

    this.context.lineWidth = 1;
    this.context.setLineDash([]);
    this.context.strokeStyle = 'gray';
    this.context.strokeRect(-0.5, -0.5, this.traceBoxWidth, this.traceBoxHeight + 1);
  }

  // modified from https://bl.ocks.org/mbostock/1550e57e12e73b86ad9e
  drawXAxis() {
    const tickMarks = this.ticks(this.interval.start, this.interval.end);
    const tickValues = tickMarks.ticks;
    const tickFormat = tickMarks.params.formatter;

    this.context.beginPath();
    for (const tick of tickValues) {
      const xPos = this.xScale(tick);
      this.context.moveTo(xPos, this.traceBoxHeight);
      this.context.lineTo(xPos, this.traceBoxHeight + TICK_SIZE_IN_PX);
    }

    this.context.lineWidth = 1;
    this.context.setLineDash([]);
    this.context.strokeStyle = 'black';
    this.context.stroke();

    // Draw vertical grid lines
    this.context.beginPath();
    for (const tick of tickValues) {
      const xPos = this.xScale(tick);
      this.context.moveTo(xPos, 0);
      this.context.lineTo(xPos, this.traceBoxHeight);
    }
    this.context.strokeStyle = 'lightgray';
    this.context.stroke();

    this.context.textAlign = 'center';
    this.context.textBaseline = 'top';
    let prevTickX;
    const MIN_LABEL_PADDING_IN_PX = 5;
    for (const tick of tickValues) {
      const tickX = this.xScale(tick);
      // Daylight savings and time zone changes can reduce the space between
      // ticks. Only draw a label if there is room.
      if (prevTickX && tickX - prevTickX <
          tickMarks.params.maxWidthInPx + MIN_LABEL_PADDING_IN_PX) {
        continue;
      }
      this.context.fillText(tickFormat(tick), tickX, this.traceBoxHeight + TICK_SIZE_IN_PX);
      prevTickX = tickX;
    }
  }

  // modified from https://bl.ocks.org/mbostock/1550e57e12e73b86ad9e
  drawYAxis() {
    var ticks = this.yTicks(),
        tickFormat = (number) => number.toLocaleString(undefined, {maximumFractionDigits: ticks.fractionDigits});

    this.context.beginPath();
    for (const tick of ticks.values) {
      const yPos = this.yScale(tick);
      this.context.moveTo(0, yPos);
      this.context.lineTo(-TICK_SIZE_IN_PX, yPos);
    }

    this.context.lineWidth = 1;
    this.context.setLineDash([]);
    this.context.strokeStyle = 'black';
    this.context.stroke();

    this.context.beginPath();   
    for (const tick of ticks.values) {
      const yPos = this.yScale(tick);
      this.context.moveTo(0, yPos);
      this.context.lineTo(this.traceBoxWidth, yPos);
    }
    this.context.strokeStyle = 'lightgray';
    this.context.stroke();

    this.context.textAlign = 'right';
    this.context.textBaseline = 'middle';
    for (const tick of ticks.values) {
      this.context.fillText(tickFormat(tick), -TICK_SIZE_IN_PX - TICK_PADDING_IN_PX,
        this.yScale(tick));
    }

    this.context.save();
    this.context.rotate(-Math.PI / 2);
    this.context.textAlign = 'center';
    this.context.textBaseline = 'top';
    this.context.font = 'bold ' + this.context.font;
    this.context.fillText(this.yLabel, -this.traceBoxHeight/2, -this.margin.left);
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

const Interval = require('./interval.js');
const MomentInterval = require('./momentinterval.js');
const Trace = require('./trace.js');
const XAxis = require('./xaxis.js');

const TICK_LENGTH_IN_PX = 6;
const TICK_PADDING_IN_PX = 3;

/**
 * A weather data plot.
 */
class Plot {
  /**
   * @param {d3.Selection} controlRoot - The selection the timespan and
   * interval controls will be appended to (unless options.timeSpanControlRoot)
   * is set.
   * @param {d3.Selection} canvasRoot - The selection the canvas, which
   * contains the axes and traces, will be appended to
   * @param {String} timeZone - Time zone identifier corresponding to the time
   * zone of the weather station, e.g. 'America/Los_Angeles'
   * @param {String} yLabel - Label for the vertical axis
   * @param {Number} yTickLabelChars - The y-axis tick labels will have space
   * for at least this many '0' characters. See the yTicks function comment for
   * details on the formatting of these labels.
   * @param {MomentInterval} interval - Specifies the initial time interval to
   * display.
   * @param {MomentInterval} maxInterval - Specifies the maximum interval the
   * plot can be set to.
   * @param {Object} options - Properties of options are optional parameters
   * @param {Number} options.minIntervalLength - The minimum interval length in
   * ms. Default is one hour.
   * @param {Boolean} options.smooth - Set to false to not draw smooth traces
   * (by default, WXPlot uses monotone cubic interpolation to produce smooth
   * lines that pass through all data points and do not introduce minima or
   * maxima between points).
   * @param {d3.Selection} options.legendRoot - The selection the legend will
   * be appended to.
   * @param {d3.Selection} options.timeSpanControlRoot - The selection the
   * timespan control form will be appended to.
   */
  constructor(controlRoot, canvasRoot, timeZone, yLabel, yTickLabelChars,
      interval, maxInterval, options = {}) {
    this._controls = controlRoot.append('div')
        .attr('id', 'wxplot-controls');
    this._canvasRoot = canvasRoot.append('div')
        .attr('id', 'wxplot-canvas-box');
    this._timeZone = timeZone;
    this._yLabel = yLabel;
    this._yTickLabelChars = yTickLabelChars;
    if (!(interval instanceof MomentInterval)) {
      throw new Error('interval must be an instance of Interval');
    }
    this._interval = interval;
    if (!(maxInterval instanceof MomentInterval)) {
      throw new Error('maxInterval must be an instance of Interval');
    }
    this._maxInterval = maxInterval;
    this._options = options;

    this._traces = [];

    let timeSpanControlRoot;
    if ('timeSpanControlRoot' in this._options) {
      this._timeSpanControlRoot = this._options.timeSpanControlRoot;
    } else {
      this._timeSpanControlRoot = controlRoot;
    }

    this._initializeControls();
    // Creates the legend, which is a set of line samples and accompanying
    // textual descriptions. The line samples are drawn on small Canvases so
    // the samples look exactly the same as the actual lines.
    let legendRoot;
    if ('legendRoot' in this._options) {
      legendRoot = this._options.legendRoot;
    } else {
      legendRoot = controlRoot;
    }
    legendRoot.append('div')
        .attr('id', 'wxplot-legend');

    this._updateControls();

    let minIntervalLength;
    if ('minIntervalLength' in this._options) {
      this._minIntervalLength = this._options.minIntervalLength;
    } else {
      // One hour in ms
      this._minIntervalLength = 3600000;
    }

    // this._traceBox is created here, instead of in initializeCanvas, so
    // references to it stay valid when the trace box's dimensions change.
    this._traceBox = {};

    this._xScale = d3.scaleLinear()
        .domain([interval.start, interval.end]);

    this._yScale = d3.scaleLinear()
        .domain([0, 10]);

    this._lineGenerator = d3.line()
        .defined(function(d) { return d[1] != null; })
        .x((d) => { return this._xScale(d[0]); })
        .y((d) => { return this._yScale(d[1]); });

    if (!('smooth' in this._options) || this._options.smooth === true) {
      // Best to use curveMonotoneX or curveLinear so the maxima and minima in
      // the trace correspond to the maxima and minima in the data and the
      // curve passes through all data points.
      this._lineGenerator.curve(d3.curveMonotoneX);
    }

    this._initializePlot()

    // Various plot elements need to be updated if the canvas root's size
    // changes.
    const ResizeSensor = require('css-element-queries/src/ResizeSensor');
    new ResizeSensor(this._canvasRoot.node(), () => {
      // It's much simpler to remove the canvases, zoom, and brush and recreate
      // them than it is to update them. Resizes occur infrequently so whatever
      // performance penalties this approach incurs don't matter.
      this._destroyPlot();
      this._initializePlot();
      this._render();
    });
  }

  // Removes plot elements created by _initializePlot, so the plot may be
  // reinitialized.
  _destroyPlot() {
    document.getElementById('wxplot-canvas-box').removeChild(
      document.getElementById('wxplot-canvas'));
    this._zoomBox.remove();
    this._brushBox.remove();
    d3.select('#wxplot-brush-indicator').remove();
  }

  // Initialize plot elements
  _initializePlot() {
      this._initializeCanvas();
      this._initializeZoom();
      this._initializeBrush();
      this._xAxis = new XAxis(
        this._context, this._traceBox, this._xScale, TICK_LENGTH_IN_PX);
  }

  // Creates canvas for drawing the plot's axes and traces.
  _initializeCanvas(yTickLabelChars) {
    const plotStyle = getComputedStyle(this._canvasRoot.node());
    this._canvasWidth = parseFloat(plotStyle.width);
    this._canvasHeight = parseFloat(plotStyle.height);
    const LINE_HEIGHT = 1.2;
    this._textHeightPx = parseFloat(plotStyle['font-size']) * LINE_HEIGHT;

    const canvas = document.createElement('canvas');
    this._canvasRoot.node().appendChild(canvas);
    canvas.id = 'wxplot-canvas';
    // To produce a crisp image, the dimensions of the canvas buffer should
    // equal the dimensions in physical pixels of the rendered canvas on the
    // screen of the user's device. To accomplish this the canvas buffer is set
    // to its CSS dimensions multiplied by devicePixelRatio. The context is
    // scaled so the canvas can be treated as if it had its CSS dimensions when
    // drawing.
    canvas.setAttribute('width', devicePixelRatio * this._canvasWidth);
    canvas.setAttribute('height', devicePixelRatio * this._canvasHeight);
    this._context = canvas.getContext('2d');
    this._context.scale(devicePixelRatio, devicePixelRatio);
    this._context.font = plotStyle['font-size'] + ' '
      + plotStyle['font-family'];
    const zeroWidthPx = this._context.measureText('0').width;

    this._xAxisHeight = Math.ceil(this._textHeightPx + TICK_LENGTH_IN_PX);
    const padding = 2;
    this._traceBox.x = Math.ceil(
      this._textHeightPx + TICK_LENGTH_IN_PX + TICK_PADDING_IN_PX
      + this._yTickLabelChars*zeroWidthPx + padding);
    this._traceBox.y = Math.ceil(this._textHeightPx / 2);
    this._traceBox.width = this._canvasWidth - this._traceBox.x;
    this._traceBox.height = this._canvasHeight - this._traceBox.y
      - this._xAxisHeight;

    this._xScale.range([0, this._traceBox.width]);
    this._origXScale = this._xScale.copy();
    this._yScale.range([this._traceBox.height, 0]);
    this._lineGenerator.context(this._context);

    this._yTickCount = Math.floor(
      this._canvasHeight / (this._textHeightPx + 36));
  }

  _initializeZoom() {
    const minScale = (this._interval.end - this._interval.start) 
      / (this._maxInterval.end - this._maxInterval.start);
    const maxScale = (this._interval.end - this._interval.start)
      / this._minIntervalLength;
    this._zoom = d3.zoom()
        .extent([[0, 0], [this._traceBox.width, this._traceBox.height]])
        .scaleExtent([minScale, maxScale])
        .translateExtent([[this._origXScale(this._maxInterval.start), 0],
          [this._origXScale(this._maxInterval.end), this._canvasHeight]])
        .on('zoom', this._zoomed.bind(this));
    this._zoomBox = this._canvasRoot.append('div')
      .attr('id', 'wxplot-zoom')
      .style('width', this._traceBox.width + 'px')
      .style('height', this._traceBox.height + 'px')
      .style('margin-top', this._traceBox.y + 'px')
      .style('margin-left', this._traceBox.x + 'px')
    this._zoomBox.call(this._zoom);
  }

  _initializeBrush() {
    this._brush = d3.brushX()
      .extent([[0, 0], [this._traceBox.width, this._xAxisHeight]])
      .on("end", this._brushed.bind(this))
      .on("brush", () => {
        const sel = d3.event.selection;
        // After the user has made a brush selection, the selection is cleared,
        // so a null selection will be passed in. When that occurs, hide the
        // brush indicator by setting its width to 0.
        if (sel) {
          this._brushIndicatorRect.attr('x', sel[0])
            .attr('width', sel[1] - sel[0])
        } else {
          this._brushIndicatorRect.attr('width', 0)
        }
      });

    this._brushBox = this._canvasRoot.append('svg')
        .attr('width', this._traceBox.width)
        .attr('height', this._xAxisHeight)
        .attr('id', 'wxplot-brush')
        .style('margin-left', this._traceBox.x + 'px')
        .call(this._brush);

    this._brushIndicatorRect = this._canvasRoot.append('svg')
        .attr('width', this._traceBox.width)
        .attr('height', this._traceBox.height)
        .attr('id', 'wxplot-brush-indicator')
        .style('margin-top', this._traceBox.y + 'px')
        .style('margin-left', this._traceBox.x + 'px')
        .append('rect')
        .attr('y', 0)
        .attr('height', this._traceBox.height)
  }

  // Creates the input elements used to control/display the plot's interval
  _initializeControls() {
    // Add inputs to set/display the plot's start and end date
    const startControl = this._controls.append('div')
        .classed('wxplot-interval-control', true);
    startControl.append('label')
        .text('Start:');
    const start = startControl.append('input')
        .attr('type', 'text')
        .on('keypress', () => {
          if(d3.event.which === 13) {
            start.node().blur();
            this._processStartEndDateForm();
          }
        });

    const endControl = this._controls.append('div')
        .classed('wxplot-interval-control', true);
    endControl.append('label')
        .text('End:');
    const end = endControl.append('input')
        .attr('type', 'text')
        .on('keypress', () => {
          if(d3.event.which === 13) {
            end.node().blur();
            this._processStartEndDateForm();
          }
        });

    const errorMessage = this._controls.append('label')
      .classed('wxplot-error-message', true);

    this._controls.append('button')
      .attr('id', 'wxplot-help-button')
      .text('?')
      .on('click', () => {
        document
          .getElementById('wxplot-help-box')
            .classList.toggle('wxplot-hide');
        const button = document.getElementById('wxplot-help-button');
        button.classList.toggle('wxplot-pressed');
        button.blur();
      })

    // The help message box is added to the canvas div rather than the controls
    // div because the controls div can get small on mobile, and the canvas div
    // is (probably) more centrally positioned.
    const helpDiv = this._canvasRoot.append('div')
      .attr('id', 'wxplot-help-box')
      .classed('wxplot-hide', true)
    helpDiv.append('button')
      .attr('id', 'wxplot-help-close-button')
      .text('x')
      .on('click', () => {
        document
          .getElementById('wxplot-help-box')
            .classList.add('wxplot-hide');
        document
          .getElementById('wxplot-help-button')
            .classList.remove('wxplot-pressed');
      })
    helpDiv
      .append('span')
        .html('Use the mouse or touch to pan/zoom.<br>\
              Drag in the violet box below the x-axis to zoom to a certain \
              region.');
  

    // Add a row of buttons to control the timespan
    const timespanForm = this._timeSpanControlRoot.append('form')
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
    ];

    for (const timespan of timespans) {
      const button = timespanForm.append('input')
        .attr('type', 'button')

      timespan.button = button;

      if (timespan.unit === 'max') {
        button.attr('value', 'max')
        .on('click', () => {
          this.setIntervalAnimate(this._maxInterval);
          button.node().blur()
        })
      } else {
        timespan.duration = moment.duration(timespan.value, timespan.unit)
        button.attr('value', timespan.value + timespan.unit.toLowerCase())
        .on('click', () => {
          this._setTimeSpan(timespan.duration)
          button.node().blur()
        })
      }
    }

    this._controlForm = {
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
  _setTimeSpan(timespan) {
    // We can't do the following calculations in unix time because months and
    // years have variable length in ms.
    const possibleStart = this._interval.end.clone().subtract(timespan)
    if (possibleStart.isSameOrAfter(this._maxInterval.start)) {
      this.setIntervalAnimate(new Interval(possibleStart, this._interval.end));
      return;
    } else {
      const possibleEnd = this._maxInterval.start.clone().add(timespan)
      if (possibleEnd.isSameOrBefore(this._maxInterval.end)) {
        this.setIntervalAnimate(new Interval(this._maxInterval.start,
                                             possibleEnd));
      } else {
        this.setIntervalAnimate(this._maxInterval);
      }
    }
  }

  /*
   * Parses the control inputs. If they represent a valid interval, the plot is
   * updated to display that interval. Otherwise an error message indicating
   * the problem is displayed.
   */
  _processStartEndDateForm() {
    let start = moment.tz(this._controlForm.start.property('value'),
      'MM-DD-YYYY', this._timeZone);

    let end = moment.tz(this._controlForm.end.property('value'),
      'MM-DD-YYYY', this._timeZone);

    if (!start.isValid() || !end.isValid()) {
      this._controlForm.start.classed('wxplot-input-error', !start.isValid());
      this._controlForm.end.classed('wxplot-input-error', !end.isValid());
      this._controlForm.errorMessage.text(
        'Invalid Date (must have format MM/DD/YYYY)');
      return;
    }

    if (start >= end) {
      this._controlForm.start.classed('wxplot-input-error', true);
      this._controlForm.end.classed('wxplot-input-error', true);
      this._controlForm.errorMessage.text('Start must be before end.');
      return;
    }

    this._controlForm.start.classed('wxplot-input-error', false);
    this._controlForm.end.classed('wxplot-input-error', false);
    this._controlForm.errorMessage.text('');
    this.setIntervalAnimate(new Interval(start, end));      
  }

  // Updates the plot's controls to reflect the plot's current interval
  _updateControls() {
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
      const timespans = this._controlForm.timespans;
      // Flag to indicate when we've colored the buttons we want to color
      let timespanColorsSet = false;
      /*
       * If the plot is at its maximum interval, color the max button
       * regardless of how the plot's timespan compares to the other buttons'
       * timespans. 
       */
      const maxTimespan = timespans[timespans.length - 1];
      if (this._interval.equals(this._maxInterval)) {
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
          const diff = this._interval.end - this._interval.start;
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
    if (this._controlForm.errorMessage.text()) {
      this._controlForm.start.classed('wxplot-input-error', false);
      this._controlForm.end.classed('wxplot-input-error', false);
      this._controlForm.errorMessage.text('')
    }
    this._controlForm.start.property('value',
                                     this._interval.start.format('l'));
    this._controlForm.end.property('value', this._interval.end.format('l'));

    updateTimespanControls.call(this);
  }

  /**
   * Sets the plot's interval with a 500 ms animation between the old and new
   * intervals.
   * @param {Interval|MomentInterval} interval
   */
  setIntervalAnimate(interval) {
    this.setInterval(interval, true);
  }

  /**
   * Sets the plot's interval
   * @param {Interval|MomentInterval} interval
   */
  setInterval(interval, animate=false) {
    let start = +interval.start;
    let end = +interval.end;
    if (start < this._maxInterval.start) {
      start = this._maxInterval.start;
    }
    if (end > this._maxInterval.end) {
      end = this._maxInterval.end;
    }
    const diff = end - start;
    if (diff < this._minIntervalLength) {
      const extra = this._minIntervalLength - diff;
      start -= extra/2;
      end += extra/2;
    }
    // The current interval is determined by the D3 zoom behavior that was
    // applied to the canvas. this._interval merely caches the start and end of
    // the interval. To change the interval, we must change the zoom. Zoom is
    // stored as a transformation of the initial scale, so we must calculate
    // the transformation that yields the desired interval.
    const startX = this._origXScale(start);
    const endX = this._origXScale(end);
    const baseRange = this._origXScale.range();
    const scaleFactor = (baseRange[1] - baseRange[0]) / (endX - startX);
    const xShift = scaleFactor*baseRange[0] - startX;
    const selection = animate ? this._zoomBox.transition().duration(500)
      : this._zoomBox;
    selection.call(this._zoom.transform,
                   d3.zoomIdentity.scale(scaleFactor).translate(xShift, 0));
  }

  /**
   * Sets the y-axis label
   * @param {String} label - The new label
   * @returns {Plot} The object setYLabel was called on
   */
  setYLabel(label) {
    this._yLabel = label;
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
   * @param {Number} dataParams.offset - Optional. Shift this trace to the
   * right (forward in time) this many seconds.
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
  addTrace(name, group, dataParams, color, dash, width, options = {}) {
    this._traces.push(new Trace(
      name, group, Object.assign({}, dataParams), this._lineGenerator, 
      this._traceBox, color, dash, width, options));

    const legendText = name;
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
    // trace.
    const legendNode = document.createElement('div');
    groupTraces.appendChild(legendNode);
    legendNode.classList.add('wxplot-legend-trace');
    const LEGEND_LINE_LEN = 20;
    const canvas = document.createElement('canvas');
    legendNode.appendChild(canvas);
    const span = document.createElement('span');
    legendNode.appendChild(span);
    span.innerText = legendText;
    canvas.width = LEGEND_LINE_LEN * window.devicePixelRatio;
    canvas.height = this._textHeightPx * window.devicePixelRatio;
    canvas.style.width = LEGEND_LINE_LEN + 'px';
    canvas.style.height = this._textHeightPx + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.beginPath();
    const lineHeight = Math.round(this._textHeightPx / 2) + 0.5;
    ctx.moveTo(0, lineHeight);
    ctx.lineTo(LEGEND_LINE_LEN, lineHeight);
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.stroke();
    return this;
  }

  /**
   * Loads data for newly added traces and redraws the plot once all data has
   * loaded.
   * @returns {Plot} the object loadTracesAndRedraw was called on.
   */
  loadTracesAndRedraw() {
    this._setTraceIntervals();
    return this;
  }

  /**
   * @returns {Array} The legend text of each of the plots traces.
   */
  getTraces() {
    return this._traces.map(trace => trace.legendText);
  }

  /**
   * Removes all traces from the plot.
   * @returns {Plot} the object removeTrace was called on.
   */
  removeTraces() {
    this._traces = [];
    let legend = document.getElementById('wxplot-legend');
    const legendRoot = legend.parentNode;
    legendRoot.removeChild(legend);
    legend = document.createElement('div');
    legend.id = 'wxplot-legend';
    legendRoot.appendChild(legend);
    return this;
  }

  /*
   * Event handler for the D3 zoom event, which includes panning and zooming.
   * Updates the interval, gets new data for each trace, and renders
   */
  _zoomed() {  
    const scale = d3.event.transform.rescaleX(this._origXScale);
    // Update this._xScale rather than assigning a new scale to it, so other
    // references to it (such as in XAxis objects) also get the update.
    this._xScale.domain(scale.domain());

    // The earliest visible time.
    const start = this._xScale.invert(0);

    // The latest visible time.
    const end = this._xScale.invert(this._traceBox.width); 
    this._interval = new MomentInterval(moment.tz(start, this._timeZone), 
                                        moment.tz(end, this._timeZone));
    this._updateControls();
    this._setTraceIntervals();
    this._render();
  }

  _setTraceIntervals() {
    // Create a promise for each trace that needs data from the server that
    // resolves once the data has loaded. Promise.all is used to redraw the
    // plot exactly once when all data has loaded.
    let loadedPromises = [];
    for (const trace of this._traces) {
        trace.setInterval(this._interval);
        // Don't create a promise for the loading of a DataBlock if we already
        // created one in a previous zoomed call (which happens because
        // multiple plot intervals may map to the same DataBlock), as indicated
        // by dataView.onDataBlockLoaded being non-null.
        if (trace.isLoadingData()) {
          loadedPromises.push(trace.loadedPromise());
        }
    }
    if (loadedPromises.length > 0) {
      const allTracesLoaded = Promise.all(loadedPromises);
      allTracesLoaded.then(this._render.bind(this));
    }
  }

  // Event handler for the D3 brush event. Sets the plot's interval based on
  // the region selected with the brush.
  _brushed() {
    var selection = d3.event.selection;
    // brushed is called with a null selection after the brush selection is
    // cleared.
    if (!selection) {
      return;
    }
    // Clear the brush selection
    this._brushBox.call(this._brush.move, null);
    const interval = selection.map(this._xScale.invert, this._xScale);
    this.setIntervalAnimate(new Interval(...interval));
  }

  /*
   * Finds the maximum extent of the values of all traces and sets the range of
   * the y-scale to this extent.
   */
  _updateYScale() {
    let extents = [];
    for (const trace of this._traces) {
      const extent = trace.dataExtent();
      if (extent) {
        extents.push(extent);
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
      this._yScale.domain(newYDomain);
    }
  }

  // Calculates the period of the y-axis tick marks. The period will be 1, 2,
  // or 5 times 10**n where n is an integer.
  // @returns {Object} The value property holds the calculated period. The
  // exponent property holds the value of n, which is used for formatting.
  _yTickPeriod() {
    const diff = this._yScale.domain()[1] - this._yScale.domain()[0];
    const below = diff / this._yTickCount;
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
  _yTicks() {
    const yExtent = this._yScale.domain();
    const tickPeriod = this._yTickPeriod();
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
  _render() {
    this._updateYScale();
    this._context.clearRect(0, 0, this._canvasWidth, this._canvasHeight);
    this._context.fillStyle = 'white';
    this._context.fillRect(
      this._traceBox.x, this._traceBox.y, this._traceBox.width,
      this._traceBox.height);
    this._xAxis.draw(this._interval);
    this._drawYAxis();
    this._drawTraces();

    this._context.lineWidth = 1;
    this._context.setLineDash([]);
    this._context.strokeStyle = 'gray';
    this._context.strokeRect(
      this._traceBox.x - 0.5, this._traceBox.y - 0.5, this._traceBox.width,
      this._traceBox.height);
  }

  // modified from https://bl.ocks.org/mbostock/1550e57e12e73b86ad9e
  _drawYAxis() {
    const ticks = this._yTicks();
    const tickFormat = (number) => {
      return number.toLocaleString(
        undefined, {maximumFractionDigits: ticks.fractionDigits});
    };

    this._context.translate(this._traceBox.x, this._traceBox.y);
    this._context.beginPath();
    for (const tick of ticks.values) {
      const yPos = Math.round(this._yScale(tick)) + 0.5;
      this._context.moveTo(-TICK_LENGTH_IN_PX, yPos);
      this._context.lineTo(0, yPos);
    }

    this._context.lineWidth = 1;
    this._context.setLineDash([]);
    this._context.strokeStyle = 'black';
    this._context.stroke();

    this._context.beginPath();   
    for (const tick of ticks.values) {
      const yPos = Math.round(this._yScale(tick)) + 0.5;
      this._context.moveTo(0, yPos);
      this._context.lineTo(this._traceBox.width, yPos);
    }
    this._context.strokeStyle = 'lightgray';
    this._context.stroke();

    this._context.textAlign = 'right';
    this._context.textBaseline = 'middle';
    this._context.fillStyle = 'black';
    for (const tick of ticks.values) {
      this._context.fillText(
        tickFormat(tick), -TICK_LENGTH_IN_PX - TICK_PADDING_IN_PX,
        this._yScale(tick));
    }

    this._context.save();
    this._context.rotate(-Math.PI / 2);
    this._context.textAlign = 'center';
    this._context.textBaseline = 'top';
    this._context.font = 'bold ' + this._context.font;
    this._context.fillText(
      this._yLabel, -this._traceBox.height/2, -this._traceBox.x);
    this._context.restore();
    this._context.translate(-this._traceBox.x, -this._traceBox.y);
  }

  // Draws the traces
  _drawTraces() {
    for (const trace of this._traces) {
      trace.draw();
    }
  }
}

// jsdoc doesn't work when the export is at the declaration.
module.exports = Plot;

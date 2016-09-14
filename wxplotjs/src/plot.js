let DataView = require("./dataview.js");

module.exports = class Plot {
  constructor(root, timeZone, yLabel, interval, maxInterval, options) {
    this.timeZone = timeZone;
    this.yLabel = yLabel;
    this.maxInterval = maxInterval;
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

    if (!("smooth" in this.options) || this.options.smooth === true) {
      // Best to use curveMonotoneX or curveLinear so the maxima and minima in
      // the trace correspond to the maxima and minima in the data and the
      // curve passes through all data points.
      this.lineGenerator.curve(d3.curveMonotoneX);
    }
    
    this.plotDiv = root.append("div")
        .attr("id", "wxplot")
    this.initializeControlForm();
    this.updateControlForm();

    const ONE_HOUR_IN_MS = 3600000;
    const minScale = (interval.end - interval.start) / (this.maxInterval.end - this.maxInterval.start);
    const maxScale = (interval.end - interval.start) / ONE_HOUR_IN_MS;
    this.zoom = d3.zoom()
        .extent([[0, 0], [this.lineBoxWidth, this.lineBoxHeight]])
        .scaleExtent([minScale, maxScale])
        .translateExtent([[this.origXScale(this.maxInterval.start), 0],
          [this.origXScale(this.maxInterval.end), this.height]])
        .on("zoom", this.zoomed.bind(this));

    this.canvas = this.plotDiv.append("canvas")
        .attr("width", this.width)
        .attr("height", this.height)
        .call(this.zoom);

    this.context = this.canvas.node().getContext("2d");
    this.context.translate(this.margin.left, this.margin.top);
    this.TEXT_SIZE = 10;
    this.context.font = this.TEXT_SIZE + "px sans-serif";
    this.lineGenerator.context(this.context);

    // This structure is used to determine the period of x-axis ticks and their format.
    // We don't use moment durations for the period because they are too general.
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

  initializeLegendBox() {
    this.legendBox = this.plotDiv.append("div")
        .attr("id", "legend-box");
  }

  initializeControlForm() {
    const form = this.plotDiv.append("form");
    form.attr("id", "control-form");

    form.append("label")
        .text("Start:");
    const start = form.append("input")
        .attr("type", "text")
        .on("keypress", () => {
          if(d3.event.which === 13) {
            start.node().blur();
            this.processControlForm();
          }
        });

    form.append("label")
        .text("End:");
    const end = form.append("input")
        .attr("type", "text")
        .on("keypress", () => {
          if(d3.event.which === 13) {
            end.node().blur();
            this.processControlForm();
          }
        });

    const errorMessage = form.append("label")
      .classed("error-message", true);

    this.controlForm = {
      start,
      end,
      errorMessage
    };
  }

  processControlForm() {
    let start = moment.tz(this.controlForm.start.property("value"),
      "MM-DD-YYYY", this.timeZone);

    let end = moment.tz(this.controlForm.end.property("value"),
      "MM-DD-YYYY", this.timeZone);

    if (!start.isValid() || !end.isValid()) {
      this.controlForm.start.classed("input-error", !start.isValid());
      this.controlForm.end.classed("input-error", !end.isValid());
      this.controlForm.errorMessage.text("Invalid Date (must have format MM/DD/YYYY)");
      return;
    }

    if (start >= end) {
      this.controlForm.start.classed("input-error", true);
      this.controlForm.end.classed("input-error", true);
      this.controlForm.errorMessage.text("Start must be before end.");
      return;
    }

    this.controlForm.start.classed("input-error", false);
    this.controlForm.end.classed("input-error", false);

    if (start < this.maxInterval.start) {
      start = this.maxInterval.start;
    }
    if (end > this.maxInterval.end) {
      end = this.maxInterval.end;
    }
    this.controlForm.errorMessage.text("");
    this.setInterval(start, end);      
  }

  setInterval(start, end) {
    const startX = this.origXScale(start);
    const endX = this.origXScale(end);
    const baseRange = this.origXScale.range();
    const scaleFactor = (baseRange[1] - baseRange[0]) / (endX - startX);
    const xShift = scaleFactor*baseRange[0] - startX;
    this.canvas.call(this.zoom.transform,
      d3.zoomIdentity.scale(scaleFactor).translate(xShift, 0));
  }

  updateControlForm() {
    if (this.controlForm.errorMessage.text()) {
      this.controlForm.start.classed("input-error", false);
      this.controlForm.end.classed("input-error", false);
      this.controlForm.errorMessage.text("")
    }
    this.controlForm.start.property("value", this.interval.start.format('l'));
    this.controlForm.end.property("value", this.interval.end.format('l'));
  }

  addTrace(dataParams, legend, color, dash, width) {
    const dataView = new DataView(Object.assign({}, dataParams))
        .setInterval((+this.interval.start), (+this.interval.end));
    dataView.onLoaded = this.onDataViewLoaded.bind(this);

    this.traces.push({
        legend,
        width,
        color,
        dash,
        dataView
    });

    if (this.traces.length === 1) {
      this.initializeLegendBox();      
    }

    const p = this.legendBox.append("p");
    const LEGEND_LINE_LEN = 20;
    const ctx = p.append("canvas")
        .attr("width", LEGEND_LINE_LEN)
        .attr("height", this.TEXT_SIZE)
        .node()
        .getContext("2d");

    ctx.beginPath();     
    ctx.moveTo(0, this.TEXT_SIZE / 2);
    ctx.lineTo(LEGEND_LINE_LEN, this.TEXT_SIZE / 2);
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.stroke(); 

    p.append("span")
        .text(legend);

    return this;
  }

  removeTrace(legend) {
    this.traces = this.traces.filter(trace => trace.legend != legend);
    this.updateYScale();
    this.render();
    return this;
  }

  getTraces() {
    return this.traces.map(trace => trace.legend);
  }
//
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

    this.context.strokeStyle = "black";
    this.context.stroke();

    for (const tick of tickValues) {
      this.context.moveTo(this.xScale(tick), 0);
      this.context.lineTo(this.xScale(tick), this.lineBoxHeight);
    }
    this.context.strokeStyle = "lightgray";
    this.context.stroke();

    this.context.textAlign = "center";
    this.context.textBaseline = "top";
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
    this.context.strokeStyle = "black";
    this.context.stroke();

    for (const tick of ticks) {
      this.context.moveTo(0, this.yScale(tick));
      this.context.lineTo(this.lineBoxWidth, this.yScale(tick));
    }
    this.context.strokeStyle = "lightgray";
    this.context.stroke();

    this.context.textAlign = "right";
    this.context.textBaseline = "middle";
    for (const tick of ticks) {
      this.context.fillText(tickFormat(tick), -tickSize - tickPadding, this.yScale(tick));
    }

    this.context.save();
    this.context.rotate(-Math.PI / 2);
    this.context.textAlign = "right";
    this.context.textBaseline = "top";
    this.context.font = "bold 10px sans-serif";
    this.context.fillText(this.yLabel, -10, 10);
    this.context.restore();
  }

  updateYScale() {
    let extents = [];
    for (const trace of this.traces) {
      if (!trace.dataView.isLoaded()) continue;
      let data = trace.dataView.getDisplayData();
      extents.push(d3.extent(data, d => d[1]));
    }

    // Flatten the extents array and take its extent to get the extent of all traces.
    this.yScale.domain(d3.extent([].concat.apply([], extents)));
  }

  drawPaths() {
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

  onDataViewLoaded(){
    this.updateYScale();
    this.render();
  }

  render() {
    this.context.clearRect(0, -this.margin.top, this.lineBoxWidth, this.height);
    this.drawXAxis();
    this.context.clearRect(-this.margin.left, -this.margin.top, this.margin.left, this.height);
    this.drawYAxis();
    this.drawPaths();
    this.context.strokeStyle = "gray";
    this.context.strokeRect(-0.5, -0.5, this.lineBoxWidth, this.lineBoxHeight + 1);
  }

  zoomed() {  
    this.xScale = d3.event.transform.rescaleX(this.origXScale);
    const start = this.xScale.invert(0); // The earliest visible time.
    const end = this.xScale.invert(this.lineBoxWidth); // The latest visible time.
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

  makeTickFormatter(dateFormatString) {
    return d => moment.tz(d, this.timeZone).format(dateFormatString);
  }

  tickOptions(start, end) {
    const delta = moment.duration(end.diff(start));

    let i;
    for (i = 0; i < this.deltaIntervalMap.length; i++) {
      if (delta < this.deltaIntervalMap[i][0]) return this.deltaIntervalMap[i][1];
    }

    return this.deltaIntervalMap[i - 1][1];
  }

  // time must be a moment object with a time zone 
  firstTick(time, tickPeriod) {
    var period = tickPeriod.value;
    var unit = tickPeriod.unit;

    var roundedTime = time.clone().startOf(unit);

    if (unit === 'h' || unit === 'M') {
      return roundedTime.set(unit, 
        Math.floor(time.get(unit) / period) * period);
    } else {
      let tickPeriodMs = +moment.duration(period, unit);
      var ref = Math.floor(+time / +tickPeriodMs) * +tickPeriodMs
      return moment.tz(ref, time.tz()).startOf(unit);
    }
  }

  // start and end are moments
  // returns an array of ticks which are unix time in ms
  ticks(start, end) {
    var tickOpts = this.tickOptions(start, end);

    var ticks = [];
    var tick = this.firstTick(start, tickOpts.period);
    var period = moment.duration(tickOpts.period.value, tickOpts.period.unit);
    while (tick.isSameOrBefore(end)) {
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
}
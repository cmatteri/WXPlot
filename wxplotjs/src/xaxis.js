// Calculates where to put x-axis ticks based on text size and level of
// zoom. Draws x-axis ticks and labels, and vertical gridlines.
module.exports = class XAxis {
  constructor(context, traceBox, xScale, tickLength) {
    this._context = context;
    this._traceBox = traceBox;
    this._xScale = xScale;
    this._tickLength = tickLength;
    /*
     * This structure is used to determine the period of x-axis ticks and their
     * format. We don't use moment durations for the period because they are
     * too general. The value property of a period should be an integer. The
     * unit should be hours, days, months, or years. If the unit is hours or
     * days there is an additional constraint described by the firstTick
     * function.
     */
    this._xTickPeriods = [{
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
    for (const xTickParams of this._xTickPeriods) {
      const tickLabel = example.format(xTickParams.format);
      xTickParams.maxWidthInPx = this._context.measureText(tickLabel).width;
      xTickParams.formatter = this._makeTickFormatter(xTickParams.format);
      xTickParams.duration = moment.duration(xTickParams.period.value,
      xTickParams.period.unit)
    }
  }

  /*
   * @param {string} dateFormatString - A format specifier for a moment
   * @returns A function that takes a unix time in ms and returns a string
   * containing that time formatted according to dateFormatString.
   */
  _makeTickFormatter(dateFormatString) {
    return d => moment.tz(d, this._timeZone).format(dateFormatString);
  }

  /*
   * Returns an object with the properties period and format. Period is the
   * period between x-axis ticks. It is represented as an object with
   * properties unit and value. Unit is a string representing a quantity of
   * time suitable for moment.add and value is an integer. Format is a function
   * like those returned by makeTickFormatter, which is used to format tick
   * labels.
   */
  _tickOptions() {
    const MIN_LABEL_PADDING_IN_PX = 20;
    for (const xTickPeriod of this._xTickPeriods) {
      const typicalTickSpacingInPx = this._xScale(+xTickPeriod.duration)
        - this._xScale(0);
      if (typicalTickSpacingInPx >
          xTickPeriod.maxWidthInPx + MIN_LABEL_PADDING_IN_PX) {
        return xTickPeriod;
      }
    }
  }

  /*
   * tickPeriod is an object representing the period of x-axis ticks, like that
   * in the period property of the object returned by tickOptions. Returns the
   * time of the first tick in the plot's current interval as a unix time in
   * ms. If the tick period is greater than one, there are multiple choices
   * for where to put the first tick (e.g. if the tick period is three days,
   * there are three possible times for the first tick that align with day
   * boundaries). It would be jarring to have the location of the tick marks
   * change as the plot is panned, so in order to always choose the same time
   * for a tick when there are multiple options, a reference time is used. All
   * ticks are chosen to be an integer multiple of tick periods after the
   * reference time. For tick periods in hours, the reference time is the start
   * of the day, and the tick period should be a factor of 24. For tick periods
   * in months, the reference time is the start of the year and the tick period
   * should be a factor of 12. For tick periods in days or years the reference
   * time is the year of the start of the first interval passed to draw.
   */
  _firstTick(interval, tickPeriod) {
    const time = interval.start;
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
      let offset = roundedTime.diff(this._tickReferenceTime, unit) % period;
      if (offset < 0) {
        offset += period;
      }
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
   * ticks would occurs at 2 am, 5 am, 8 am, ... or 4 am, 7 am, 10 am, ...,
   * and, if the plot were panned to the following day, they would jump back to
   * 12 am, 3 am, 6 am, ..., the times they are normally at. Ignoring the
   * daylight savings time change prevents the ticks from jumping. Note that
   * the plot uses unix time for positioning points and ticks on the x-axis, so
   * the choice of tick times in no way affects the accuracy of the plot.
   */
  _ticks(interval) {
    // We use the first interval passed to the XAxis object to initialize
    // this._timeZone and this._tickReferenceTime, to avoid needing to pass a
    // timeZone to the constructor.
    if (!this._timeZone) {
      this._timeZone = interval.start.tz();
       this._tickReferenceTime = interval.start.clone().startOf('year');
    }

    var tickOpts = this._tickOptions();
    var ticks = [];
    var tick = this._firstTick(interval, tickOpts.period);
    while (tick.isSameOrBefore(interval.end)) {
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

  // modified from https://bl.ocks.org/mbostock/1550e57e12e73b86ad9e
  // Calculates and draws x-axis ticks and labels, and vertical gridlines for
  // the given interval.
  draw(interval) {
    this._context.translate(this._traceBox.x, this._traceBox.y);
    const tickMarks = this._ticks(interval);
    const tickValues = tickMarks.ticks;
    const tickFormat = tickMarks.params.formatter;

    this._context.beginPath();
    for (const tick of tickValues) {
      const xPos = Math.round(this._xScale(tick)) + 0.5;
      this._context.moveTo(xPos, this._traceBox.height);
      this._context.lineTo(xPos, this._traceBox.height + this._tickLength);
    }

    this._context.lineWidth = 1;
    this._context.setLineDash([]);
    this._context.strokeStyle = 'black';
    this._context.stroke();

    // Draw vertical grid lines
    this._context.beginPath();
    for (const tick of tickValues) {
      const xPos = Math.round(this._xScale(tick)) + 0.5;
      this._context.moveTo(xPos, 0);
      this._context.lineTo(xPos, this._traceBox.height);
    }
    this._context.strokeStyle = 'lightgray';
    this._context.stroke();

    this._context.textAlign = 'center';
    this._context.textBaseline = 'top';
    let prevTickX;
    const MIN_LABEL_PADDING_IN_PX = 5;
    for (const tick of tickValues) {
      const tickX = this._xScale(tick);
      // Daylight savings and time zone changes can reduce the space between
      // ticks. Only draw a label if there is room.
      if (prevTickX && tickX - prevTickX <
          tickMarks.params.maxWidthInPx + MIN_LABEL_PADDING_IN_PX) {
        continue;
      }
      this._context.fillStyle = 'black';
      this._context.fillText(
        tickFormat(tick), tickX, this._traceBox.height + this._tickLength);
      prevTickX = tickX;
    }
    this._context.translate(-this._traceBox.x, -this._traceBox.y);
  }
}
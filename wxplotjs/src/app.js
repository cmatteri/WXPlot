const MomentInterval = require('./momentinterval.js');
const Plot = require('./plot.js');
const TraceSelect = require('./traceselect.js');

document.getElementById('plot-hide-controls').addEventListener('click',
  () => {
    const button = document.getElementById('plot-hide-controls');
    button.classList.toggle('pressed');
    button.blur();
    document.getElementById('plot-hideable-controls').classList.toggle(
      'hide-controls');
  }, false);

const timeZone = "America/Los_Angeles";

const interval = new MomentInterval(moment.tz(new Date("1/1/2015"), timeZone),
                              moment.tz(Date.now(), timeZone));
const maxInterval = new MomentInterval(moment.tz(new Date("1/1/2015"),
                                                 timeZone),
                                       moment.tz(Date.now(), timeZone));

const options = {
  legendRoot: d3.select("#plot-legend"),
  timeSpanControlRoot: d3.select("#plot-hideable-controls")
};

const plot = new Plot(
  d3.select("#plot-controls"), d3.select("#plot-canvas-inner"),
  "America/Los_Angeles", "Temperature (F)", 5, interval, maxInterval, options);

new TraceSelect(document.getElementById('plot-trace-select'), plot);
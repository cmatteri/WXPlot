import React from 'react';
import ReactDOM from 'react-dom';

ReactDOM.render(
  <div></div>,
  document.getElementById('react')
);

const MomentInterval = require('./momentinterval.js');
const Plot = require('./plot.js');
const TraceSelect = require('./traceselect.js');
const d3 = window.d3;
const moment = window.moment;

document.getElementById('hide-controls').addEventListener('click',
  () => {
    const button = document.getElementById('hide-controls');
    button.classList.toggle('pressed');
    button.blur();
    document.getElementById('hideable-controls').classList.toggle(
      'hide-controls');
  }, false);

const timeZone = "America/Los_Angeles";

const maxInterval = new MomentInterval(moment.tz(new Date("1/1/2015"),
                                                 timeZone),
                                       moment.tz(Date.now(), timeZone));

const options = {
  legendContainer: d3.select("#legend"),
  timeSpanControlRoot: d3.select("#hideable-controls")
};

const plot = new Plot(
  d3.select("#controls"), d3.select("#canvas-inner"),
  "America/Los_Angeles", "Temperature (F)", 5, maxInterval, maxInterval,
  options);

new TraceSelect(document.getElementById('trace-select'), plot);
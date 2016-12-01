const WXPlot = require('./plot.js');

// The following is a hack to prevent layout changes on Android when the
// keyboard is opened.
const isAndroid = navigator.userAgent.match(/Android/i);
const bodyMargin = parseFloat(getComputedStyle(document.body)['margin']);
const plot = document.getElementById('plot');
let oldInnerWidth;
let oldInnerHeight;
function onResize() {
  if (!isAndroid || window.innerWidth !== oldInnerWidth
      || window.innerHeight > oldInnerHeight) {
    const fixedSize = window.innerWidth > 700 && window.innerHeight > 500;
    if (fixedSize || window.innerHeight > window.innerWidth) {
      plot.className = 'portrait';
    } else {
      plot.className = 'landscape';
    }
    if (fixedSize) {
      plot.style.height = '500px';
    } else {
      plot.style.height = window.innerHeight - 2*bodyMargin + 'px';
    }
  }
  oldInnerWidth = window.innerWidth;
  oldInnerHeight = window.innerHeight;
}
window.addEventListener("resize", onResize, false);
onResize();

// See readme.md for API documentation.
const domain = {
  start: +(new Date("1/1/2015")),
  end: +(new Date("1/1/2016"))
};
const domainExtent = {
  start: +(new Date("1/1/2015")), 
  end: +Date.now()
};

var dataParams = {
  aggregateType: "max",
  url: "/weewx/wxplot_binding/outTemp", 
  archiveIntervalMinutes: 5,
  minDataPoints: 25
};

const wxPlot = new WXPlot(d3.select("#plot-controls"), d3.select("#plot-canvas"), "America/Los_Angeles",
  "Temperature (F)", 5, domain, domainExtent)
    .addTrace(dataParams, "max", "steelblue", [], 0.5);

dataParams.aggregateType = "avg";
wxPlot.addTrace(dataParams, "avg", "steelblue", [], 1.5);

dataParams.aggregateType = "min";
wxPlot.addTrace(dataParams, "min", "steelblue", [], 0.5);
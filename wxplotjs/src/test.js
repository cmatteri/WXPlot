const WXPlot = require('./plot.js');

document.getElementById('plot-hide-controls').addEventListener('click',
  () => {
    const button = document.getElementById('plot-hide-controls');
    button.classList.toggle('pressed');
    button.blur();
    document.getElementById('plot-hideable-controls').classList.toggle(
      'hide-controls');
  }, false);

const plots = {
  tempDew: {
    traces: [{
      displayName: 'Temperature',
      name: 'outTemp'
    },
    {
      displayName: 'Dewpoint',
      name: 'dewpoint'
    }],
    unit: '°F'
  },
  outHumidity: {
    traces: [{
      displayName: 'Humidity',
      name: 'outHumidity'
    }],
    unit: '%'
  },
  barometer: {
    traces: [{
      displayName: 'Pressure',
      name: 'barometer'
    }],
    unit: 'inHg'
  },
  windChillHeatIndex: {
    traces: [{
      displayName: 'Wind Chill',
      name: 'windChill'
    },
    {
      displayName: 'Heat Index',
      name: 'heatIndex'
    }],
    unit: '°F'
  },
  windSpeed: {
    traces: [{
      displayName: 'Wind Speed',
      name: 'windSpeed'
    }],
    unit: 'mph'
  },
  windDir: {
    traces: [{
      displayName: 'Wind Direction',
      name: 'windDir'
    }],
    unit: '°'
  },
    radiation: {
    traces: [{
      displayName: 'Solar Radiation',
      name: 'radiation'
    }],
    unit: 'W/m²'
  }
};

var dataParams = {
  archiveIntervalMinutes: 5,
  minDataPoints: 25
}

function updateTraces(plotKey, showMinMax) {
  let colors = ['steelblue', 'crimson'];
  let color_index = 0;
  plot.removeTraces();
  plot.setYLabel(plots[plotKey].unit);
  let aggregateTypes = showMinMax ? ['max', 'avg', 'min'] : ['avg'];
  for (const trace of plots[plotKey].traces) {
    for (const aggType of aggregateTypes) {
      const URLbase = '/weewx/wxplot_binding/';
      if (plotKey === 'windSpeed' && aggType === 'max') {
        dataParams.url = URLbase + 'windGust'
      } else {
        dataParams.url = URLbase + trace.name;
      }
      dataParams.aggregateType = aggType;
      const traceOptions = {
      };
      plot.addTrace(aggType, trace.displayName, dataParams,
                    colors[color_index], [], aggType === 'avg' ? 1.5 : 0.5,
                    traceOptions);
    }
    color_index++;
  }
  plot.loadTracesAndRedraw();
}

const plotSelect = d3.select("#plot-hideable-controls");
const plotMenu = plotSelect.append('select')
plotMenu.on("change", () => {
  plotKey = plotMenu.node().value;
  updateTraces(plotKey, showMinMax);
});
for (const plotKey in plots) {
  const option = plots[plotKey].traces.map(x => x.displayName).join('/');
  plotMenu.append("option")
      .attr('value', plotKey)
      .text(option);
}

const minMaxCheckbox = plotSelect.append('label')
    .text('Min/Max')
    .append('input')
    .attr('type', 'checkbox')
    .on('change', () => {
      showMinMax = minMaxCheckbox.node().checked;
      updateTraces(plotKey, showMinMax);
    });

let plotKey = plotMenu.node().value;
let showMinMax = minMaxCheckbox.node().checked;

// See readme.md for API documentation.
const domain = {
  start: +(new Date("1/1/2015")),
  end: +Date.now()
};
const domainExtent = {
  start: +(new Date("1/1/2015")), 
  end: +Date.now()
};

const options = {
  legendRoot: d3.select("#plot-legend"),
  timeSpanControlRoot: d3.select("#plot-hideable-controls")
};

const plot = new WXPlot(d3.select("#plot-controls"),
  d3.select("#plot-canvas-inner"), "America/Los_Angeles", "Temperature (F)", 5,
  domain, domainExtent, options);

updateTraces(plotKey, showMinMax);
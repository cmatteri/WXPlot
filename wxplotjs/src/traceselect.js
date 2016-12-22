const MomentInterval = require('./momentinterval.js');

// The possible sets of traces to display on the plot
const traceSets = [
  {
    id: 'tempDew',
    traces: [
      {
        displayName: 'Temperature',
        name: 'outTemp'
      },
      {
        displayName: 'Dewpoint',
        name: 'dewpoint'
      }
    ],
    unit: '°F'
  },
  {
    id: 'outHumidity',
    traces: [
      {
        displayName: 'Humidity',
        name: 'outHumidity'
      }
    ],
    unit: '%'
  },
  {
    id: 'barometer',
    traces: [
      {
        displayName: 'Pressure',
        name: 'barometer'
      }
    ],
    unit: 'inHg'
  },
  {
    id: 'windChillHeatIndex',
    traces: [
      {
        displayName: 'Wind Chill',
        name: 'windChill'
      },
      {
        displayName: 'Heat Index',
        name: 'heatIndex'
      }
    ],
    unit: '°F'
  },
  {
    id: 'windSpeed',
    traces: [
      {
        displayName: 'Wind Speed',
        name: 'windSpeed'
      }
    ],
    unit: 'mph'
  },
  {
    id: 'windDir',
    traces: [
      {
        displayName: 'Wind Direction',
        name: 'windDir'
      }
    ],
    unit: '°'
  },
  {
    id: 'radiation',
    traces: [
      {
        displayName: 'Solar Radiation',
        name: 'radiation'
      }
    ],
    unit: 'W/m²'
  }
];

function getTraceSet(id) {
  return traceSets.filter(traceSet => traceSet.id === id)[0];
}

// Allows the user to select which traces to plot
class TraceSelect {
   /**
   * @param {Node} root - The DOM node controls will be appended to
   * @param {Plot} plot - The plot traces are added to/removed from
   */
  constructor(root, plot) {
    this._plot = plot;
    const select = document.createElement('select');
    root.appendChild(select);
    select.addEventListener('change', () => {
      this._traceSet = getTraceSet(select.value);
      this._updateTraces();
    }, false);

    for (const traceSet of traceSets) {
      const option = document.createElement('option');
      select.appendChild(option);
      option.setAttribute('value', traceSet.id);
      const text = traceSet.traces
        .map(trace => trace.displayName)
        .join('/');
      option.innerText = text;
    }

    const label = document.createElement('label');
    root.appendChild(label);
    label.innerText = 'Min/Max';
    const minMaxCheckbox = document.createElement('input');
    label.appendChild(minMaxCheckbox);
    minMaxCheckbox.setAttribute('type', 'checkbox')
    minMaxCheckbox.addEventListener('change', () => {
      this._showMinMax = minMaxCheckbox.checked;
      this._updateTraces();
    }, false);

    this._traceSet = getTraceSet(select.value);
    this._showMinMax = minMaxCheckbox.checked;
    this._updateTraces();
  }

  // Adds/removes traces from the plot based on the state of the controls
  _updateTraces() {
  const dataParams = {
    archiveIntervalMinutes: 5,
    minDataPoints: 25,
    url: null
  }
  const colors = ['steelblue', 'crimson'];
  let color_index = 0;
  this._plot.removeTraces();
  this._plot.setYLabel(this._traceSet.unit);
  const aggregateTypes = this._showMinMax ? ['max', 'avg', 'min'] : ['avg'];
  for (const trace of this._traceSet.traces) {
    for (const aggType of aggregateTypes) {
      const URLbase = '/weewx/wxplot_binding/';
      if (this._traceSet.id === 'windSpeed' && aggType === 'max') {
        dataParams.url = URLbase + 'windGust'
      } else {
        dataParams.url = URLbase + trace.name;
      }
      dataParams.aggregateType = aggType;
      const traceOptions = {
      };
      this._plot.addTrace(
        aggType, trace.displayName, dataParams, colors[color_index], [],
        aggType === 'avg' ? 1.5 : 0.5, traceOptions);
    }
    color_index++;
  }
  this._plot.loadTracesAndRedraw();
}
}

// jsdoc doesn't work when the export is at the declaration.
module.exports = TraceSelect;
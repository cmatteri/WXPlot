#Overview
WXPlot is an interactive plotting library for weewx. It consists of a JavaScript front end (WXPlotJS) based on canvas and d3.js and a simple RESTful backend (WXPlotFlask) built with flask that uses weewx as a library to perform database queries. It allows easy exploration of a weather station's complete history through panning and zooming.

Data is dynamically loaded from the backend as the plot is panned/zoomed. This allows details to be viewed while zoomed in without performance degrading while zoomed out.

Multiple traces per plot are supported, but currently they must share the same vertical axis. Rain plots are not yet supported, but will be added soon.

Due to the poor support for timezones and local time in Javascript, WXPlot uses Moment.js and Moment Timezone to ensure accurate plotting and labeling regardless of where the plot is viewed or what the time zone of the weather station is. It handles time zone changes and daylight savings time gracefully.

Live demo [here](http://matterivineyards.com/wxplot).

#Installation
##WXPlotJS
WXPlotJS has the following dependencies:

[D3.js (v4)](https://d3js.org/)

[Moment.js](http://momentjs.com/)

[Moment Timezone](http://momentjs.com/timezone/) (with relevant data)

```
cd wxplotjs
npm install
npm build
```

To use WXPlotJS, simply source css/wxplot.css and bin/wxplot.min.js and put ```WXPlot = require('wxplot')``` in your script. View wxplotjs/test/release/index.html for an example which sources all the necessary files, instantiates a plot and adds a few traces.

###Development
A script is included that uses watchify to automatically perform incremental rebuilds whenever one of the source files changes. To use it run ```npm watch``` from the wxplotjs directory. The script produces builds with source maps for easy debugging.

A simple node app is also included that functions as a dev server. To use it run ```node app.js``` in the wxplotjs directory. Then navigate to [http://localhost:3000/dev](). WXPlotFlask must be running for data to load. The dev server also allows release builds to be tested at [http://localhost:3000/release]().

WXPlotJS should work in all modern browsers.

WXPlotJS works with browserify. Copy the wxplotjs folder to the node_modules directory in your project and ```require('wxplotjs')```. Browserify will automatically apply the babelify transform to wxplotjs (due to a key in wxplotjs's package.json).

##WXPlotFlask
Install [weewx](http://weewx.com/).

The weewx database manager class must be slightly modified to work with WXPlotFlask, since WXPlot needs aggregate intervals to be back-to-back in unix time, as opposed to having constant local time boundaries, which is the default in weewx. The included wxplotmanager extension adds an option to _getSqlVectors to allow back-to-back intervals. If the option is not supplied, the behavior is the same as the default manager class. Thus this extension should not affect the behavior of weewx.

WXPlotFlask does not need to use the same weewx installation that is used for archiving data. I plan to run it on a separate server, using mysql replication to get the data from the weather station.

Install wxplotmanager (more information in wxplotflask/wxplotmanager/readme.txt).
```
wee_extension --install=wxplotmanager-0.1.tar.gz
```

Install [flask](http://flask.pocoo.org/).

Modify the paths for the weewx bin directory and weewx.conf file in wxplotflask/run.sh.

Start a dev server with:

```
wxplotflask/run.sh
```

or deploy as a flask app.

#API Reference

<a name="Plot"></a>

## Plot
A weather data plot.

**Kind**: global class  

* [Plot](#Plot)
    * [new Plot(root, timeZone, yLabel, interval, maxInterval, options)](#new_Plot_new)
    * [.setInterval(interval)](#Plot+setInterval)
    * [.setYLabel(label)](#Plot+setYLabel) ⇒ <code>[Plot](#Plot)</code>
    * [.addTrace(dataParams, legendText, color, dash, width)](#Plot+addTrace) ⇒ <code>[Plot](#Plot)</code>
    * [.getTraces()](#Plot+getTraces) ⇒ <code>Array</code>
    * [.removeTrace(legendText)](#Plot+removeTrace) ⇒ <code>[Plot](#Plot)</code>

<a name="new_Plot_new"></a>

### new Plot(root, timeZone, yLabel, interval, maxInterval, options)

| Param | Type | Description |
| --- | --- | --- |
| root | <code>d3.Selection</code> | Selection the plot will be appended to (as a div) |
| timeZone | <code>String</code> | Time zone identifier corresponding to the time zone of the weather station, e.g. 'America/Los_Angeles' |
| yLabel | <code>String</code> | Label for the vertical axis |
| interval | <code>Object</code> | Specifies the initial time interval to display e.g. ```{   start: +(new Date("1/1/2015")),   end: +(new Date("1/1/2016")) };``` |
| interval.start | <code>Number</code> | Unix time of the start of the interval in ms. |
| interval.end | <code>Number</code> | Unix time of the end of the interval in ms. |
| maxInterval | <code>Object</code> | An interval object, with the same structure as the interval parameter, that limits the panning/zooming of the plot. |
| options | <code>Object</code> | Properties of options are optional parameters |
| options.smooth | <code>Boolean</code> | Set to false to not draw smooth traces (by default, WXPlot uses monotone cubic interpolation to produce smooth lines that pass through all data points and do not introduce minima or maxima between points). |

<a name="Plot+setInterval"></a>

### plot.setInterval(interval)
Sets the plot's interval

**Kind**: instance method of <code>[Plot](#Plot)</code>  

| Param | Type | Description |
| --- | --- | --- |
| interval | <code>Object</code> |  |
| interval.start | <code>Number</code> | Unix time of the start of the interval in ms. |
| interval.end | <code>Number</code> | Unix time of the end of the interval in ms. |

<a name="Plot+setYLabel"></a>

### plot.setYLabel(label) ⇒ <code>[Plot](#Plot)</code>
Sets the y-axis label

**Kind**: instance method of <code>[Plot](#Plot)</code>  
**Returns**: <code>[Plot](#Plot)</code> - The object setYLabel was called on  

| Param | Type | Description |
| --- | --- | --- |
| label | <code>String</code> | The new label |

<a name="Plot+addTrace"></a>

### plot.addTrace(dataParams, legendText, color, dash, width) ⇒ <code>[Plot](#Plot)</code>
Adds a new trace

**Kind**: instance method of <code>[Plot](#Plot)</code>  
**Returns**: <code>[Plot](#Plot)</code> - the object addTrace was called on  

| Param | Type | Description |
| --- | --- | --- |
| dataParams | <code>Object</code> | Describes the data for a trace |
| dataParams.aggregateType | <code>String</code> | A weewx aggregate type. e.g. "avg" |
| dataParams.url | <code>String</code> | Must include the location of the backend sever (which must have the same origin as the site serving wxplotjs), and the desired weewx data binding and observation type e.g.  URL-of-server/wxplot_binding/outTemp |
| dataParams.archiveIntervalMinutes | <code>Number</code> | The archive interval (or the maximum archive interval if multiple archive intervals have been used). |
| dataParams.minDataPoints | <code>Number</code> | At least this many data points will always be visible. |
| dataParams.offset | <code>Number</code> | Optional. Shift this trace to the right (forward in time) this many seconds. |
| legendText | <code>String</code> | The text to display in the legend for this trace |
| color | <code>String</code> | The color of the trace. A CSS color value. |
| dash | <code>Array</code> | Specifies the line dash to be passed to [ctx.setLineDash](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setLineDash). Pass an empty array for solid lines |
| width | <code>Number</code> | The width of the trace in px |

<a name="Plot+getTraces"></a>

### plot.getTraces() ⇒ <code>Array</code>
**Kind**: instance method of <code>[Plot](#Plot)</code>  
**Returns**: <code>Array</code> - The legend text of each of the plots traces.  
<a name="Plot+removeTrace"></a>

### plot.removeTrace(legendText) ⇒ <code>[Plot](#Plot)</code>
Removes a trace from the plot

**Kind**: instance method of <code>[Plot](#Plot)</code>  
**Returns**: <code>[Plot](#Plot)</code> - the object removeTrace was called on.  

| Param | Type | Description |
| --- | --- | --- |
| legendText | <code>String</code> | The legend text of the trace to remove (The same string that was passed to addTrace as the legendText parameter when the trace was added). |

Please send questions/comments to chrismatteri@gmail.com.
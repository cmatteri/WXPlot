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
```WXPlot = require('wxplot')```
##WXPlot Class
new WXPlot(*root*, *timeZone*, *yLabel*, *interval*, *maxInterval*, *options*);

**root:**
A D3 selection that the plot will be appended to

**timeZone:**
A [time zone identifier](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) string corresponding to the time zone of the weather station. E.g. "America/Los_Angeles"

**yLabel:**
String label for the vertical axis

**interval:**
An object that specifies the initial time interval to display. It must have start and end properties which are unix times in ms.

```javascript
{
  start: +(new Date("1/1/2015")),
  end: +(new Date("1/1/2016"))
};
```

**maxInterval:**
An interval object, with the same structure as the interval parameter, that limits the panning/zooming of the plot.

**options:**
An object containing optional parameters as properties. Currently the only optional parameter is **smooth**, which may be set to false to cause the plot to not draw a smooth line (by default, WXPlot uses [monotone cubic interpolation](https://en.wikipedia.org/wiki/Monotone_cubic_interpolation) to produce smooth lines that pass through all data points and do not introduce minima or maxima between points).

###Methods
addTrace(*dataParams*, *color*, *dash*, *width*)

**dataParams:** An object describing the data for a trace. Must have the following properties:

- **type:** A weewx archive type. e.g. "outTemp"
- **aggregateType:** A weewx aggregate type. e.g. "avg"
- **url:** Backend URL. Specified per trace to increase flexibility.
- **archiveIntervalMinutes:** The archive interval (or the maximum archive interval if multiple archive intervals have been used).
- **minDataPoints:** At least this many data points will always be visible.

**color:**
The color of the trace. A CSS color value.

**dash:**
An array specifying the line dash to be passed to [ctx.setLineDash](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setLineDash). Pass an empty array for solid lines.

**width:**
The width of the trace in px.

Please send questions/comments to chrismatteri@gmail.com.
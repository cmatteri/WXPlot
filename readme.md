#Overview
WXPlot is an interactive plotting library for weewx. It consists of a JavaScript front end (WXPlotJS) based on canvas and d3.js and a simple RESTful backend (WXPlotFlask) built with flask that uses weewx as a library to perform database queries. It allows easy exploration of a weather station's complete history through panning and zooming.

Data is dynamically loaded from the backend as the plot is panned/zoomed. This allows details to be viewed while zoomed in without performance degrading while zoomed out.

Multiple traces per plot are supported, but currently they must share the same vertical axis. Rain plots are not yet supported, but will be added soon.

Due to the poor support for timezones and local time in Javascript, WXPlot uses Moment.js and Moment Timezone to ensure accurate plotting and labeling regardless of where the plot is viewed or what the time zone of the weather station is. It handles time zone changes and daylight savings time gracefully.

Live demo [here](http://matterivineyards.com/wxplot).

#Installation
Instructions coming soon. If you would like to use WXPlot now please send me an email.

#API Reference

<a name="Plot"></a>

## Plot
A weather data plot.

**Kind**: global class  

* [Plot](#Plot)
    * [new Plot(controlRoot, canvasRoot, timeZone, yLabel, yTickLabelChars, interval, maxInterval, options)](#new_Plot_new)
    * [.setIntervalAnimate(interval)](#Plot+setIntervalAnimate)
    * [.setInterval(interval)](#Plot+setInterval)
    * [.setMaxInterval(interval)](#Plot+setMaxInterval)
    * [.setMinIntervalLength(interval)](#Plot+setMinIntervalLength)
    * [.setYLabel(label)](#Plot+setYLabel) ⇒ <code>[Plot](#Plot)</code>
    * [.addTrace(dataParams, legendText, color, dash, width, options)](#Plot+addTrace) ⇒ <code>[Plot](#Plot)</code>
    * [.loadTracesAndRedraw()](#Plot+loadTracesAndRedraw) ⇒ <code>[Plot](#Plot)</code>
    * [.getTraces()](#Plot+getTraces) ⇒ <code>Array</code>
    * [.removeTraces()](#Plot+removeTraces) ⇒ <code>[Plot](#Plot)</code>

<a name="new_Plot_new"></a>

### new Plot(controlRoot, canvasRoot, timeZone, yLabel, yTickLabelChars, interval, maxInterval, options)

| Param | Type | Description |
| --- | --- | --- |
| controlRoot | <code>d3.Selection</code> | The selection the timespan and interval controls will be appended to (unless options.timeSpanControlRoot) is set. |
| canvasRoot | <code>d3.Selection</code> | The selection the canvas, which contains the axes and traces, will be appended to |
| timeZone | <code>String</code> | Time zone identifier corresponding to the time zone of the weather station, e.g. 'America/Los_Angeles' |
| yLabel | <code>String</code> | Label for the vertical axis |
| yTickLabelChars | <code>Number</code> | The y-axis tick labels will have space for at least this many '0' characters. See the yTicks function comment for details on the formatting of these labels. |
| interval | <code>MomentInterval</code> | Specifies the initial time interval to display. |
| maxInterval | <code>MomentInterval</code> | Specifies the maximum interval the plot can be set to. |
| options | <code>Object</code> | Properties of options are optional parameters |
| options.minIntervalLength | <code>Number</code> | The minimum interval length in ms. Default is one hour. |
| options.smooth | <code>Boolean</code> | Set to false to not draw smooth traces (by default, WXPlot uses monotone cubic interpolation to produce smooth lines that pass through all data points and do not introduce minima or maxima between points). |
| options.legendRoot | <code>d3.Selection</code> | The selection the legend will be appended to. |
| options.timeSpanControlRoot | <code>d3.Selection</code> | The selection the timespan control form will be appended to. |

<a name="Plot+setIntervalAnimate"></a>

### plot.setIntervalAnimate(interval)
Sets the plot's interval with a 500 ms animation between the old and new
intervals.

**Kind**: instance method of <code>[Plot](#Plot)</code>  

| Param | Type |
| --- | --- |
| interval | <code>Interval</code> &#124; <code>MomentInterval</code> | 

<a name="Plot+setInterval"></a>

### plot.setInterval(interval)
Sets the plot's interval

**Kind**: instance method of <code>[Plot](#Plot)</code>  

| Param | Type |
| --- | --- |
| interval | <code>Interval</code> &#124; <code>MomentInterval</code> | 

<a name="Plot+setMaxInterval"></a>

### plot.setMaxInterval(interval)
Sets the plot's maximum interval

**Kind**: instance method of <code>[Plot](#Plot)</code>  

| Param | Type |
| --- | --- |
| interval | <code>Interval</code> &#124; <code>MomentInterval</code> | 

<a name="Plot+setMinIntervalLength"></a>

### plot.setMinIntervalLength(interval)
Sets the plot's minimum interval length

**Kind**: instance method of <code>[Plot](#Plot)</code>  

| Param | Type |
| --- | --- |
| interval | <code>Interval</code> &#124; <code>MomentInterval</code> | 

<a name="Plot+setYLabel"></a>

### plot.setYLabel(label) ⇒ <code>[Plot](#Plot)</code>
Sets the y-axis label

**Kind**: instance method of <code>[Plot](#Plot)</code>  
**Returns**: <code>[Plot](#Plot)</code> - The object setYLabel was called on  

| Param | Type | Description |
| --- | --- | --- |
| label | <code>String</code> | The new label |

<a name="Plot+addTrace"></a>

### plot.addTrace(dataParams, legendText, color, dash, width, options) ⇒ <code>[Plot](#Plot)</code>
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
| options | <code>Object</code> | Properties of options are optional parameters |
| options.group | <code>String</code> | The trace group. Traces are sorted by group in the legend. |

<a name="Plot+loadTracesAndRedraw"></a>

### plot.loadTracesAndRedraw() ⇒ <code>[Plot](#Plot)</code>
Loads data for newly added traces and redraws the plot once all data has
loaded.

**Kind**: instance method of <code>[Plot](#Plot)</code>  
**Returns**: <code>[Plot](#Plot)</code> - the object loadTracesAndRedraw was called on.  
<a name="Plot+getTraces"></a>

### plot.getTraces() ⇒ <code>Array</code>
**Kind**: instance method of <code>[Plot](#Plot)</code>  
**Returns**: <code>Array</code> - The legend text of each of the plots traces.  
<a name="Plot+removeTraces"></a>

### plot.removeTraces() ⇒ <code>[Plot](#Plot)</code>
Removes all traces from the plot.

**Kind**: instance method of <code>[Plot](#Plot)</code>  
**Returns**: <code>[Plot](#Plot)</code> - the object removeTrace was called on.

<a name="MomentInterval"></a>

## MomentInterval
**Kind**: global class  
<a name="new_MomentInterval_new"></a>

### new MomentInterval(start, end)

| Param | Type | Description |
| --- | --- | --- |
| start | <code>Moment</code> | Moment representing the start of the interval. |
| end | <code>Moment</code> | Moment representing the end of the interval. |

Please send questions/comments to chrismatteri@gmail.com.
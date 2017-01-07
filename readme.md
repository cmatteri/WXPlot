#Overview
WXPlot is an interactive plotting library for weewx. It consists of a JavaScript front end (WXPlotJS) based on canvas and d3.js and a simple RESTful backend (WXPlotFlask) built with flask that uses weewx as a library to perform database queries. It allows easy exploration of a weather station's complete history through panning and zooming.

Data is dynamically loaded from the backend as the plot is panned/zoomed. This allows details to be viewed while zoomed in without performance degrading while zoomed out.

Multiple traces per plot are supported, but currently they must share the same vertical axis. Rain plots are not yet supported, but will be added soon.

Due to the poor support for timezones and local time in Javascript, WXPlot uses Moment.js and Moment Timezone to ensure accurate plotting and labeling regardless of where the plot is viewed or what the time zone of the weather station is. It handles time zone changes and daylight savings time gracefully.

Live demo [here](http://matterivineyards.com/wxplot).

WXPlot is being transformed into a React app to standardize and simplify the code.

#Installation
```
git clone https://github.com/cmatteri/WXPlot.git
cd WXPlot
# These should point to your weewx installation's bin directory and weewx.conf.
weewx_bin="/home/chris/git/weewx-3.5.0/bin/"
weewx_conf="/home/chris/git/weewx-3.5.0/weewx.conf"
./run.sh "$weewx_bin" "$weewx_conf"

# In a new tab (assumes we're starting in the WXPlot directory):
cd wxplotjs
npm start
```
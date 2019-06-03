# Overview

WXPlot is an interactive plotting library for Weewx. It consists of a JavaScript front end (WXPlotJS) based on canvas and d3.js and a simple RESTful backend (WXPlotFlask) built with flask that uses Weewx as a library to perform database queries. It allows easy exploration of a weather station's complete history through panning and zooming.

Data is dynamically loaded from the backend as the plot is panned/zoomed. This allows details to be viewed while zoomed in without performance degrading while zoomed out.

Multiple traces per plot are supported, but currently they must share the same vertical axis. Rain plots are not yet supported, but will be added soon.

Due to the poor support for timezones and local time in Javascript, WXPlot uses Moment.js and Moment Timezone to ensure accurate plotting and labeling regardless of where the plot is viewed or what the time zone of the weather station is. It handles time zone changes and daylight savings time gracefully.

Live demo [here](http://matterivineyards.com/wxplot).

WXPlotJS is being transformed into a React app to standardize and simplify the code.

# Development

## wxplotflask

Install Weewx locally. Install dependencies in a virtualenv rather than installing them globally (the same virtualenv will be used for wxplotflask), configure it with the simulator weather station, and start it to generate some test data.

Install the wxplotmanager extension (follow the manual installation steps in `wxplotflask/wxplotmanager/readme.txt`).

Install additional dependencies for wxplotflask in the virtualenv:

```
pip install flask
pip install python-dateutil
pip install pillow
```

Start wxplotflask:

```
Weewx_bin="/Users/chris/Weewx-3.9.1/bin"
Weewx_conf="/Users/chris/Weewx-3.9.1/Weewx.conf"
PYTHONPATH="$Weewx_bin" wxplotflask/main.py "$Weewx_conf"
```

## wxplotjs (requires wxplotflask)

```
cd wxplotjs
yarn
yarn start
```

With wxplotflask installed and running as described above, data should appear when zoomed in to the present time.

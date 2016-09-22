#!/usr/bin/env python2

from flask import Flask
from flask import request

from configobj import ConfigObj

import datetime
import dateutil.parser
import dateutil.tz
import time

import json
import sys
import syslog
import threading
import math

import weewx
import weewx.manager
from weewx.engine import StdService

import weeplot.utilities

app = Flask(__name__)

config_dict = ConfigObj(sys.argv[1])

def iso8601_to_unix_time(date):
    """Input is in UTC."""
    dt = dateutil.parser.parse(date)
    # We may use naive datetime objects because we have UTC times.
    delta = dt - datetime.datetime(1970, 1, 1, tzinfo=dateutil.tz.tzutc())
    return delta.total_seconds()

@app.route('/<data_binding>/<wx_observation>')
def hello_world(data_binding, wx_observation):
    start = iso8601_to_unix_time(request.args.get('start'))
    end = iso8601_to_unix_time(request.args.get('end'))

    aggregate_interval = int(request.args.get('aggregateInterval'))

    with weewx.manager.DBBinder(config_dict) as db_binder:
        # Note: The manager does not need to closed explicitly because the DBBinder
        # will 
        archive = db_binder.get_manager(data_binding)
    
        (start_vec_t, stop_vec_t, data_vec_t) = \
            archive._getSqlVectors((start, end), wx_observation,
            aggregate_type=request.args.get('aggregateType'),
            aggregate_interval=aggregate_interval, unix_time_intervals=True)
                
        # To reduce data size, the data returned by this server does not include
        # timestamps. Rather, it only includes values. The values must correspond
        # to consecutive aggregate intervals, with no gaps, but the data returned
        # by _getSqlVectors may contain gaps. Thus we must iterate through the data
        # and insert None values for intervals that don't have data. Note that the
        # length of the returned value array may be less than the number of aggregate
        # intervals between start and end if there is no data for all the tail
        # intervals. The client assumes that the values start at the start time and
        # will handle short value arrays correctly.
    
        values = []
        t = start
        for interval_start, value in zip(start_vec_t[0], data_vec_t[0]):
            while t < interval_start:
                values.append(None)
                t += aggregate_interval
            values.append(round(value, 2))
            t += aggregate_interval
        
        data = {
            'values': values,
            'unit': data_vec_t[1]
        }
        return json.dumps(data)

@app.route('/test')
def myfunc():
    return "wxplotflask"

app.run(debug=False)
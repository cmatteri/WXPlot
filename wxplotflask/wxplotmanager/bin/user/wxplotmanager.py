#
#    Copyright (c) 2009-2015 Tom Keffer <tkeffer@gmail.com>
#
#    See the file LICENSE.txt for your full rights.
#

from weewx.units import ValueTuple
import weewx.units
import weewx.wxmanager
import weeutil.weeutil

#==============================================================================
#                         class WXPlotManager
#==============================================================================

class WXPlotManager(weewx.wxmanager.WXDaySummaryManager):
    """Modified manager for making plots with unix time axes.

    Can optionally use a sequence of time intervals with constant length and
    constant period (back-to-back in unix time), as opposed to constant local
    time boundaries.
    """
    def _getSqlVectors(self, timespan, sql_type, 
                      aggregate_type=None,
                      aggregate_interval=None,
                      unix_time_intervals=False): 
        """Get time and (possibly aggregated) data vectors within a time
        interval. 
        
        timespan: The timespan over which the aggregation is to be done.
        
        sql_type: The observation type to be retrieved. The type should be one
        of the columns in the archive database.
        
        aggregate_type: None if no aggregation is desired, otherwise the type
        of aggregation (e.g., 'sum', 'avg', etc.)  Default: None (no aggregation)
        
        aggregate_interval: None if no aggregation is desired, otherwise
        this is the time interval over which a result will be aggregated.
        Required if aggregate_type is non-None. 
        Default: None (no aggregation)

        unix_time_intervals: If true use a sequence of time intervals with
        constant length and constant period. Otherwise use the same constant
        local time boundary intervals as the default managers.

        returns: a 3-way tuple of value tuples:
          (start_vec, stop_vec, data_vec)
        The first element holds a ValueTuple with the start times of the aggregation interval.
        The second element holds a ValueTuple with the stop times of the aggregation interval.
        The third element holds a ValueTuple with the data aggregation over the interval.

        If aggregation is desired (aggregate_interval is not None), then each
        element represents a time interval exclusive on the left, inclusive on
        the right. The time elements will all fall on the same local time
        boundary as startstamp. 

        For example, if the starting time in the timespan is 8-Mar-2009 18:00
        and aggregate_interval is 10800 (3 hours), then the returned time vector
        will be (shown in local times):
        
        8-Mar-2009 21:00
        9-Mar-2009 00:00
        9-Mar-2009 03:00
        9-Mar-2009 06:00 etc.
        
        Note that DST happens at 02:00 on 9-Mar, so the actual time deltas
        between the elements is 3 hours between times #1 and #2, but only 2
        hours between #2 and #3.
        
        NB: there is an algorithmic assumption here that the archive time
        interval is a constant.
        
        There is another assumption that the unit type does not change within
        a time interval.

        See the file weewx.units for the definition of a ValueTuple.
        """

        startstamp, stopstamp = timespan
        start_vec = list()
        stop_vec  = list()
        data_vec  = list()
        std_unit_system = None

        _cursor=self.connection.cursor()
        try:
    
            if aggregate_type :
                
                # Check to make sure we have everything:
                if not aggregate_interval:
                    raise weewx.ViolatedPrecondition("Aggregation interval missing")

                if aggregate_type.lower() == 'last':
                    sql_str = "SELECT %s, MIN(usUnits), MAX(usUnits) FROM %s WHERE dateTime = "\
                        "(SELECT MAX(dateTime) FROM %s WHERE "\
                        "dateTime > ? AND dateTime <= ? AND %s IS NOT NULL)" % (sql_type, self.table_name, 
                                                                                self.table_name, sql_type)
                else:
                    sql_str = "SELECT %s(%s), MIN(usUnits), MAX(usUnits) FROM %s "\
                        "WHERE dateTime > ? AND dateTime <= ?" % (aggregate_type, sql_type, self.table_name)

                if unix_time_intervals:
                    interval_gen = (weeutil.weeutil.TimeSpan(time, time+aggregate_interval)
                        for time in xrange(int(startstamp), int(stopstamp), int(aggregate_interval)))
                else:
                    interval_gen = weeutil.weeutil.intervalgen(startstamp, stopstamp, aggregate_interval)

                for stamp in interval_gen:
                    _cursor.execute(sql_str, stamp)
                    _rec = _cursor.fetchone()
                    # Don't accumulate any results where there wasn't a record
                    # (signified by a null result)
                    if _rec and _rec[0] is not None:
                        if std_unit_system:
                            if not (std_unit_system == _rec[1] == _rec[2]):
                                raise weewx.UnsupportedFeature("Unit type cannot change "\
                                                               "within a time interval (%s vs %s vs %s)." %
                                                               (std_unit_system, _rec[1], _rec[2]))
                        else:
                            std_unit_system = _rec[1]
                        start_vec.append(stamp.start)
                        stop_vec.append(stamp.stop)
                        data_vec.append(_rec[0])
            else:
                # No aggregation
                sql_str = "SELECT dateTime, %s, usUnits, `interval` FROM %s "\
                            "WHERE dateTime >= ? AND dateTime <= ?" % (sql_type, self.table_name)
                for _rec in _cursor.execute(sql_str, (startstamp, stopstamp)):
                    start_vec.append(_rec[0] - _rec[3])
                    stop_vec.append(_rec[0])
                    if std_unit_system:
                        if std_unit_system != _rec[2]:
                            raise weewx.UnsupportedFeature("Unit type cannot change "\
                                                           "within a time interval.")
                    else:
                        std_unit_system = _rec[2]
                    data_vec.append(_rec[1])
        finally:
            _cursor.close()

        (time_type, time_group) = weewx.units.getStandardUnitType(std_unit_system, 'dateTime')
        (data_type, data_group) = weewx.units.getStandardUnitType(std_unit_system, sql_type, aggregate_type)
        return (ValueTuple(start_vec, time_type, time_group),
                ValueTuple(stop_vec, time_type, time_group), 
                ValueTuple(data_vec, data_type, data_group))
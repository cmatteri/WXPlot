Installation instructions:

1) Run the installer:

wee_extension --install=wxplotmanager-0.1.tar.gz

Manual installation instructions:

1) Copy files to the weewx user directory:

# See http://weewx.com/docs/usersguide.htm#Where_to_find_things
# for location of BIN_ROOT

tar xf wxplotmanager-0.1.tar.gz
cp wxplotmanager/bin/user/wxplotmanager.py BIN_ROOT/user

2) Add a data binding in weewx.conf:

[DataBindings]
    [[wxplot_binding]]
        manager = user.wxplotmanager.WXPlotManager
        table_name = archive
        database = archive_sqlite

3) Specify the data binding for WXPlot in weewx.conf:

[WXPlot]
    data_binding = wxplot_binding
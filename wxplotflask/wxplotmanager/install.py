from setup import ExtensionInstaller

def loader():
    return WXPlotManagerInstaller()

class WXPlotManagerInstaller(ExtensionInstaller):
    def __init__(self):
        super(WXPlotManagerInstaller, self).__init__(
            version="0.1",
            name='wxplotmanager',
            description='Modified manager for making plots with unix time axes',
            author="Chris Matteri",
            author_email="chrismatteri@gmail.com",
            config={
                'WXPlot': {
                    'data_binding': 'wxplot_binding'
                },
                'DataBindings': {
                    'wxplot_binding': {
                        'database': 'archive_sqlite',
                        'table_name': 'archive',
                        'manager': 'user.wxplotmanager.WXPlotManager'
                    }
                }
            },
            files=[('bin/user', ['bin/user/wxplotmanager.py'])]
            )

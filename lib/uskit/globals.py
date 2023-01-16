import os
import __main__


##############################################################################
# GLOBALS

SCRIPTPATH = os.path.abspath(__main__.__file__ if hasattr(__main__, "__file__") else ".")
SCRIPTDIR = os.path.dirname(SCRIPTPATH)
MODULEPATH = os.path.abspath(__file__)
MODULEDIR = os.path.dirname(MODULEPATH)


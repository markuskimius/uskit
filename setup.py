#!/usr/bin/env python3

import os
import sys
from setuptools import setup, find_packages

SCRIPTDIR = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPTDIR, "lib")))

import uskit

with open(os.path.join(SCRIPTDIR, "README.md"), encoding="utf-8") as f:
    long_description = f.read()

setup(
                             name = uskit.__name__,
                      description = "A microservices kit",
                          version = uskit.__version__,
                          license = uskit.__license__,
                           author = uskit.__author__,
                     author_email = "markuskimius+py@gmail.com",
                              url = "https://github.com/markuskimius/uskit",
                         keywords = [ "microservice", "framework" ],
                 long_description = long_description,
    long_description_content_type = "text/markdown",
                         packages = find_packages("lib"),
                      package_dir = { "": "lib" },
             include_package_data = True,
                 install_requires = [ "tornado", "aiosqlite" ],
)

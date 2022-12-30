#!/usr/bin/env python3

from setuptools import setup, find_packages
from glob import glob
from os import path

SCRIPTDIR = path.abspath(path.dirname(__file__))

with open(path.join(SCRIPTDIR, "README.md"), encoding="utf-8") as f:
    long_description = f.read()

setup(
                             name = "uskit",
                      description = "A microservices kit",
                          version = "0.0.1",
                          license = "Apache 2.0",
                           author = "Mark Kim",
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

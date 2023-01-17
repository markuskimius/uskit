import os
import sys
import sphinx.errors

sys.path.insert(0, os.path.abspath(os.path.join("..", "lib")))

import uskit

project = uskit.__name__
author = uskit.__author__
version = uskit.__version__
release = uskit.__version__
copyright = uskit.__copyright__

extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.doctest",
    "sphinx_js",
]

js_source_path = os.path.join("..", "lib", "uskit", "ustatic")

if not os.environ.get("READTHEDOCS", None):
    import sphinx_rtd_theme

    html_theme = "sphinx_rtd_theme"
    html_theme_path = [sphinx_rtd_theme.get_html_theme_path()]


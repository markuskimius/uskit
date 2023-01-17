import os
import uskit
import sphinx.errors

project = "uskit"
author = uskit.__author__
version = uskit.__version__
release = uskit.__version__
copyright = uskit.__copyright__

extensions = [
    "sphinx.ext.autodoc",
#    "sphinx.ext.coverage",
    "sphinx.ext.doctest",
#    "sphinx.ext.intersphinx",
#    "sphinx.ext.viewcode",
    "sphinx_js",
]

js_source_path = "../lib/uskit/ustatic"

if not os.environ.get("READTHEDOCS", None):
    import sphinx_rtd_theme

    html_theme = "sphinx_rtd_theme"
    html_theme_path = [sphinx_rtd_theme.get_html_theme_path()]


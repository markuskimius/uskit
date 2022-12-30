import sys
import inspect


##############################################################################
# GLOBALS

DEBUG_LEVEL = {
    "ERROR"    : True,
    "WARNING"  : True,
    "INFO"     : True,
    "TRACE"    : True,
    "SOCKET"   : True,
    "DEBUG"    : True,
    "DATABASE" : False,
};


##############################################################################
# FUNCTIONS

def log(level, *args, **kwargs):
    if DEBUG_LEVEL.get(level):
        print(f"[{level}]", *args, file=sys.stderr, **kwargs)

def info(*args, **kwargs):
    log("INFO", *args, **kwargs)

def socket(*args, **kwargs):
    log("SOCKET", *args, **kwargs)

def database(*args, **kwargs):
    log("DATABASE", *args, **kwargs)

def debug(*args, **kwargs):
    stack = ""

    for frame in inspect.stack()[1:]:
        filepath = frame[1]
        lineno = frame[2]
        func = frame[3]

        stack += f"\n    at {filepath} line {lineno} in {func}()"

    log("DEBUG", *args, stack, **kwargs)

def trace(*args, **kwargs):
    frame = inspect.stack()[1]
    filepath = frame[1]
    lineno = frame[2]
    func = frame[3]

    log("TRACE", *args, f"at {filepath} line {lineno} in {func}()", **kwargs)

def warning(*args, **kwargs):
    if sys.stderr.isatty():
        sys.stderr.write("\033[1;33m")

    log("WARNING", *args, **kwargs)

    if sys.stderr.isatty():
        sys.stderr.write("\33[0m")

def error(*args, **kwargs):
    if sys.stderr.isatty():
        sys.stderr.write("\033[1;31m")

    log("ERROR", *args, **kwargs)

    if sys.stderr.isatty():
        sys.stderr.write("\33[0m")


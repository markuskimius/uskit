import sys
import inspect


##############################################################################
# GLOBALS

DEBUG_LEVEL = {
    "INFO"     : True,
    "TRACE"    : True,
    "WARNING"  : True,
    "ERROR"    : True,
    "DEBUG"    : True,
    "EVENT"    : False,
    "SOCKET"   : True,
    "DATABASE" : False,
};


##############################################################################
# FUNCTIONS

def log(level, *args, **kwargs):
    if DEBUG_LEVEL.get(level):
        color = kwargs.get("color")
        stack = kwargs.get("stack")

        # Stackframe
        if stack:
            args = list(args)
            frames = []

            if stack == 1 : depth = 3     # 1 depth
            else          : depth = None  # Infinite depth

            for frame in inspect.stack()[2:depth]:
                filepath = frame[1]
                lineno = frame[2]
                func = frame[3]
                frames += [f"at {filepath} line {lineno} in {func}()"]

            if stack == 1 : args += frames
            else          : args += ["\n    ".join(frames)]

        # Color on
        if sys.stderr.isatty() and color is not None:
            sys.stderr.write(f"\033[1;{color}m")

        print(f"[{level}]", *args, file=sys.stderr)

        # Color off
        if sys.stderr.isatty() and color is not None:
            sys.stderr.write("\33[0m")

def info(*args, **kwargs):
    log("INFO", *args, **kwargs)

def trace(*args, **kwargs):
    log("TRACE", *args, stack=1, **kwargs)

def warning(*args, **kwargs):
    log("WARNING", *args, color=33, **kwargs)

def error(*args, **kwargs):
    log("ERROR", *args, color=31, **kwargs)

def debug(*args, **kwargs):
    log("DEBUG", *args, color=33, stack=2, **kwargs)

def event(*args, **kwargs):
    log("EVENT", *args, color=35, stack=2, **kwargs)

def socket(*args, **kwargs):
    log("SOCKET", *args, **kwargs)

def database(*args, **kwargs):
    log("DATABASE", *args, **kwargs)


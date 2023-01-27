from . import debug


##############################################################################
# EXPRESSION

class Expression:
    """
        At the moment we only support accessing attributes of an object.
    """

    def __init__(self, expr):
        self.ast = expr.strip().split(".")

    def __call__(self, **kwargs):
        value = kwargs

        try:
            for name in self.ast:
                value = value.get(name)
        except:
            debug.debug(f"Field does not exist: {'.'.join(self.ast)} in {kwargs}")

        return value


##############################################################################
# TEST CODE

if __name__ == "__main__":
    mydict = {
        "subdict" : {
            "myvalue" : "Hello, world!",
        },
    }

    expr = Expression("mydict.subdict.myvalue")
    value = expr.eval(mydict=mydict)

    print(value)

